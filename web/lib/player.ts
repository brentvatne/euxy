/**
 * Web playback engine: a "Tale of Two Clocks" lookahead scheduler over
 * AudioContext time + small synthesized drum voices keyed off the OP-XY slot
 * map. Written against the STANDARD Web Audio types only, so the same module
 * can later run inside the app via react-native-audio-api (the planned
 * "no OP-XY? hear it anyway" preview mode — see docs/design/web-plan.md).
 *
 * Synth voices are the W0/W2 stand-in; the CC0 sample kit (808 Fischer +
 * VCSL, web-opxy-placeholder.md) replaces most of them in W1 — this module
 * keeps that swap local to `playVoice`.
 */
import { patternForLane } from '@/core/lane-pattern';
import { drumSlotName } from '@/core/opxy';
import type { SharedLane } from '@/core/share-codec';

export interface PlayableLane extends SharedLane {}
export interface PlayablePattern {
  name: string;
  bpm: number;
  lanes: PlayableLane[];
}

const PPQN = 24;

// ---------------------------------------------------------------------------
// Audio context (lazy — must be created/resumed from a user gesture)

let ctx: AudioContext | null = null;

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

// ---------------------------------------------------------------------------
// Voices

function noiseBuffer(ac: AudioContext): AudioBuffer {
  const len = ac.sampleRate; // 1s is plenty; sources stop early
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}
let sharedNoise: AudioBuffer | null = null;

function env(ac: AudioContext, at: number, peak: number, decay: number): GainNode {
  const g = ac.createGain();
  g.gain.setValueAtTime(peak, at);
  g.gain.exponentialRampToValueAtTime(0.001, at + decay);
  g.connect(ac.destination);
  return g;
}

function noiseVoice(
  ac: AudioContext,
  at: number,
  gain: number,
  decay: number,
  filterType: BiquadFilterType,
  freq: number,
) {
  if (!sharedNoise) sharedNoise = noiseBuffer(ac);
  const src = ac.createBufferSource();
  src.buffer = sharedNoise;
  const f = ac.createBiquadFilter();
  f.type = filterType;
  f.frequency.value = freq;
  src.connect(f).connect(env(ac, at, gain, decay));
  src.start(at);
  src.stop(at + decay + 0.05);
  return src;
}

function toneVoice(
  ac: AudioContext,
  at: number,
  gain: number,
  decay: number,
  type: OscillatorType,
  freq: number,
  freqEnd?: number,
) {
  const osc = ac.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  if (freqEnd !== undefined) osc.frequency.exponentialRampToValueAtTime(freqEnd, at + decay);
  osc.connect(env(ac, at, gain, decay));
  osc.start(at);
  osc.stop(at + decay + 0.05);
}

const midiHz = (note: number) => 440 * Math.pow(2, (note - 69) / 12);

/** Open-hat sources per channel, so a closed hat chokes them (OP-XY-style). */
const openHats = new Map<number, AudioBufferSourceNode>();

export function playVoice(ac: AudioContext, lane: PlayableLane, at: number): void {
  const v = (lane.velocity / 127) * 0.8;
  const slot = drumSlotName(lane.note);
  switch (slot) {
    case 'kick':
    case 'kick alt':
      toneVoice(ac, at, v, 0.28, 'sine', slot === 'kick' ? 160 : 190, 44);
      return;
    case 'snare':
    case 'snare 2':
      toneVoice(ac, at, v * 0.5, 0.12, 'triangle', 196);
      noiseVoice(ac, at, v * 0.7, 0.18, 'bandpass', 1900);
      return;
    case 'rim':
      noiseVoice(ac, at, v * 0.6, 0.05, 'bandpass', 3600);
      return;
    case 'clap':
      for (let i = 0; i < 3; i++) noiseVoice(ac, at + i * 0.011, v * 0.55, 0.09, 'bandpass', 1400);
      return;
    case 'tamb':
    case 'shaker':
      noiseVoice(ac, at, v * 0.4, 0.07, 'highpass', 6500);
      return;
    case 'closed hat':
    case 'closed hat 2': {
      openHats.get(lane.channel)?.stop(at); // choke
      openHats.delete(lane.channel);
      noiseVoice(ac, at, v * 0.42, 0.045, 'highpass', 8200);
      return;
    }
    case 'open hat': {
      openHats.get(lane.channel)?.stop(at);
      const src = noiseVoice(ac, at, v * 0.42, 0.4, 'highpass', 7800);
      openHats.set(lane.channel, src);
      return;
    }
    case 'clave':
      toneVoice(ac, at, v * 0.6, 0.06, 'sine', 2450);
      return;
    case 'cowbell':
      toneVoice(ac, at, v * 0.4, 0.12, 'square', 835);
      toneVoice(ac, at, v * 0.3, 0.12, 'square', 540);
      return;
    case 'triangle':
      toneVoice(ac, at, v * 0.35, 0.5, 'sine', 4050);
      return;
    case 'low tom':
    case 'mid tom':
    case 'hi tom':
    case 'low conga':
    case 'hi conga': {
      const base = { 'low tom': 100, 'mid tom': 140, 'hi tom': 190, 'low conga': 210, 'hi conga': 280 }[slot];
      toneVoice(ac, at, v * 0.8, 0.22, 'sine', base * 1.6, base);
      return;
    }
    case 'ride':
      noiseVoice(ac, at, v * 0.3, 0.55, 'highpass', 5200);
      return;
    case 'crash':
      noiseVoice(ac, at, v * 0.35, 1.1, 'highpass', 4200);
      return;
    case 'guiro':
      noiseVoice(ac, at, v * 0.4, 0.14, 'bandpass', 2600);
      return;
    case 'metal':
    case 'chi':
      toneVoice(ac, at, v * 0.35, 0.2, 'square', slot === 'metal' ? 1450 : 2900);
      noiseVoice(ac, at, v * 0.2, 0.15, 'highpass', 7000);
      return;
    default: {
      // Non-kit note (e.g. a Sub lane on another channel): tonal voice —
      // saw → lowpass, pitch from the MIDI note, length from the gate.
      const decay = Math.min(1.2, Math.max(0.1, lane.gateMs / 1000));
      const osc = ac.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = midiHz(lane.note);
      const f = ac.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 420;
      osc.connect(f).connect(env(ac, at, v * 0.7, decay));
      osc.start(at);
      osc.stop(at + decay + 0.05);
    }
  }
}

// ---------------------------------------------------------------------------
// Scheduler

const LOOKAHEAD_S = 0.1;
const INTERVAL_MS = 25;

export class PatternScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private tick = 0;
  private nextTickTime = 0;
  private startCtxTime = 0;
  private tickSeconds: number;
  private laneSteps: { lane: PlayableLane; steps: number[] }[];

  constructor(
    private ac: AudioContext,
    pattern: PlayablePattern,
  ) {
    this.tickSeconds = 60 / (pattern.bpm * PPQN);
    this.laneSteps = pattern.lanes.map((lane) => ({ lane, steps: patternForLane(lane) }));
  }

  get playing() {
    return this.timer !== null;
  }

  /** Current tick derived from audio time — drives the UI playhead via rAF. */
  currentTick(): number {
    if (!this.playing) return -1;
    return Math.max(0, Math.floor((this.ac.currentTime - this.startCtxTime) / this.tickSeconds));
  }

  start() {
    if (this.timer) return;
    this.tick = 0;
    this.startCtxTime = this.ac.currentTime + 0.06;
    this.nextTickTime = this.startCtxTime;
    const pump = () => {
      while (this.nextTickTime < this.ac.currentTime + LOOKAHEAD_S) {
        this.scheduleTick(this.tick, this.nextTickTime);
        this.tick += 1;
        this.nextTickTime += this.tickSeconds;
      }
    };
    pump();
    this.timer = setInterval(pump, INTERVAL_MS);
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private scheduleTick(tick: number, at: number) {
    for (const { lane, steps } of this.laneSteps) {
      if (tick % lane.resolutionTicks !== 0) continue;
      const step = (tick / lane.resolutionTicks) % lane.length;
      if (steps[step]) playVoice(this.ac, lane, at);
    }
  }
}
