/**
 * React Navigation theme for the app — dark, monochrome, tint overridden to
 * white so no system blue leaks into headers, back buttons, or controls.
 * Consumed by the root ThemeProvider (see src/app/_layout.tsx). NativeTabs takes
 * its own `tintColor` prop separately.
 */
import { Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DarkTheme, DefaultTheme, type Theme } from 'expo-router/react-navigation';

import { palette, type Scheme, font, radius } from './tokens';
import { useScheme } from './theme';

export function navThemeFor(scheme: Scheme): Theme {
  const color = palette[scheme];
  const base = scheme === 'light' ? DefaultTheme : DarkTheme;
  return {
  ...base,
  dark: scheme === 'dark',
  colors: {
    ...base.colors,
    primary: color.label, // tint (back chevrons, active controls) → white
    background: color.ground,
    card: color.ground, // headers blend into the ground; no gray header bar
    text: color.label,
    border: color.separator,
    notification: color.danger,
  },
  fonts: base.fonts,
  };
}

/** The React Navigation theme for the active scheme. */
export function useNavTheme(): Theme {
  return navThemeFor(useScheme());
}

/** Tab bar + control tint. White = active/primary per the monochrome rule. */
export const tintFor = (scheme: Scheme) => palette[scheme].label;

/**
 * Shared form-sheet screen options. Lives here (not in the root layout) because
 * sheets are registered in two navigators: most in the root Stack, and the
 * shared-pattern sheet inside the Patterns tab's stack (see
 * app/(tabs)/(patterns)/_layout.tsx). Detents stay per-screen.
 */
export const sheetOptionsFor = (scheme: Scheme) =>
  ({
    presentation: 'formSheet',
    sheetGrabberVisible: true,
    sheetCornerRadius: radius.sheet,
    headerShown: false,
    contentStyle: { backgroundColor: palette[scheme].surface },
  }) as const;

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
export const largeTitleStackOptionsFor = (scheme: Scheme) => {
  const color = palette[scheme];
  return Platform.select({
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
};

/**
 * Tab-stack content style that keeps screens out of a side rail. On iPhone Duo
 * the system controls (clock, Dynamic Island) and the tab bar sit in a vertical
 * rail on the left or right edge, which iOS reports as a ~84pt left or right
 * safe-area inset. Applied as the tab stacks' contentStyle, it pads every tab
 * screen's content while the native header and tab bar stay where iOS puts
 * them. The root Stack's sheets add it to their own contentStyle (sheetOptionsFor):
 * on the outer display the rail's clock and Wi-Fi pill overlap a sheet's right
 * edge, its Done button among it. Zero on phones, so nothing moves there.
 */
export function useRailContentStyle() {
  const insets = useSafeAreaInsets();
  return { paddingLeft: insets.left, paddingRight: insets.right };
}

export { font };

/**
 * Android tab bar in the app's grays. Without this the Material 3 defaults
 * leak through: a lavender-tinted surface and a periwinkle active-indicator
 * pill, the only hue on an otherwise monochrome screen. iOS ignores every key
 * here (the bar stays translucent white-on-black), so this is Android-only.
 */
export const androidTabBarOptionsFor = (scheme: Scheme) => {
  const color = palette[scheme];
  return Platform.select({
  android: {
    backgroundColor: color.surface,
    indicatorColor: color.surface4,
    rippleColor: scheme === 'light' ? 'rgba(10, 10, 12, 0.08)' : 'rgba(246, 244, 244, 0.10)',
    iconColor: { default: color.label3, selected: color.label },
    labelStyle: {
      default: { color: color.label3, fontFamily: font.text },
      selected: { color: color.label, fontFamily: font.text },
    },
  },
  default: {},
});
};
