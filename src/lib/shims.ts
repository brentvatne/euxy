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
