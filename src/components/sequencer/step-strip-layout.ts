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

/**
 * Downbeat underline — a dim tick inset inside the bottom edge of every
 * downbeat cell (Paper "V4c — in context"), layered on the beat grouping
 * above as a second cue with one convention. It lives at the bottom because
 * the LEDs own the top edge, and it stays dimmer than any LED so it can never
 * read as a hit; on the four lightest ramp fills it flips dark instead.
 * Same tick in the sequencer strips and the Lane Editor's combined card.
 */
export const TICK_H = 2;
export const TICK_RADIUS = 1;
/** Inset from the cell's bottom edge. */
export const TICK_BOTTOM = 3;
/** Horizontal inset per side — tick width is cellW − 2 × TICK_INSET. */
export const TICK_INSET = 3;

/** True on the steps the underline marks: 1 / 5 / 9 / 13 … of every row
 * (rows wrap at 16, a multiple of BEAT, so absolute index works unchanged). */
export function isDownbeat(i: number): boolean {
  return i % BEAT === 0;
}

/** Tick color over step `i`'s ramp fill: light everywhere except the four
 * lightest slots (stepRamp 12–15), where a light tick would vanish. */
export function tickColor(i: number): string {
  return i % PER_ROW >= PER_ROW - 4 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.40)';
}
