export const PER_ROW = 16;
/** Row-to-row gap of a wrapped lane (vertical only). */
export const GAP = 4;
export const BLOCK_H = 22;
export const LED = 5;
export const LED_TOP = 3;

/**
 * Musical beat — drives which steps carry the downbeat tick (1, 5, 9, 13 …).
 * Spacing is UNIFORM: the beat-grouping gaps (12 × 3 + 3 × 8) are gone
 * (Brent 2026-08-03) — the lit tick below carries the downbeats alone, and
 * every step sits the same 4px from its neighbor. The uniform gap equals the
 * old gaps' average, so a block's width and the strip's total width are
 * unchanged (15 × 4 = 60).
 */
export const BEAT = 4;
/** Gap between adjacent steps — the same everywhere. */
export const STEP_GAP = 4;

/** Total horizontal gap in a full 16-slot row. */
const ROW_GAPS = (PER_ROW - 1) * STEP_GAP;

/** Block width for a strip measured at `stripWidth` — always sized against 16
 * slots, so a short lane keeps full-size blocks and trailing space. */
export function stepBlockWidth(stripWidth: number): number {
  return (stripWidth - ROW_GAPS) / PER_ROW;
}

/** Gap that precedes step `i` in its row: none at the row's start, `STEP_GAP`
 * everywhere else. */
export function stepGapBefore(i: number): number {
  return i % PER_ROW === 0 ? 0 : STEP_GAP;
}

/** Left edge of step `i` inside its row. Worklet: the playhead layers position
 * themselves with it on the UI thread. */
export function stepLeft(i: number, blockW: number): number {
  'worklet';
  return (i % PER_ROW) * (blockW + STEP_GAP);
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

/**
 * Downbeat tick — V4b "lit tick" (Paper "V2 + V4, one notch louder"): a small
 * 8 × 2 LIGHT centered inside the bottom edge of every downbeat cell. The
 * tick is treated as an LED — near-white with a soft glow — and with the beat
 * gaps removed it is the ONLY downbeat cue. Shape keeps the meanings apart:
 * round means note, bar means beat. On the four lightest ramp fills the core
 * goes full white and gains a 1px dark ring instead of flipping dark.
 * Same tick in the sequencer strips and the Lane Editor's combined card.
 */
export const TICK_W = 8;
export const TICK_H = 2;
export const TICK_RADIUS = 1;
/** Inset from the cell's bottom edge. */
export const TICK_BOTTOM = 3;

/** True on the steps the tick marks: 1 / 5 / 9 / 13 … of every row
 * (rows wrap at 16, a multiple of BEAT, so absolute index works unchanged). */
export function isDownbeat(i: number): boolean {
  return i % BEAT === 0;
}

/** The four lightest ramp slots (stepRamp 12–15), where the lit tick needs
 * its dark ring to separate from the fill. */
export function tickOnLightFill(i: number): boolean {
  return i % PER_ROW >= PER_ROW - 4;
}
