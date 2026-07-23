/**
 * React Navigation theme for the app — dark, monochrome, tint overridden to
 * white so no system blue leaks into headers, back buttons, or controls.
 * Consumed by the root ThemeProvider (see src/app/_layout.tsx). NativeTabs takes
 * its own `tintColor` prop separately.
 */
import { DarkTheme, type Theme } from 'expo-router/react-navigation';

import { color, font } from './tokens';

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
export { color, font };
