/**
 * Soft fallbacks for native modules that newer JS references but older dev
 * builds don't contain (expo-updates, expo-observe). Importing either package
 * throws "Cannot find native module …" on a build that predates it, which
 * would take down the whole bundle over Fast Refresh. These shims degrade to
 * no-ops with a console.warn instead — the same pattern as
 * components/ui/keyboard.ts (react-native-keyboard-controller) and
 * state/persistence.ts (expo-sqlite).
 *
 * TODO: delete this file and import the packages directly once every
 * installed dev build ships both native modules.
 */
import type { ComponentType } from 'react';

type UseUpdates = () => { isUpdatePending: boolean };

let useUpdatesImpl: UseUpdates = () => ({ isUpdatePending: false });
let reloadAsyncImpl: () => Promise<void> = async () => {};
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const updates = require('expo-updates');
  useUpdatesImpl = updates.useUpdates;
  reloadAsyncImpl = updates.reloadAsync;
} catch {
  console.warn('[euxy] expo-updates native module missing — OTA updates disabled on this build.');
}

export const useUpdates: UseUpdates = (...args) => useUpdatesImpl(...args);
export const reloadUpdateAsync = () => reloadAsyncImpl();

type UseObserve = () => { markInteractive: () => void };

let observeConfigure: (options: unknown) => void = () => {};
let observeRootWrap = <P extends object>(c: ComponentType<P>): ComponentType<P> => c;
let useObserveImpl: UseObserve = () => ({ markInteractive: () => {} });
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const observe = require('expo-observe');
  observeConfigure = (options) => observe.Observe.configure(options);
  observeRootWrap = (c) => observe.ObserveRoot.wrap(c);
  useObserveImpl = observe.useObserve;
} catch {
  console.warn('[euxy] expo-observe native module missing — metrics disabled on this build.');
}

export const configureObserve = (options: unknown) => observeConfigure(options);
export const wrapWithObserveRoot = observeRootWrap;
export const useObserve: UseObserve = (...args) => useObserveImpl(...args);

type ImpactStyle = 'light' | 'medium' | 'heavy' | 'soft' | 'rigid';
type HapticsApi = {
  /** Key-press weight feedback (defaults to light). */
  impact: (style?: ImpactStyle) => void;
  /** Browsing tick — pickers, pads, steppers, list taps. */
  selection: () => void;
  success: () => void;
  warning: () => void;
};

const noHaptics: HapticsApi = { impact: () => {}, selection: () => {}, success: () => {}, warning: () => {} };
let hapticsImpl = noHaptics;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const h = require('expo-haptics');
  const impactStyles: Record<ImpactStyle, unknown> = {
    light: h.ImpactFeedbackStyle.Light,
    medium: h.ImpactFeedbackStyle.Medium,
    heavy: h.ImpactFeedbackStyle.Heavy,
    soft: h.ImpactFeedbackStyle.Soft,
    rigid: h.ImpactFeedbackStyle.Rigid,
  };
  // Fire-and-forget: feedback must never throw into a press handler.
  hapticsImpl = {
    impact: (style = 'light') => void h.impactAsync(impactStyles[style]).catch(() => {}),
    selection: () => void h.selectionAsync().catch(() => {}),
    success: () => void h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {}),
    warning: () => void h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => {}),
  };
} catch {
  console.warn('[euxy] expo-haptics native module missing — haptics disabled on this build.');
}

export const haptics: HapticsApi = {
  impact: (style) => hapticsImpl.impact(style),
  selection: () => hapticsImpl.selection(),
  success: () => hapticsImpl.success(),
  warning: () => hapticsImpl.warning(),
};

let GlassViewImpl: ComponentType<Record<string, unknown>> | null = null;
let liquidGlass = false;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const glass = require('expo-glass-effect');
  liquidGlass = glass.isLiquidGlassAvailable?.() ?? false;
  GlassViewImpl = glass.GlassView;
} catch {
  console.warn('[euxy] expo-glass-effect native module missing — solid capsule fallback.');
}

/** Native Liquid Glass (iOS 26+). `null` / `false` on older iOS, Android and
 * builds without the native module — callers render their solid fallback. */
export const GlassView = liquidGlass ? GlassViewImpl : null;
export const liquidGlassAvailable = liquidGlass && GlassViewImpl != null;
