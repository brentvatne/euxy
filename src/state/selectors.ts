/**
 * Derived state + reusable selector hooks. Keep selectors narrow so components
 * only re-render on the slice they read.
 */
import { combine, generator, withRotation } from '@/core/euclid';
import { useStore, type AppState } from './store';
import type { Lane, Pattern } from './types';

export const selectActivePattern = (s: AppState): Pattern =>
  s.patterns.find((p) => p.id === s.activePatternId) ?? s.patterns[0];

export const useActivePattern = () => useStore(selectActivePattern);
export const useLanes = () => useStore((s) => selectActivePattern(s).lanes);
export const useLane = (id: string | null) =>
  useStore((s) => (id ? (selectActivePattern(s).lanes.find((l) => l.id === id) ?? null) : null));
export const useTransport = () => useStore((s) => s.transport);
export const useSettings = () => useStore((s) => s.settings);
export const usePatterns = () => useStore((s) => s.patterns);
export const useAnySolo = () => useStore((s) => selectActivePattern(s).lanes.some((l) => l.solo));

/**
 * The played 0/1 pattern for a lane: generator A combined with generator B by
 * `op`, then whole-track rotated. A lane with `genB.pulses = 0` is treated as
 * single-generator (just A) regardless of `op`, so default lanes never fall
 * silent under AND.
 */
export function patternForLane(lane: Lane): number[] {
  const a = generator(lane.genA.pulses, lane.length, lane.genA.rotation);
  const combined =
    lane.genB.pulses > 0
      ? combine(a, generator(lane.genB.pulses, lane.length, lane.genB.rotation), lane.op)
      : a;
  return withRotation(combined, lane.trackRot);
}

/**
 * Whether a lane should sound, honoring solo precedence: if any lane is soloed,
 * only soloed lanes sound; otherwise all non-muted lanes sound.
 */
export function laneAudible(lane: Lane, anySolo: boolean): boolean {
  return anySolo ? lane.solo : !lane.muted;
}
