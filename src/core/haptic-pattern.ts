/**
 * Pattern → haptic pattern. Renders a euxy pattern as something you can FEEL
 * with no OP-XY attached: one loop's worth of onsets compiled into the
 * `{time, amplitude, frequency}` events Pulsar's pattern composer takes, so
 * Core Haptics schedules them natively instead of us ticking a timer.
 *
 * This works here because euxy's patterns are RHYTHM, not tonality — see
 * state/presets.ts: "NO preset depends on tonality... the only non-kit lanes
 * are single-pitch subs". A haptic rendering loses almost nothing.
 *
 * What it can and cannot carry:
 *  - Rhythm and accent: yes. Velocity becomes amplitude.
 *  - Timbre: only as SHARPNESS, and only by drum ROLE. `frequency` in a haptic
 *    pattern is sharpness (round ↔ crisp), not pitch, so a linear note→value
 *    map would be arbitrary noise. Every drum lane targets the OP-XY kit
 *    (core/opxy.ts), so the slot's role is the honest axis: a kick is round, a
 *    hat is crisp.
 *  - Melody: no. Nothing here pretends otherwise.
 *
 * And three hard limits, all of them the actuator's, not the code's:
 *  - ONE VOICE. Simultaneous onsets across lanes cannot stack; they merge.
 *  - RESOLUTION. Transients closer than HAPTIC_MIN_GAP_MS blur into buzz
 *    rather than reading as separate hits, so they merge too.
 *  - POLYMETER. The true loop is the LCM of the lanes' own loops, which for
 *    mixed lengths can run for bars. Past LOOP_TICKS_MAX this compiles a
 *    WINDOW instead, so long polymeter is previewed, not represented.
 */
import { timing } from '@/theme/tokens';
import type { Lane, Pattern } from '@/state/types';
import { laneAudible, patternForLane } from './lane-pattern';
import { DRUM_KIT_HI, DRUM_KIT_LO } from './opxy';

const PPQN = timing.ppqn; // 24

/** Below this spacing a pair of transients stops reading as two hits. */
export const HAPTIC_MIN_GAP_MS = 30;
/** 4 bars of 4/4. Past this, polymeter gets a window (see the docblock). */
export const LOOP_TICKS_MAX = PPQN * 4 * 4;
/** Keeps a pathological pattern from handing Core Haptics a huge event list. */
export const HAPTIC_MAX_EVENTS = 128;

/**
 * Sharpness per OP-XY drum slot, index 0 = MIDI 53 (kick). Ordered by
 * DRUM_SLOT_NAMES in core/opxy.ts. Hand-set by role rather than derived: the
 * point is that a kick feels like a kick and a triangle feels like a triangle.
 */
const SLOT_SHARPNESS = [
  0.1, // kick
  0.12, // kick alt
  0.45, // snare
  0.45, // snare 2
  0.7, // rim
  0.55, // clap
  0.8, // tamb
  0.85, // shaker
  0.9, // closed hat
  0.9, // closed hat 2
  0.75, // open hat
  0.8, // clave
  0.2, // low tom
  0.7, // ride
  0.3, // mid tom
  0.65, // crash
  0.4, // hi tom
  0.95, // triangle
  0.3, // low conga
  0.45, // hi conga
  0.75, // cowbell
  0.85, // guiro
  0.9, // metal
  0.95, // chi
];
/** Non-kit lanes are the single-pitch subs — low and round by definition. */
const SUB_SHARPNESS = 0.12;

/** Sharpness for a lane's note. Kit notes by slot role, anything else a sub. */
export function sharpnessForNote(note: number): number {
  if (note < DRUM_KIT_LO || note > DRUM_KIT_HI) return SUB_SHARPNESS;
  return SLOT_SHARPNESS[note - DRUM_KIT_LO] ?? SUB_SHARPNESS;
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number): number => (a / gcd(a, b)) * b;

/** A lane contributes onsets only if it sounds and has a real grid. */
const usable = (lane: Lane, anySolo: boolean): boolean =>
  lane.resolutionTicks > 0 && lane.length > 0 && laneAudible(lane, anySolo);

/**
 * Ticks the compiled window spans — the true LCM loop when it is short enough
 * to hand over whole, else LOOP_TICKS_MAX. 0 when nothing sounds.
 */
export function hapticLoopTicks(lanes: Lane[]): number {
  const anySolo = lanes.some((l) => l.solo);
  const playing = lanes.filter((l) => usable(l, anySolo));
  if (playing.length === 0) return 0;
  let ticks = 0;
  for (const lane of playing) {
    const own = lane.length * lane.resolutionTicks;
    ticks = ticks === 0 ? own : lcm(ticks, own);
    // Bail early — an LCM of coprime lengths grows fast enough to overflow
    // the useful range long before it overflows a number.
    if (ticks >= LOOP_TICKS_MAX) return LOOP_TICKS_MAX;
  }
  return ticks;
}

/**
 * Everything a compile actually reads, as one string. Callers memoize on this
 * so a rename, an icon change or a selection does NOT re-parse a native haptic
 * pattern — only a change that would sound different does.
 */
export function rhythmSignature(pattern: Pattern, bpm: number): string {
  const lanes = pattern.lanes.map(
    (l) =>
      `${l.length},${l.genA.pulses}.${l.genA.rotation},${l.genB.pulses}.${l.genB.rotation},` +
      `${l.op},${l.trackRot},${l.note},${l.velocity},${l.resolutionTicks},${l.muted ? 1 : 0},${l.solo ? 1 : 0}`,
  );
  return `${Math.round(bpm)}|${lanes.join('|')}`;
}

export interface HapticPattern {
  discretePattern: { time: number; amplitude: number; frequency: number }[];
  continuousPattern: {
    amplitude: { time: number; value: number }[];
    frequency: { time: number; value: number }[];
  };
}

export interface CompiledHaptics {
  pattern: HapticPattern;
  /** Window length in ticks — also the re-arm period for a looping preview. */
  loopTicks: number;
  /** Onsets folded into a neighbouring event because one actuator cannot
   * play them separately. Surfaced so the UI can be honest about smearing. */
  merged: number;
}

/**
 * Compile one loop of `pattern` into a haptic pattern at `bpm`.
 *
 * Merging rule, applied in time order: an onset within HAPTIC_MIN_GAP_MS of
 * the previous kept event folds into it, taking the LOUDER amplitude and an
 * amplitude-weighted sharpness. Weighted, not averaged, so a kick under a hat
 * still feels like a kick — the loudest contributor dominates, which is what
 * one actuator actually does.
 */
export function compilePatternToHaptics(pattern: Pattern, bpm: number): CompiledHaptics {
  const empty: CompiledHaptics = {
    pattern: { discretePattern: [], continuousPattern: { amplitude: [], frequency: [] } },
    loopTicks: 0,
    merged: 0,
  };
  const loopTicks = hapticLoopTicks(pattern.lanes);
  if (loopTicks === 0) return empty;

  const msPerTick = 60000 / (Math.max(1, bpm) * PPQN);
  const anySolo = pattern.lanes.some((l) => l.solo);

  // Collect every onset in the window first — merging needs them in time
  // order, and lanes produce them per-lane.
  const onsets: { time: number; amplitude: number; sharpness: number }[] = [];
  for (const lane of pattern.lanes) {
    if (!usable(lane, anySolo)) continue;
    const steps = patternForLane(lane);
    const sharpness = sharpnessForNote(lane.note);
    const amplitude = Math.min(1, Math.max(0.05, lane.velocity / 127));
    for (let tick = 0; tick < loopTicks; tick += lane.resolutionTicks) {
      const step = (tick / lane.resolutionTicks) % lane.length;
      if (!steps[step]) continue;
      onsets.push({ time: tick * msPerTick, amplitude, sharpness });
    }
  }
  if (onsets.length === 0) return { ...empty, loopTicks };
  onsets.sort((a, b) => a.time - b.time);

  const discretePattern: HapticPattern['discretePattern'] = [];
  // Running amplitude-weighted sharpness for the event being built.
  let weight = 0;
  let weighted = 0;
  let merged = 0;
  for (const onset of onsets) {
    const last = discretePattern[discretePattern.length - 1];
    if (last && onset.time - last.time < HAPTIC_MIN_GAP_MS) {
      merged += 1;
      last.amplitude = Math.max(last.amplitude, onset.amplitude);
      weight += onset.amplitude;
      weighted += onset.amplitude * onset.sharpness;
      last.frequency = weighted / weight;
      continue;
    }
    if (discretePattern.length >= HAPTIC_MAX_EVENTS) {
      merged += 1;
      continue;
    }
    weight = onset.amplitude;
    weighted = onset.amplitude * onset.sharpness;
    discretePattern.push({
      time: onset.time,
      amplitude: onset.amplitude,
      frequency: onset.sharpness,
    });
  }

  return {
    // Discrete only. A continuous envelope under a drum pattern would be a
    // drone the hits have to fight, not a bed for them.
    pattern: { discretePattern, continuousPattern: { amplitude: [], frequency: [] } },
    loopTicks,
    merged,
  };
}
