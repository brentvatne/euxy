/**
 * Derived state + reusable selector hooks. Keep selectors narrow so components
 * only re-render on the slice they read.
 */
import { laneAudible, patternForLane } from '@/core/lane-pattern';
import { useStore, type AppState } from './store';
import type { Pattern } from './types';

export { laneAudible, patternForLane };

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

// patternForLane moved to core/lane-pattern.ts (pure — shared with the web
// app) and re-exported above so existing imports keep working.

// laneAudible moved to core/lane-pattern.ts alongside patternForLane (both
// pure) and is re-exported above so existing imports keep working.
