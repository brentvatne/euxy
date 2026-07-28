/**
 * Boot → header-chip handoff (ROADMAP "Splash boot sequence"): as the boot
 * grid decays out, the SAME glyph relights inside the sequencer-header chip.
 * This shared value is the bridge — BootSplash zeroes it on mount (the chip
 * is hidden behind the opaque overlay anyway) and types it back to 1 as the
 * overlay fades; the header LedChip gates its lit cells on it.
 *
 * This module is also the boot LAYOUT GATE: the app's first screen reports its
 * first onLayout here so BootSplash can hold the native splash until real UI
 * has rendered AND laid out beneath the overlay — not merely JS-mounted.
 *
 * The gate is deliberately route-AGNOSTIC. It used to require the SEQUENCER
 * specifically, which is wrong: the app can legitimately launch onto another
 * tab (EAS Observe recorded 13 of 80 startups with /(tabs)/(midi) as the
 * launch route) and NativeTabs does not mount unfocused tabs — so on those
 * launches the gate could never pass and the 2s failsafe became the boot path.
 * One observed cold launch took 2.46s with a frozen frame for exactly that
 * reason. Whichever screen lays out first now satisfies the gate; every tab
 * root reports.
 */
import { makeMutable } from 'react-native-reanimated';

export const bootChipProgress = makeMutable(1);

/**
 * Module-eval time — the earliest clock the JS side has. Elapsed values
 * measured from here EXCLUDE native launch and bundle load, so treat them as
 * a relative regression signal, not an absolute launch time. (The absolute
 * number is `expo.app_startup.tti`, which correctly includes the boot
 * animation because the overlay blocks touches for its whole duration.)
 */
const bootStartedAt = Date.now();

export function bootElapsedMs(): number {
  return Date.now() - bootStartedAt;
}

let firstScreenLaidOut = false;
let pending: (() => void) | null = null;

/**
 * The first screen's first onLayout flips this gate (exactly once, whichever
 * route it happens to be). Safe to wire into every tab root — later callers
 * are no-ops.
 */
export function reportFirstScreenLayout(): void {
  if (firstScreenLaidOut) return;
  firstScreenLaidOut = true;
  const cb = pending;
  pending = null;
  cb?.();
}

/**
 * Run `cb` once the first screen has laid out — immediately if it already has,
 * which covers the layout-fired-before-subscribe race. Single subscriber
 * (BootSplash). Returns an unsubscribe.
 */
export function onFirstScreenLayout(cb: () => void): () => void {
  if (firstScreenLaidOut) {
    cb();
    return () => {};
  }
  pending = cb;
  return () => {
    if (pending === cb) pending = null;
  };
}
