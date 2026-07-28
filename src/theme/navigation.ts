/**
 * React Navigation theme for the app — dark, monochrome, tint overridden to
 * white so no system blue leaks into headers, back buttons, or controls.
 * Consumed by the root ThemeProvider (see src/app/_layout.tsx). NativeTabs takes
 * its own `tintColor` prop separately.
 */
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

export { color, font };
