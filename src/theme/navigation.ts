/**
 * React Navigation theme for the app — dark, monochrome, tint overridden to
 * white so no system blue leaks into headers, back buttons, or controls.
 * Consumed by the root ThemeProvider (see src/app/_layout.tsx). NativeTabs takes
 * its own `tintColor` prop separately.
 */
import { Platform } from 'react-native';
import { DarkTheme, type Theme } from 'expo-router/react-navigation';

import { color, font, radius } from './tokens';

export const navTheme: Theme = {
  ...DarkTheme,
  dark: true,
  colors: {
    ...DarkTheme.colors,
    primary: color.label, // tint (back chevrons, active controls) → white
    background: color.ground,
    card: color.ground, // headers blend into the ground; no gray header bar
    text: color.label,
    border: color.separator,
    notification: color.danger,
  },
  fonts: DarkTheme.fonts,
};

/** Tab bar + control tint. White = active/primary per the monochrome rule. */
export const TINT = color.label;

/**
 * Shared form-sheet screen options. Lives here (not in the root layout) because
 * sheets are registered in two navigators: most in the root Stack, and the
 * shared-pattern sheet inside the Patterns tab's stack (see
 * app/(tabs)/(patterns)/_layout.tsx). Detents stay per-screen.
 */
export const sheetOptions = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetCornerRadius: radius.sheet,
  headerShown: false,
  contentStyle: { backgroundColor: color.surface },
} as const;

/**
 * Screen options for the two large-title tabs (Patterns, MIDI).
 *
 * iOS: the header is TRANSPARENT and the scroll view supplies the background
 * (contentInsetAdjustmentBehavior "automatic"). An opaque headerStyle /
 * headerLargeStyle makes the large→small collapse fight the scroll view and
 * stutter.
 *
 * Android has no large titles and no automatic content insets, so a
 * transparent header would just float over the first rows: there the header
 * is an ordinary opaque bar in the ground color, flush with the content.
 */
export const largeTitleStackOptions = Platform.select({
  android: {
    headerTransparent: false,
    headerShadowVisible: false,
    headerStyle: { backgroundColor: color.ground },
    headerTintColor: color.label,
    headerTitleStyle: { color: color.label },
  },
  default: {
    headerLargeTitle: true,
    headerTransparent: true,
    headerShadowVisible: false,
    headerLargeTitleShadowVisible: false,
    headerBlurEffect: 'none',
    headerLargeStyle: { backgroundColor: 'transparent' },
    headerTintColor: color.label,
    headerLargeTitleStyle: { color: color.label },
    headerTitleStyle: { color: color.label },
  },
} as const);

export { color, font };

/**
 * Android tab bar in the app's grays. Without this the Material 3 defaults
 * leak through: a lavender-tinted surface and a periwinkle active-indicator
 * pill, the only hue on an otherwise monochrome screen. iOS ignores every key
 * here (the bar stays translucent white-on-black), so this is Android-only.
 */
export const androidTabBarOptions = Platform.select({
  android: {
    backgroundColor: color.surface,
    indicatorColor: color.surface4,
    rippleColor: 'rgba(246, 244, 244, 0.10)',
    iconColor: { default: color.label3, selected: color.label },
    labelStyle: {
      default: { color: color.label3, fontFamily: font.text },
      selected: { color: color.label, fontFamily: font.text },
    },
  },
  default: {},
});
