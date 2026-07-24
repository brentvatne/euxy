/**
 * Lane factory — shared by the store and the preset library (its own module
 * so store ↔ presets never form a require cycle).
 */
import { timing } from '@/theme/tokens';
import type { Lane } from './types';

let counter = 0;
export const uid = (prefix: string) =>
  `${prefix}_${(counter++).toString(36)}${Date.now().toString(36)}`;

/** A new lane with sensible defaults, single-generator (genB.pulses = 0). */
export function makeLane(overrides: Partial<Lane> = {}): Lane {
  return {
    id: uid('lane'),
    length: 16,
    genA: { pulses: 4, rotation: 0 },
    genB: { pulses: 0, rotation: 0 },
    op: 'OR',
    trackRot: 0,
    note: 60,
    channel: 0,
    velocity: 100,
    gateMs: timing.defaultGateMs,
    resolutionTicks: timing.defaultResolutionTicks,
    muted: false,
    solo: false,
    ...overrides,
  };
}
