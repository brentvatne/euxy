export const PER_ROW = 16;
export const GAP = 4;
export const BLOCK_H = 22;
export const LED = 5;
export const LED_TOP = 3;

/** Exact rendered height of a sequencer lane's step strip. */
export function stepStripHeight(steps: number): number {
  const rows = Math.max(1, Math.ceil(steps / PER_ROW));
  return rows * BLOCK_H + (rows - 1) * GAP;
}
