// Bun runs this pure token test; its test types are intentionally not part of
// the Expo app's TypeScript environment.
// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import { keyRamp, stepFill, stepRamp } from './tokens';

/** `keyRamp` sampled at `slot * 7 / 15`, linear per channel — the derivation
 * `stepRamp`'s literal values are written from. */
function resample(slot: number): string {
  const anchors = keyRamp.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  const p = (slot * (anchors.length - 1)) / 15;
  const lo = Math.floor(p);
  const hi = Math.min(anchors.length - 1, lo + 1);
  const t = p - lo;
  const channels = anchors[lo].map((v, k) => Math.round(v + (anchors[hi][k] - v) * t));
  return `#${channels.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
}

describe('stepRamp', () => {
  test('is the key ramp resampled to one shade per slot', () => {
    expect(stepRamp.length).toBe(16);
    for (let slot = 0; slot < 16; slot++) expect(stepRamp[slot]).toBe(resample(slot));
  });

  test('keeps the artwork ramp endpoints and every shade distinct', () => {
    expect(stepRamp[0]).toBe(keyRamp[0]);
    expect(stepRamp[15]).toBe(keyRamp[keyRamp.length - 1]);
    expect(new Set(stepRamp).size).toBe(16);
  });

  test('wraps a slot into its 16-slot row', () => {
    expect(stepFill(0)).toBe(stepRamp[0]);
    expect(stepFill(15)).toBe(stepRamp[15]);
    expect(stepFill(16)).toBe(stepRamp[0]);
    expect(stepFill(33)).toBe(stepRamp[1]);
  });
});
