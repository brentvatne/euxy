/**
 * Timing engine — the critical-path spine. A plain module (NOT a React
 * component, OFF the render path) implementing a lookahead scheduler at 24 PPQN.
 *
 * Model (Chris Wilson "two clocks"): a ~25ms interval looks ~100ms ahead and
 * hands the MidiPort each tick/note with an exact future timestamp; JS-timer
 * jitter never reaches MIDI output. The playhead is pushed to Reanimated shared
 * values (see playhead.ts) so nothing re-renders on the tick.
 *
 * State: read `useStore.getState()` FRESH each tick — editing a lane mid-play
 * takes effect on the next tick with no re-sync (see README "Performance").
 *
 * Clock modes:
 *  - Jam: the app is clock master. It advances the global tick from its own
 *    tempo and sends 0xF8 clock + Start/Stop + lane notes.
 *  - Record: the app is a slave. It advances the tick from inbound 0xF8, resets
 *    to 0 on inbound Start, and halts on Stop. No app-side transport.
 *
 * Panic: CC120 (All Sound Off) + CC123 (All Notes Off) on active channels, plus
 * explicit note-offs for every outstanding note.
 */
import { laneStepAt } from '@/core/euclid';
import { createMidiPort } from '@/midi/port';
import type { InboundEvent, MidiPort } from '@/midi/types';
import { laneAudible, patternForLane, selectActivePattern } from '@/state/selectors';
import { useStore } from '@/state/store';
import { timing } from '@/theme/tokens';
import { setPlayhead } from './playhead';

const PPQN = timing.ppqn; // 24

/** High-resolution clock shared with the MidiPort timestamp domain. */
const now = (): number =>
  typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();

const msPerTickAt = (bpm: number): number => 60000 / (Math.max(1, bpm) * PPQN);

const noteKey = (channel: number, note: number) => `${channel}:${note}`;

class Engine {
  private port: MidiPort | null = null;
  private initialized = false;

  private running = false;
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Integer index of the next tick to schedule, and its absolute time (ms). */
  private nextScheduleTick = 0;
  private nextTickTimeMs = 0;
  /** Fractional "playing now" tick, for the playhead + query. */
  private currentTick = 0;

  /** Outstanding notes (for panic + note-off bookkeeping). */
  private active = new Map<string, { note: number; channel: number; timer: ReturnType<typeof setTimeout> }>();

  private unsubscribeInbound: (() => void) | null = null;
  private storeSubscribed = false;
  private lastPlaying = false;
  private lastMode: 'jam' | 'record' = 'jam';

  // ---- lifecycle --------------------------------------------------------

  /** Idempotent: create + init the port, wire inbound (record) + store. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.port = createMidiPort();
    // init() may be async on a real port; the stub resolves immediately. We
    // don't await — sending to an uninitialized/absent output is a safe no-op.
    void this.port.init?.();
    this.unsubscribeInbound = this.port.onInbound((e) => this.onInbound(e));
    this.subscribeStore();
  }

  getPort(): MidiPort {
    this.init();
    return this.port!;
  }

  isRunning(): boolean {
    return this.running;
  }

  /** The tick currently sounding (fractional). Cheap synchronous read. */
  getCurrentTick(): number {
    return this.currentTick;
  }

  // ---- store wiring -----------------------------------------------------

  /** Drive start/stop/mode from the Zustand transport, off the render path. */
  private subscribeStore(): void {
    if (this.storeSubscribed) return;
    this.storeSubscribed = true;
    const t0 = useStore.getState().transport;
    this.lastPlaying = t0.playing;
    this.lastMode = t0.clockMode;
    useStore.subscribe((state) => {
      const { playing, clockMode } = state.transport;
      if (clockMode !== this.lastMode) {
        this.lastMode = clockMode;
        // Switching modes must never hang a note.
        this.panic();
        // Restart in the new mode if we were playing.
        if (this.running) {
          this.stop();
          if (playing) this.start();
        }
      }
      if (playing !== this.lastPlaying) {
        this.lastPlaying = playing;
        if (playing) this.start();
        else this.stop();
      }
    });
  }

  // ---- transport --------------------------------------------------------

  start(): void {
    this.init();
    if (this.running) return;
    const s = useStore.getState();
    const port = this.port!;
    port.setLatencyOffsetMs(s.settings.latencyOffsetMs);

    this.running = true;
    this.nextScheduleTick = 0;
    this.nextTickTimeMs = now();
    this.currentTick = 0;
    setPlayhead(0, true);

    if (s.transport.clockMode === 'jam') {
      port.sendStart();
      // Kick the loop immediately, then on the scheduler interval.
      this.tickLoop();
      this.timer = setInterval(() => this.tickLoop(), timing.schedulerIntervalMs);
      log('start jam', `bpm=${s.transport.bpm}`);
    } else {
      // Record: slave to the device clock — wait for inbound 0xF8 / Start.
      log('start record', 'waiting for device clock');
    }
  }

  stop(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const wasRunning = this.running;
    this.running = false;
    const s = useStore.getState();
    if (wasRunning && s.transport.clockMode === 'jam' && this.port) {
      this.port.sendStop();
    }
    this.panic();
    setPlayhead(0, false);
    this.currentTick = 0;
    if (wasRunning) log('stop', '');
  }

  /** CC120 + CC123 on active channels + explicit note-offs for outstanding. */
  panic(): void {
    const port = this.port;
    if (!port) return;
    // Explicit note-offs for everything still sounding.
    for (const [, n] of this.active) {
      port.sendNoteOff(n.note, n.channel);
      clearTimeout(n.timer);
    }
    this.active.clear();
    // All Sound Off + All Notes Off on every channel that could be in use.
    const channels = new Set<number>();
    const pattern = selectActivePattern(useStore.getState());
    pattern?.lanes.forEach((l) => channels.add(l.channel & 0x0f));
    if (channels.size === 0) channels.add(0);
    channels.forEach((ch) => port.allNotesOff(ch));
    log('panic', `channels=${[...channels].join(',')}`);
  }

  // ---- jam scheduling ---------------------------------------------------

  private tickLoop(): void {
    if (!this.running || !this.port) return;
    const t = now();
    const horizon = t + timing.lookaheadMs;
    // Schedule every tick whose time falls inside the lookahead window.
    // Recompute msPerTick per tick so a mid-play tempo change is honored.
    while (this.nextTickTimeMs < horizon) {
      const bpm = useStore.getState().transport.bpm;
      const dt = msPerTickAt(bpm);
      this.scheduleTick(this.nextScheduleTick, this.nextTickTimeMs);
      this.nextScheduleTick += 1;
      this.nextTickTimeMs += dt;
    }
    // Advance the "playing now" tick for the playhead (behind the schedule
    // cursor by whatever is still buffered ahead of the audible present).
    const bpm = useStore.getState().transport.bpm;
    const buffered = (this.nextTickTimeMs - t) / msPerTickAt(bpm);
    this.currentTick = Math.max(0, this.nextScheduleTick - buffered);
    setPlayhead(this.currentTick, true);
  }

  /** Emit clock + any lane note-ons/offs due at this tick. Reads state FRESH. */
  private scheduleTick(tick: number, timeMs: number): void {
    const port = this.port!;
    const s = useStore.getState();
    const pattern = selectActivePattern(s);
    if (!pattern) return;

    if (s.transport.clockMode === 'jam') port.sendClock(timeMs);

    const anySolo = pattern.lanes.some((l) => l.solo);
    for (const lane of pattern.lanes) {
      if (lane.resolutionTicks <= 0 || lane.length <= 0) continue;
      // A lane only advances a step on its own resolution boundary.
      if (tick % lane.resolutionTicks !== 0) continue;
      if (!laneAudible(lane, anySolo)) continue;
      const step = laneStepAt(tick, lane.resolutionTicks, lane.length);
      const pat = patternForLane(lane);
      if (!pat[step]) continue;
      this.fireNote(lane.note, lane.velocity, lane.channel, lane.gateMs, timeMs, tick);
    }
  }

  private fireNote(
    note: number,
    velocity: number,
    channel: number,
    gateMs: number,
    timeMs: number,
    tick: number,
  ): void {
    const port = this.port!;
    port.sendNoteOn(note, velocity, channel, timeMs);
    const offAt = timeMs + Math.max(1, gateMs);
    port.sendNoteOff(note, channel, offAt);
    // Bookkeep the outstanding note so panic can force it off; clear it when
    // the gate elapses (relative to real now, not the scheduled timestamp).
    const key = noteKey(channel, note);
    const existing = this.active.get(key);
    if (existing) clearTimeout(existing.timer);
    const delay = Math.max(0, offAt - now());
    const timer = setTimeout(() => this.active.delete(key), delay);
    this.active.set(key, { note, channel, timer });
    log('note', `t=${tick} ch=${channel + 1} n=${note} v=${velocity} @${timeMs.toFixed(1)}`);
  }

  // ---- record (device clock master) -------------------------------------

  private onInbound(e: InboundEvent): void {
    const mode = useStore.getState().transport.clockMode;
    if (mode !== 'record') return;
    switch (e.type) {
      case 'start':
        this.running = true;
        this.nextScheduleTick = 0;
        this.currentTick = 0;
        setPlayhead(0, true);
        log('rec start', '');
        break;
      case 'continue':
        this.running = true;
        setPlayhead(this.currentTick, true);
        break;
      case 'stop':
        this.running = false;
        this.panic();
        setPlayhead(this.currentTick, false);
        log('rec stop', '');
        break;
      case 'clock': {
        if (!this.running) return;
        const tick = this.nextScheduleTick;
        this.scheduleTick(tick, now());
        this.nextScheduleTick += 1;
        this.currentTick = tick;
        setPlayhead(tick, true);
        break;
      }
    }
  }
}

const DEBUG = true;
function log(evt: string, detail: string) {
  if (DEBUG) console.log(`[engine] ${evt} ${detail}`);
}

/** The single engine instance the whole app shares. */
export const engine = new Engine();
