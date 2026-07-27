// Bun runs this pure geometry test; its test types are intentionally not part
// of the Expo app's TypeScript environment.
// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import { stepStripHeight } from './step-strip-layout';

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
