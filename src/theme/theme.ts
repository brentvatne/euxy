/**
 * Scheme-aware access to the design tokens. The app follows the system
 * appearance (`userInterfaceStyle: automatic`) unless Settings pins one
 * (`applyThemePreference`); every component reads its
 * colors through `useTheme()` or a `themed()` StyleSheet so both schemes come
 * from the one palette table in tokens.ts.
 *
 *   const stylesFor = themed(({ color }) => ({ root: { backgroundColor: color.ground } }));
 *   function Screen() {
 *     const styles = useStyles(stylesFor);
 *     const { color } = useTheme();
 *     ...
 *   }
 *
 * `themed()` builds one StyleSheet per scheme at module load, so render cost is
 * a lookup, not a StyleSheet.create.
 */
import { Appearance, StyleSheet, useColorScheme } from 'react-native';

import {
  keyRamp,
  lightRamp,
  ramp as darkRamp,
  lightKeyRamp,
  palette,
  type Palette,
  type Scheme,
  selectionFor,
  stepFillFor,
} from './tokens';

import type { ThemePreference } from '@/state/types';

/**
 * Apply the Settings → Appearance choice. `Appearance.setColorScheme` overrides
 * what `useColorScheme()` reports app-wide (and the iOS window's
 * `overrideUserInterfaceStyle` / Android night mode, so native sheets and the
 * tab bar follow); `unspecified` hands control back to the system.
 */
export function applyThemePreference(theme: ThemePreference): void {
  // react-native-web's Appearance has no setColorScheme; the web build follows
  // the system scheme.
  if (typeof Appearance.setColorScheme !== 'function') return;
  Appearance.setColorScheme(theme === 'auto' ? 'unspecified' : theme);
}

export type Theme = {
  scheme: Scheme;
  color: Palette;
  keyRamp: readonly string[];
  ramp: typeof darkRamp | typeof lightRamp;
  /** Fill for a step at `slot`, wrapped into its 16-slot row. */
  stepFill: (slot: number) => string;
  /** TextInput selection highlight. */
  selection: string;
};

function buildTheme(scheme: Scheme): Theme {
  return {
    scheme,
    color: palette[scheme],
    keyRamp: scheme === 'light' ? lightKeyRamp : keyRamp,
    ramp: scheme === 'light' ? lightRamp : darkRamp,
    stepFill: (slot) => stepFillFor(scheme, slot),
    selection: selectionFor(scheme),
  };
}

export const themes: Record<Scheme, Theme> = { dark: buildTheme('dark'), light: buildTheme('light') };

/** `light` only when the system says so; `null`/unknown (and web SSR) stay dark, the app's home scheme. */
export function schemeOf(value: string | null | undefined): Scheme {
  return value === 'light' ? 'light' : 'dark';
}

/** The active color scheme. */
export function useScheme(): Scheme {
  return schemeOf(useColorScheme());
}

/** The active theme: palette, ramps and selection color for the current scheme. */
export function useTheme(): Theme {
  return themes[useScheme()];
}

/** The theme outside React (module-scope defaults, imperative code). Prefer `useTheme()`. */
export function currentTheme(): Theme {
  return themes[schemeOf(Appearance.getColorScheme())];
}

export type ThemedStyles<T extends StyleSheet.NamedStyles<T>> = Record<Scheme, T>;

/** One StyleSheet per scheme from a factory over the theme. Pair with `useStyles`. */
export function themed<T extends StyleSheet.NamedStyles<T>>(
  factory: (theme: Theme) => T & StyleSheet.NamedStyles<T>,
): ThemedStyles<T> {
  return { dark: StyleSheet.create(factory(themes.dark)), light: StyleSheet.create(factory(themes.light)) };
}

/** The StyleSheet of a `themed()` pair for the current scheme. */
export function useStyles<T extends StyleSheet.NamedStyles<T>>(styles: ThemedStyles<T>): T {
  return styles[useScheme()];
}
