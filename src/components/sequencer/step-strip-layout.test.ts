// Bun runs this pure geometry test; its test types are intentionally not part
// of the Expo app's TypeScript environment.
// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import {
  BEAT,
  BEAT_GAP,
  isDownbeat,
  PER_ROW,
  STEP_GAP,
  stepBlockWidth,
  stepGapBefore,
  stepLeft,
  stepStripHeight,
  stepTop,
  tickColor,
} from './step-strip-layout';

describe('stepStripHeight', () => {
  test('reserves one row through 16 steps', () => {
    expect(stepStripHeight(1)).toBe(22);
    expect(stepStripHeight(16)).toBe(22);
  });

  test('includes the inter-row gap for wrapped lanes', () => {
    expect(stepStripHeight(17)).toBe(48);
    expect(stepStripHeight(64)).toBe(100);
  });
});

describe('beat grouping', () => {
  test('only downbeats past the row start get the wide gap', () => {
    expect(stepGapBefore(0)).toBe(0);
    expect(stepGapBefore(1)).toBe(STEP_GAP);
    expect(stepGapBefore(BEAT)).toBe(BEAT_GAP);
    expect(stepGapBefore(12)).toBe(BEAT_GAP);
    // Rows wrap on a multiple of BEAT, so slot 0 of row 2 starts flush.
    expect(stepGapBefore(PER_ROW)).toBe(0);
    expect(stepGapBefore(PER_ROW + BEAT)).toBe(BEAT_GAP);
  });

  test('keeps the strip width a uniform 4px row had', () => {
    const width = 361;
    const blockW = stepBlockWidth(width);
    // Old geometry: 16 blocks + 15 gaps of 4.
    expect(blockW).toBeCloseTo((width - 15 * 4) / PER_ROW, 10);
    // The last block still ends exactly at the strip's right edge.
    expect(stepLeft(PER_ROW - 1, blockW) + blockW).toBeCloseTo(width, 10);
  });

  test('x is the run of gaps before the step', () => {
    const blockW = 18;
    expect(stepLeft(0, blockW)).toBe(0);
    expect(stepLeft(1, blockW)).toBe(blockW + STEP_GAP);
    expect(stepLeft(BEAT, blockW)).toBe(BEAT * blockW + 3 * STEP_GAP + BEAT_GAP);
    // Wrapped rows repeat the first row's x.
    expect(stepLeft(PER_ROW + 5, blockW)).toBe(stepLeft(5, blockW));
  });

  test('rows stack on the vertical row gap', () => {
    expect(stepTop(0)).toBe(0);
    expect(stepTop(PER_ROW - 1)).toBe(0);
    expect(stepTop(PER_ROW)).toBe(26);
    expect(stepTop(PER_ROW * 3)).toBe(78);
  });
});

describe('downbeat underline', () => {
  test('marks 1 / 5 / 9 / 13 of every row, wrapped rows included', () => {
    expect(isDownbeat(0)).toBe(true);
    expect(isDownbeat(1)).toBe(false);
    expect(isDownbeat(BEAT)).toBe(true);
    expect(isDownbeat(PER_ROW - 1)).toBe(false);
    // A wrapped lane's second row starts on a downbeat and keeps the cadence.
    expect(isDownbeat(PER_ROW)).toBe(true);
    expect(isDownbeat(PER_ROW + BEAT)).toBe(true);
    expect(isDownbeat(PER_ROW + 1)).toBe(false);
  });

  test('flips dark only on the four lightest ramp slots', () => {
    expect(tickColor(0)).toBe('rgba(255,255,255,0.40)');
    expect(tickColor(8)).toBe('rgba(255,255,255,0.40)');
    expect(tickColor(11)).toBe('rgba(255,255,255,0.40)');
    expect(tickColor(12)).toBe('rgba(0,0,0,0.45)');
    expect(tickColor(15)).toBe('rgba(0,0,0,0.45)');
    // Wrapped rows re-enter the ramp: slot 12 of row 2 is light-filled too.
    expect(tickColor(PER_ROW + 12)).toBe('rgba(0,0,0,0.45)');
    expect(tickColor(PER_ROW)).toBe('rgba(255,255,255,0.40)');
  });
});
