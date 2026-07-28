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
import { midiOut } from '@/components/midi/runtime';
import type { InboundEvent, MidiPort } from '@/midi/types';
import { laneAudible, patternForLane, selectActivePattern } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { ClockMode, Pattern } from '@/state/types';
import { timing } from '@/theme/tokens';
import { setPlayhead } from './playhead';

const PPQN = timing.ppqn; // 24

/** Tempo window: 48 ticks = 2 beats (~1s at 120 BPM) — steady but responsive. */
const TEMPO_WINDOW_TICKS = 48;
/** Don't report until half a beat has been observed (avoids a wild first read). */
const TEMPO_MIN_TICKS = 13;

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
  /** Where the next start() resumes from — pause holds it, stop zeroes it. */
  private resumeTick = 0;

  /** Outstanding notes (for panic + note-off bookkeeping). */
  private active = new Map<string, { note: number; channel: number; timer: ReturnType<typeof setTimeout> }>();

  private unsubscribeInbound: (() => void) | null = null;
  private storeSubscribed = false;
  private lastPlaying = false;
  private lastMode: 'jam' | 'record' = 'jam';

  /**
   * Inbound-clock tempo measurement (record mode): a rolling window of clock
   * arrival stamps, BPM = ticks spanned / elapsed time across the window.
   *
   * The previous per-interval EMA read 120 BPM as ~226 on hardware. Cause:
   * it stamped ticks at JS fan-out time, and whenever the JS thread stalls
   * (React commits, bridge congestion) the queued ticks flush together with
   * ~0ms spacing — each burst drags the EMA far below the true interval and
   * recurring stalls keep it there (~2× BPM). The fix is twofold: stamps come
   * from the port's wire-arrival clock (InboundEvent.time — the CoreMIDI read
   * callback, immune to JS scheduling), and the estimator is a window whose
   * value depends only on its endpoints, so intra-window burstiness cancels.
   * CoreMIDI-level coalescing (several 0xF8 sharing one packet stamp) can
   * still smear an endpoint by up to a tick, so estimates only anchor on
   * packet-LEADING ticks (stamp strictly newer than the tick before).
   */
  private clockStamps: number[] = [];
  private lastBpmPushMs = 0;

  /** Clock ticks left to swallow for the device's record count-in. */
  private countInTicksRemaining = 0;

  /**
   * Share-link PREVIEW: a pattern the scheduler sounds INSTEAD of the active
   * one, at its own tempo and always as clock master (see the sheet in
   * app/(tabs)/(patterns)/p.tsx). Nothing in the store changes while it plays,
   * so auditioning an incoming link never touches the library, the transport,
   * or the user's saved tempo.
   */
  private preview: Pattern | null = null;

  // ---- lifecycle --------------------------------------------------------

  /** Idempotent: adopt the shared runtime port, wire inbound (record) + store. */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    // The app-wide singleton port (midi runtime), with sends tagged outbound so
    // the activity log stays truthful. Device selection is the runtime's job.
    this.port = midiOut;
    // init() may be async on a real port; the stub resolves immediately. We
    // don't await — sending to an uninitialized/absent output is a safe no-op.
    // (On web a permission rejection outside a user gesture is swallowed; the
    // MIDI tab's explicit enable flow owns the real prompt.)
    this.port.init().catch(() => {});
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

  // ---- what is sounding (preview overrides the library) ------------------

  /** The pattern being sounded: a preview stands in for the active one. */
  private soundingPattern(): Pattern | undefined {
    return this.preview ?? selectActivePattern(useStore.getState());
  }

  /** Tempo source. A preview runs at ITS bpm; the store keeps the user's. */
  private currentBpm(): number {
    return this.preview ? this.preview.bpm : useStore.getState().transport.bpm;
  }

  /** Clock role. A preview is always app-clocked so it sounds even when the
   * app is otherwise slaved to the device. */
  private clockMode(): ClockMode {
    return this.preview ? 'jam' : useStore.getState().transport.clockMode;
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
        // Switching modes must never hang a note; it also restarts from 0.
        this.panic();
        if (this.running) {
          this.pause();
          this.resetToStart();
          if (playing) this.start();
        }
      }
      if (playing !== this.lastPlaying) {
        this.lastPlaying = playing;
        // The transport's play button is play/PAUSE — position is held.
        // Stop/skip-to-start reset via resetToStart() from the UI.
        if (playing) this.start();
        else this.pause();
      }
    });
  }

  // ---- transport --------------------------------------------------------

  /** Start or RESUME (from `resumeTick`). Resuming sends MIDI Continue. */
  start(): void {
    this.init();
    if (this.running) return;
    const s = useStore.getState();
    const port = this.port!;
    port.setLatencyOffsetMs(s.settings.latencyOffsetMs);

    const from = this.resumeTick;
    this.running = true;
    this.nextScheduleTick = Math.ceil(from);
    this.nextTickTimeMs = now();
    this.currentTick = from;
    setPlayhead(from, true);

    if (this.clockMode() === 'jam') {
      if (from > 0) port.sendContinue();
      else port.sendStart();
      // Kick the loop immediately, then on the scheduler interval.
      this.tickLoop();
      this.timer = setInterval(() => this.tickLoop(), timing.schedulerIntervalMs);
      log(from > 0 ? 'resume jam' : 'start jam', `bpm=${this.currentBpm()} from=${from.toFixed(1)}`);
    } else {
      // Record: slave to the device clock — wait for inbound 0xF8 / Start.
      log('start record', 'waiting for device clock');
    }
  }

  /** Halt playback but HOLD the position (the transport's pause). */
  pause(): void {
    if (this.timer != null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    const wasRunning = this.running;
    this.running = false;
    if (wasRunning && this.clockMode() === 'jam' && this.port) {
      this.port.sendStop();
    }
    this.panic();
    this.resumeTick = this.currentTick;
    // Keep the playhead VISIBLE at the held position while paused.
    setPlayhead(this.currentTick, this.currentTick > 0);
    if (wasRunning) log('pause', `at=${this.currentTick.toFixed(1)}`);
  }

  /** Rewind to tick 0 — live while playing, or clears a held pause position. */
  resetToStart(): void {
    this.resumeTick = 0;
    this.currentTick = 0;
    if (this.running) {
      this.nextScheduleTick = 0;
      this.nextTickTimeMs = now();
      setPlayhead(0, true);
    } else {
      setPlayhead(0, false);
    }
    log('reset', '');
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
    this.soundingPattern()?.lanes.forEach((l) => channels.add(l.channel & 0x0f));
    if (channels.size === 0) channels.add(0);
    channels.forEach((ch) => port.allNotesOff(ch));
    log('panic', `channels=${[...channels].join(',')}`);
  }

  // ---- share-link preview -----------------------------------------------

  /** True while a shared pattern is auditioning (see `preview`). */
  isPreviewing(): boolean {
    return this.preview != null;
  }

  /**
   * Audition a pattern that is NOT in the library. Takes the output over from
   * the top at the pattern's own tempo; stopPreview() hands it back.
   */
  startPreview(pattern: Pattern): void {
    this.init();
    // Hand the output over cleanly (stops the clock, kills sounding notes).
    if (this.running) this.pause();
    this.preview = pattern;
    this.resumeTick = 0;
    this.currentTick = 0;
    this.start();
    log('preview start', `lanes=${pattern.lanes.length} bpm=${pattern.bpm}`);
  }

  /** End the audition and give the output back to the app's own transport. */
  stopPreview(): void {
    if (!this.preview) return;
    this.pause();
    this.preview = null;
    this.resetToStart();
    // The store was never touched, so a transport that was already running
    // when the audition began has to be picked back up explicitly — the store
    // subscription only fires on CHANGES to `playing`.
    if (useStore.getState().transport.playing) this.start();
    log('preview stop', '');
  }

  // ---- jam scheduling ---------------------------------------------------

  private tickLoop(): void {
    if (!this.running || !this.port) return;
    const t = now();
    const horizon = t + timing.lookaheadMs;
    // Schedule every tick whose time falls inside the lookahead window.
    // Recompute msPerTick per tick so a mid-play tempo change is honored.
    while (this.nextTickTimeMs < horizon) {
      const dt = msPerTickAt(this.currentBpm());
      this.scheduleTick(this.nextScheduleTick, this.nextTickTimeMs);
      this.nextScheduleTick += 1;
      this.nextTickTimeMs += dt;
    }
    // Advance the "playing now" tick for the playhead (behind the schedule
    // cursor by whatever is still buffered ahead of the audible present).
    const buffered = (this.nextTickTimeMs - t) / msPerTickAt(this.currentBpm());
    this.currentTick = Math.max(0, this.nextScheduleTick - buffered);
    setPlayhead(this.currentTick, true);
  }

  /** Emit clock + any lane note-ons/offs due at this tick. Reads state FRESH. */
  private scheduleTick(tick: number, timeMs: number): void {
    const port = this.port!;
    const pattern = this.soundingPattern();
    if (!pattern) return;

    if (this.clockMode() === 'jam') port.sendClock(timeMs);

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
    // A preview is app-clocked, so inbound transport/clock is ignored while
    // one is auditioning (clockMode() reports 'jam').
    if (this.clockMode() !== 'record') return;
    switch (e.type) {
      case 'start': {
        this.running = true;
        this.nextScheduleTick = 0;
        this.currentTick = 0;
        // The OP-XY counts in a bar after Record+Play while already streaming
        // Start + clock; swallow those ticks so our bar 1 lands on the
        // device's bar 1 (when recording actually begins).
        const state = useStore.getState();
        const beats = Math.max(0, Math.round(state.settings.countInBeats));
        this.countInTicksRemaining = beats * PPQN;
        state.setRecordPhase(beats > 0 ? 'countin' : 'recording', beats > 0 ? 1 : 0);
        setPlayhead(0, true);
        log('rec start', `count-in=${beats} beats`);
        break;
      }
      case 'continue':
        // Continue resumes mid-song — no count-in.
        this.running = true;
        this.countInTicksRemaining = 0;
        useStore.getState().setRecordPhase('recording');
        setPlayhead(this.currentTick, true);
        break;
      case 'stop':
        this.running = false;
        this.panic();
        useStore.getState().setRecordPhase('armed');
        // Hold the position (device may Continue) and keep it visible.
        setPlayhead(this.currentTick, this.currentTick > 0);
        log('rec stop', '');
        break;
      case 'clock': {
        // Measure the device tempo even while stopped — many devices stream
        // clock continuously. 24 ticks per quarter. See clockStamps for why
        // this is a window, not an EMA.
        const at = e.time ?? now();
        const prev = this.clockStamps[this.clockStamps.length - 1];
        // A transport gap or a clock-domain jump invalidates the window.
        // (500ms ≈ a tick at 5 BPM — far beyond any musical spacing.)
        if (prev != null && (at < prev || at - prev > 500)) this.clockStamps.length = 0;
        this.clockStamps.push(at);
        if (this.clockStamps.length > TEMPO_WINDOW_TICKS) {
          let removed = this.clockStamps.shift()!;
          // Keep the window's first tick packet-leading (see clockStamps):
          // a stamp equal to the one just removed rode the same packet.
          while (this.clockStamps.length > 1 && this.clockStamps[0] === removed) {
            removed = this.clockStamps.shift()!;
          }
        }
        const n = this.clockStamps.length;
        const elapsed = at - this.clockStamps[0];
        const nowMs = now();
        // Anchor only on packet-leading ticks (at > prev) — a trailing
        // coalesced tick under-measures elapsed by up to a full interval.
        const leading = prev == null || at > prev;
        if (leading && n >= TEMPO_MIN_TICKS && elapsed > 0 && nowMs - this.lastBpmPushMs > 500) {
          this.lastBpmPushMs = nowMs;
          const bpm = Math.round(((60000 * (n - 1)) / (elapsed * PPQN)) * 10) / 10;
          const s = useStore.getState();
          if (Math.abs(bpm - s.transport.bpm) >= 0.5) s.setTransportBpm(bpm);
        }

        if (!this.running) return;
        if (this.countInTicksRemaining > 0) {
          this.countInTicksRemaining -= 1;
          const st = useStore.getState();
          if (this.countInTicksRemaining === 0) {
            st.setRecordPhase('recording');
          } else {
            // 1-based beat within the count-in; push only on beat boundaries.
            const total = Math.max(1, Math.round(st.settings.countInBeats));
            const beat = total - Math.floor(this.countInTicksRemaining / PPQN);
            if (beat !== st.transport.countInBeat) st.setRecordPhase('countin', beat);
          }
          return; // inside the device's count-in — hold at tick 0
        }
        const tick = this.nextScheduleTick;
        this.scheduleTick(tick, nowMs);
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
