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
interface Haptics {
  impact(style?: ImpactStyle): void;
  selection(): void;
  success(): void;
  warning(): void;
}

let hapticsImpl: Haptics = {
  impact: () => {},
  selection: () => {},
  success: () => {},
  warning: () => {},
};
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
  // Fire-and-forget; a haptic that fails to play is not worth an unhandled
  // rejection (calls throw on builds whose binary predates the module).
  hapticsImpl = {
    impact: (style = 'light') => h.impactAsync(impactStyles[style]).catch(() => {}),
    selection: () => h.selectionAsync().catch(() => {}),
    success: () => h.notificationAsync(h.NotificationFeedbackType.Success).catch(() => {}),
    warning: () => h.notificationAsync(h.NotificationFeedbackType.Warning).catch(() => {}),
  };
} catch {
  console.warn('[euxy] expo-haptics native module missing — haptics disabled on this build.');
}

/** Haptic vocabulary: impact = key press-in, selection = fine ticks (ring
 * quarters), success/warning = resolutions. No-ops (with the warn above) on
 * builds without the native module. */
export const haptics: Haptics = {
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
