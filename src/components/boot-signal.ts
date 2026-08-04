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
 *
 * And it carries the gate in the other direction: BootSplash reports when its
 * overlay is finally GONE, so the one entrance meant to be seen on app open
 * (the sequencer's floating capsule) can wait for a frame the user can
 * actually see.
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

// --- Boot kind: native launch vs expo-updates reload -----------------------

const RELOAD_PENDING_KEY = 'bootReloadPending';

type Kv = {
  getItemSync(key: string): string | null;
  setItemSync(key: string, value: string): void;
  removeItemSync(key: string): void;
};

function kvStore(): Kv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-sqlite/kv-store').default as Kv;
  } catch {
    return null;
  }
}

/** Set right before expo-updates' reloadAsync tears this bundle down, so the
 * bundle eval it produces can tell itself apart from a native launch. */
export function markPendingBootReload(): void {
  try {
    kvStore()?.setItemSync(RELOAD_PENDING_KEY, '1');
  } catch {
    // Best effort — a missed marker only costs one mislabeled boot.ready.
  }
}

/** A reload that failed never happened — don't tag the next real launch. */
export function clearPendingBootReload(): void {
  try {
    kvStore()?.removeItemSync(RELOAD_PENDING_KEY);
  } catch {
    // Same best-effort contract as markPendingBootReload.
  }
}

/**
 * How this bundle eval came to run. 'launch' is the OS starting the app —
 * warm launches never re-eval JS, so there is no third case. 'reload' is
 * expo-updates' reloadAsync (channel surf, applying a staged update) booting
 * the JS a second time inside the same native session. EAS Observe showed
 * reload boots re-firing `boot.ready` with ~200ms elapsed_ms seconds after
 * the real one; the event carries this kind so those can be filtered out of
 * launch-time stats. Read (and cleared from disk) once at module eval.
 */
export const bootKind: 'launch' | 'reload' = (() => {
  try {
    const kv = kvStore();
    if (kv?.getItemSync(RELOAD_PENDING_KEY) == null) return 'launch';
    kv.removeItemSync(RELOAD_PENDING_KEY);
    return 'reload';
  } catch {
    return 'launch';
  }
})();

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

let overlayGone = false;
let overlayPending: (() => void) | null = null;

/** BootSplash flips this once its overlay has fully faded out (exactly once). */
export function reportBootOverlayGone(): void {
  if (overlayGone) return;
  overlayGone = true;
  const cb = overlayPending;
  overlayPending = null;
  cb?.();
}

/**
 * Run `cb` once the boot overlay is gone — immediately if it already is.
 * Anything that wants to be SEEN animating in on app open waits on this: the
 * whole app renders BEHIND an opaque overlay for the entire boot sequence, so
 * an entrance that starts at mount is finished before the first visible frame.
 * Single subscriber (the sequencer capsule). Returns an unsubscribe.
 */
export function onBootOverlayGone(cb: () => void): () => void {
  if (overlayGone) {
    cb();
    return () => {};
  }
  overlayPending = cb;
  return () => {
    if (overlayPending === cb) overlayPending = null;
  };
}
