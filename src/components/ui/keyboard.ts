/**
 * react-native-keyboard-controller bindings with a soft fallback.
 *
 * The library is a NATIVE module: on a dev build that doesn't include it yet,
 * merely importing the package throws its LINKING_ERROR (the native binding is
 * a Proxy that throws on any access, and module scope constructs a
 * NativeEventEmitter over it). This shim catches that and degrades to a plain
 * ScrollView / pass-through provider so the app keeps running on older builds;
 * on builds that include the module it transparently upgrades to the real
 * components. Composition follows the library's `choose-rnkc-keyboard-layout`
 * skill: ONE keyboard owner per screen — KeyboardAwareScrollView for
 * scrollable forms that must reveal the focused input.
 *
 * TODO: once every installed dev build ships the native module, replace this
 * shim with direct imports.
 */
import type { ComponentType, PropsWithChildren } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';

export interface KeyboardAwareScrollViewProps extends ScrollViewProps {
  /** Distance kept between the keyboard and the focused input (pt). */
  bottomOffset?: number;
  extraKeyboardSpace?: number;
}

let Provider: ComponentType<PropsWithChildren> = ({ children }: PropsWithChildren) =>
  children as React.ReactElement;
let AwareScrollView: ComponentType<KeyboardAwareScrollViewProps> = ScrollView;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rnkc = require('react-native-keyboard-controller');
  Provider = rnkc.KeyboardProvider;
  AwareScrollView = rnkc.KeyboardAwareScrollView;
} catch {
  console.warn(
    '[euxy] react-native-keyboard-controller native module missing — using plain ScrollView. Install a dev build that includes it.',
  );
}

export const KeyboardProvider = Provider;
export const KeyboardAwareScrollView = AwareScrollView;
