/**
 * Boot → header-chip handoff (ROADMAP "Splash boot sequence"): as the boot
 * grid decays out, the SAME glyph relights inside the sequencer-header chip.
 * This shared value is the bridge — BootSplash zeroes it on mount (the chip
 * is hidden behind the opaque overlay anyway) and types it back to 1 as the
 * overlay fades; the header LedChip gates its lit cells on it.
 *
 * This module is also the boot LAYOUT GATE: the sequencer screen (the app's
 * initial route) reports its first onLayout here so BootSplash can hold the
 * native splash until real UI has rendered AND laid out beneath the overlay —
 * not merely JS-mounted.
 */
import { makeMutable } from 'react-native-reanimated';

export const bootChipProgress = makeMutable(1);

let sequencerLaidOut = false;
let pending: (() => void) | null = null;

/** The sequencer screen's first onLayout flips this gate (exactly once). */
export function reportSequencerLayout(): void {
  if (sequencerLaidOut) return;
  sequencerLaidOut = true;
  const cb = pending;
  pending = null;
  cb?.();
}

/**
 * Run `cb` once the sequencer has laid out — immediately if it already has,
 * which covers the layout-fired-before-subscribe race. Single subscriber
 * (BootSplash). Returns an unsubscribe.
 */
export function onSequencerLayout(cb: () => void): () => void {
  if (sequencerLaidOut) {
    cb();
    return () => {};
  }
  pending = cb;
  return () => {
    if (pending === cb) pending = null;
  };
}
