// Bun runs this pure compile test; its test types are intentionally
// not part of the Expo app's TypeScript environment.
// @ts-expect-error -- `bun:test` is available to the test runner, not the app.
import { describe, expect, test } from 'bun:test';

import {
  HAPTIC_MIN_GAP_MS,
  LOOP_TICKS_MAX,
  compilePatternToHaptics,
  hapticLoopTicks,
  rhythmSignature,
  sharpnessForNote,
} from './haptic-pattern';
import { drum } from './opxy';
import type { Lane, Pattern } from '@/state/types';

const lane = (over: Partial<Lane> = {}): Lane => ({
  id: over.id ?? 'l1',
  length: 16,
  genA: { pulses: 4, rotation: 0 },
  genB: { pulses: 0, rotation: 0 },
  op: 'OR',
  trackRot: 0,
  note: drum.kick,
  channel: 0,
  velocity: 100,
  gateMs: 20,
  resolutionTicks: 6, // 1/16
  muted: false,
  solo: false,
  ...over,
});

const pattern = (lanes: Lane[]): Pattern => ({
  id: 'p1',
  name: 'test',
  bpm: 120,
  baseResolutionTicks: 6,
  lanes,
  updatedAt: 0,
});

describe('haptic loop window', () => {
  test('one lane loops over its own length × resolution', () => {
    expect(hapticLoopTicks([lane()])).toBe(96); // 16 steps × 6 ticks = 1 bar
  });

  test('polymeter takes the LCM of the lanes', () => {
    const ticks = hapticLoopTicks([lane({ length: 16 }), lane({ id: 'l2', length: 12 })]);
    expect(ticks).toBe(288); // lcm(96, 72)
  });

  test('a window replaces an LCM that runs too long', () => {
    const ticks = hapticLoopTicks([
      lane({ length: 16 }),
      lane({ id: 'l2', length: 13 }),
      lane({ id: 'l3', length: 11 }),
    ]);
    expect(ticks).toBe(LOOP_TICKS_MAX);
  });

  test('silent lanes contribute nothing', () => {
    expect(hapticLoopTicks([lane({ muted: true })])).toBe(0);
    expect(hapticLoopTicks([])).toBe(0);
    // Solo takes precedence: a non-soloed lane is silent alongside a soloed one.
    expect(hapticLoopTicks([lane({ length: 12, solo: true }), lane({ id: 'l2', length: 16 })])).toBe(
      72,
    );
  });
});

describe('sharpness by drum role', () => {
  test('a kick is round and a hat is crisp', () => {
    expect(sharpnessForNote(drum.kick)).toBeLessThan(0.25);
    expect(sharpnessForNote(drum.closedHat)).toBeGreaterThan(0.75);
    expect(sharpnessForNote(drum.kick)).toBeLessThan(sharpnessForNote(drum.snare));
    expect(sharpnessForNote(drum.snare)).toBeLessThan(sharpnessForNote(drum.closedHat));
  });

  test('a non-kit note falls back to the sub value', () => {
    expect(sharpnessForNote(36)).toBeLessThan(0.25);
    expect(sharpnessForNote(120)).toBeLessThan(0.25);
  });
});

describe('compile', () => {
  test('one onset per euclidean pulse, velocity as amplitude', () => {
    const { pattern: p, loopTicks, merged } = compilePatternToHaptics(pattern([lane()]), 120);
    expect(loopTicks).toBe(96);
    expect(merged).toBe(0);
    expect(p.discretePattern.length).toBe(4); // E(4,16)
    expect(p.discretePattern[0].time).toBe(0);
    expect(p.discretePattern[0].amplitude).toBeCloseTo(100 / 127, 5);
    // 1/16 at 120bpm = 125ms, and E(4,16) is evenly spaced.
    expect(p.discretePattern[1].time).toBeCloseTo(500, 5);
  });

  test('a continuous envelope is never emitted under a drum pattern', () => {
    const { pattern: p } = compilePatternToHaptics(pattern([lane()]), 120);
    expect(p.continuousPattern.amplitude).toEqual([]);
    expect(p.continuousPattern.frequency).toEqual([]);
  });

  test('coincident onsets merge, keeping the louder hit', () => {
    // Kick and hat both land on step 0. One actuator cannot play them apart.
    const kick = lane({ id: 'k', genA: { pulses: 1, rotation: 0 }, velocity: 120 });
    const hat = lane({
      id: 'h',
      genA: { pulses: 1, rotation: 0 },
      note: drum.closedHat,
      velocity: 40,
    });
    const { pattern: p, merged } = compilePatternToHaptics(pattern([kick, hat]), 120);
    expect(merged).toBe(1);
    expect(p.discretePattern.length).toBe(1);
    expect(p.discretePattern[0].amplitude).toBeCloseTo(120 / 127, 5);
    // Amplitude-weighted, so the loud kick dominates the quiet hat's sharpness.
    expect(p.discretePattern[0].frequency).toBeLessThan(
      (sharpnessForNote(drum.kick) + sharpnessForNote(drum.closedHat)) / 2,
    );
  });

  test('hits closer than the actuator can resolve merge too', () => {
    // 1/16 at 300bpm = 50ms apart — kept. At 600 it would be 25ms — merged.
    const dense = lane({ genA: { pulses: 16, rotation: 0 } });
    const wide = compilePatternToHaptics(pattern([dense]), 300);
    expect(wide.merged).toBe(0);
    expect(wide.pattern.discretePattern.length).toBe(16);

    const tight = compilePatternToHaptics(pattern([dense]), 600);
    expect(tight.merged).toBeGreaterThan(0);
    for (let i = 1; i < tight.pattern.discretePattern.length; i++) {
      const gap = tight.pattern.discretePattern[i].time - tight.pattern.discretePattern[i - 1].time;
      expect(gap).toBeGreaterThanOrEqual(HAPTIC_MIN_GAP_MS);
    }
  });

  test('nothing audible compiles to nothing', () => {
    const { pattern: p, loopTicks } = compilePatternToHaptics(
      pattern([lane({ muted: true })]),
      120,
    );
    expect(p.discretePattern).toEqual([]);
    expect(loopTicks).toBe(0);
  });
});

describe('rhythm signature', () => {
  test('ignores what the compile never reads', () => {
    const a = pattern([lane()]);
    const b: Pattern = { ...a, name: 'renamed', icon: 'x', updatedAt: 999 };
    expect(rhythmSignature(b, 120)).toBe(rhythmSignature(a, 120));
  });

  test('changes on anything that would sound different', () => {
    const a = pattern([lane()]);
    expect(rhythmSignature(pattern([lane({ velocity: 20 })]), 120)).not.toBe(
      rhythmSignature(a, 120),
    );
    expect(rhythmSignature(pattern([lane({ muted: true })]), 120)).not.toBe(
      rhythmSignature(a, 120),
    );
    expect(rhythmSignature(a, 140)).not.toBe(rhythmSignature(a, 120));
  });
});
