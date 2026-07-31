/**
 * euxy domain model — the shape the whole app (and the engine) binds to.
 *
 * Dual-generator Euclidean (Digitakt model): a lane holds two generators
 * combined by `op` into the played pattern, plus a whole-track rotation.
 * Single-generator (PoC) is just `genB.pulses = 0`. See docs/design/README.md
 * "Behavior redlines".
 *
 * Polymeter is DERIVED, never stored: a lane's active step is
 * `floor(globalTick / resolutionTicks) % length` — computed by the engine from
 * the global tick, not held here.
 */

/** How the two generators combine into the played pattern. */
export type CombineOp = 'OR' | 'AND' | 'XOR' | 'A>B';

/** One Euclidean generator: `pulses` hits distributed over the lane length. */
export interface Generator {
  pulses: number;
  rotation: number;
}

export interface Lane {
  id: string;
  /** Optional human label (e.g. "Kick"). Falls back to the note name in UI. */
  name?: string;
  /** Step count (the Euclidean `n`). Lanes of different lengths → polymeter. */
  length: number;
  genA: Generator;
  /** Second generator; `pulses: 0` makes the lane single-generator. */
  genB: Generator;
  op: CombineOp;
  /** Whole-track rotation applied to the combined pattern. */
  trackRot: number;
  /** MIDI note number (0–127). */
  note: number;
  /** 0-based MIDI channel; the OP-XY track shown to the user is `channel + 1`. */
  channel: number;
  /** Note-on velocity (1–127). */
  velocity: number;
  /** Note length in ms (gate). */
  gateMs: number;
  /** Ticks per step at 24 PPQN (e.g. 6 = 1/16). Drives this lane's speed. */
  resolutionTicks: number;
  muted: boolean;
  solo: boolean;
}

export interface Pattern {
  id: string;
  name: string;
  bpm: number;
  /** Default step resolution new lanes inherit (ticks per step). */
  baseResolutionTicks: number;
  lanes: Lane[];
  /** Last-edit timestamp (ms epoch) — drives "edited just now" in the library. */
  updatedAt: number;
  /** Creation timestamp (ms epoch) — the library's default sort key. Absent on
   * patterns saved before this field existed; the store backfills those from
   * `updatedAt` once at hydration, so nothing has to migrate. */
  createdAt?: number;
  /** Chip glyph name (components/patterns/chips.ts). Absent on old patterns —
   * they fall back to a stable hash pick, no migration needed. */
  icon?: string;
}

/** Jam = app is clock master; Record = app slaves to the device's clock. */
export type ClockMode = 'jam' | 'record';

/** Record-mode lifecycle: armed (waiting for the device) → count-in → recording. */
export type RecordPhase = 'armed' | 'countin' | 'recording';

export interface Transport {
  playing: boolean;
  bpm: number;
  clockMode: ClockMode;
  /** Record-mode status shown by the transport (transient, engine-driven). */
  recordPhase: RecordPhase;
  /** Current count-in beat (1-based) while recordPhase is 'countin'. */
  countInBeat: number;
}

/** Patterns-library sort order (the library header's "Sort by" menu). */
export type PatternSort = 'created' | 'bpm';

export interface Settings {
  /** Selected MIDI output/input device ids (null = none). */
  outputId: string | null;
  inputId: string | null;
  /** Manual latency compensation applied to outgoing MIDI, in ms. */
  latencyOffsetMs: number;
  /**
   * Record-mode count-in, in beats. The OP-XY counts a bar ("1 2 3 4") after
   * Record+Play before it starts recording, streaming Start + clock the whole
   * time — euxy skips this many beats of inbound clock so its bar 1 lands on
   * the device's bar 1. 0 = device count-in disabled.
   */
  countInBeats: number;
  /** Which bottom corner the floating capsule is docked in (drag to move).
   * Absent on old blobs — the store defaults it to 'right'. */
  floatBarCorner: 'left' | 'right';
  /** How the Patterns library is ordered. Absent on old blobs — the store
   * defaults it to 'created' (newest first). */
  patternSort: PatternSort;
}

export interface Selection {
  /** Lane currently open in the Lane Editor sheet, if any. */
  laneId: string | null;
}
