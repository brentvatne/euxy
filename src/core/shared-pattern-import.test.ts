// Bun runs this pure state-transition test; its test types are intentionally
// not part of the Expo app's TypeScript environment.
// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import { claimSharedPatternPayload } from './shared-pattern-import';

describe('shared-pattern import claims', () => {
  test('imports each subsequent payload once during a mounted sheet', () => {
    const imported = new Set<string>();

    expect(claimSharedPatternPayload(imported, 'first')).toBe(true);
    expect(claimSharedPatternPayload(imported, 'first')).toBe(false);
    expect(claimSharedPatternPayload(imported, 'second')).toBe(true);
    expect(claimSharedPatternPayload(imported, 'second')).toBe(false);
    expect(claimSharedPatternPayload(imported, 'first')).toBe(false);
    expect([...imported]).toEqual(['first', 'second']);
  });

  test('does not claim missing or non-string payloads', () => {
    const imported = new Set<string>();

    expect(claimSharedPatternPayload(imported, undefined)).toBe(false);
    expect(claimSharedPatternPayload(imported, '')).toBe(false);
    expect(claimSharedPatternPayload(imported, ['payload'])).toBe(false);
    expect(imported.size).toBe(0);
  });
});
