export const PER_ROW = 16;
/** Row-to-row gap of a wrapped lane (vertical only). */
export const GAP = 4;
export const BLOCK_H = 22;
export const LED = 5;
export const LED_TOP = 3;

/**
 * Beat grouping — steps sit in groups of `BEAT` with a WIDER gap before each
 * group, so the downbeats (1, 5, 9, 13 …) read at a glance in an otherwise
 * evenly spaced row (TestFlight). Proximity does the work: no new
 * ink, no second color, the fills still sweep the key ramp and the LEDs still
 * carry the sequence.
 *
 * The two gaps SUM to the old uniform row — 12 × 3 + 3 × 8 = 15 × 4 = 60 — so
 * a block's width and the strip's total width are unchanged; only where the
 * space sits changes. Rows wrap at 16, a multiple of `BEAT`, so every row
 * starts on a downbeat.
 */
export const BEAT = 4;
/** Gap between two steps inside a beat. */
export const STEP_GAP = 3;
/** Gap before a downbeat — the visible group boundary. */
export const BEAT_GAP = 8;

/** Wide gaps in a full row: one before each downbeat except slot 0. */
const ROW_BEAT_GAPS = Math.floor((PER_ROW - 1) / BEAT);
/** Total horizontal gap in a full 16-slot row. */
const ROW_GAPS = (PER_ROW - 1 - ROW_BEAT_GAPS) * STEP_GAP + ROW_BEAT_GAPS * BEAT_GAP;

/** Block width for a strip measured at `stripWidth` — always sized against 16
 * slots, so a short lane keeps full-size blocks and trailing space. */
export function stepBlockWidth(stripWidth: number): number {
  return (stripWidth - ROW_GAPS) / PER_ROW;
}

/** Gap that precedes step `i` in its row: none at the row's start, `BEAT_GAP`
 * on a downbeat, `STEP_GAP` otherwise. */
export function stepGapBefore(i: number): number {
  const slot = i % PER_ROW;
  if (slot === 0) return 0;
  return slot % BEAT === 0 ? BEAT_GAP : STEP_GAP;
}

/** Left edge of step `i` inside its row. Worklet: the playhead layers position
 * themselves with it on the UI thread. */
export function stepLeft(i: number, blockW: number): number {
  'worklet';
  const slot = i % PER_ROW;
  return slot * (blockW + STEP_GAP) + Math.floor(slot / BEAT) * (BEAT_GAP - STEP_GAP);
}

/** Top edge of step `i`'s row inside the strip. Worklet (same reason). */
export function stepTop(i: number): number {
  'worklet';
  return Math.floor(i / PER_ROW) * (BLOCK_H + GAP);
}

/** Exact rendered height of a sequencer lane's step strip. */
export function stepStripHeight(steps: number): number {
  const rows = Math.max(1, Math.ceil(steps / PER_ROW));
  return rows * BLOCK_H + (rows - 1) * GAP;
}
