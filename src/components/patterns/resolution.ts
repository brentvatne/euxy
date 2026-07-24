/**
 * Base-resolution helpers. `baseResolutionTicks` is ticks-per-step at 24 PPQN;
 * these map it to the musical note-value labels shown in the UI.
 */
export interface ResolutionOption {
  label: string;
  ticks: number;
}

/** Selectable base resolutions, coarse → fine (24 PPQN). */
export const RESOLUTIONS: ResolutionOption[] = [
  { label: '1/4', ticks: 24 },
  { label: '1/8', ticks: 12 },
  { label: '1/16', ticks: 6 },
  { label: '1/32', ticks: 3 },
];

/** Note-value label for a tick count, e.g. 6 → "1/16". Falls back to raw ticks. */
export function resolutionLabel(ticks: number): string {
  return RESOLUTIONS.find((r) => r.ticks === ticks)?.label ?? `${ticks}t`;
}
