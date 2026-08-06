/**
 * Root navigator. A Stack that hosts the tab group plus the app's form sheets
 * (so a sheet presents over the tabs from anywhere). Dark monochrome theme is
 * applied here via ThemeProvider; the tab bar takes its own tint in (tabs).
 */
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootSplash } from '@/components/boot-splash';
import { enableMidi } from '@/components/midi/runtime';
import { KeyboardProvider } from '@/components/ui/keyboard';
import { NoticeBanner } from '@/components/ui/notice-banner';
import { configureObserve, wrapWithObserveRoot } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { useShotRig } from '@/lib/shot-rig';
import { navTheme, sheetOptions } from '@/theme/navigation';
import { color } from '@/theme/tokens';

// EAS Observe: per-route navigation metrics. Must run at module scope,
// before any screen mounts.
configureObserve({
  integrations: { 'expo-router': true },
});

/**
 * The tab group is this Stack's anchor, so a link that resolves to one of the
 * sheets above (only /c/<channel> today) always lands with the tabs mounted
 * underneath — a form sheet needs a screen to present on top of, and the app
 * needs somewhere to be once the sheet is dismissed. Groups get this from their
 * matching route name; the root has no group, so it is declared.
 */
export const unstable_settings = { anchor: '(tabs)' };

function RootLayout() {
  // Simulator screenshot staging (no-op unless the host set the flag).
  useShotRig();

  // Bring MIDI up at launch. Enabling is what attaches the hot-plug listener,
  // the health watchdog, and OP-XY autoconnect — leaving it to the MIDI tab's
  // mount meant a launch straight into the Sequencer never noticed a device
  // plugged in later. (Web still needs its explicit enable tap: permission
  // prompts require a user gesture there.)
  useEffect(() => {
    if (Platform.OS !== 'web') void enableMidi();
  }, []);

  // App-level TTI. Note this reports the FULL boot sequence, not the moment the
  // tree mounts: BootSplash's overlay is pointerEvents:'auto' for its whole
  // ~900ms, so the app genuinely is not interactive until the fade ends. Real
  // readiness underneath is the `boot.ready` event instead.
  useMarkInteractive();

  return (
    // Every touch target now goes through gesture-handler's Pressable, whose
    // GestureDetector requires a GestureHandlerRootView ancestor somewhere in
    // the tree — without one it throws at render time (any screen not nested
    // under one of the older screen-local wrappers).
    <GestureHandlerRootView style={{ flex: 1 }}>
    <SafeAreaProvider>
      <KeyboardProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="lane-editor"
            options={{ ...sheetOptions, sheetAllowedDetents: [1.0] }}
          />
          <Stack.Screen
            name="device-picker"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.5] }}
          />
          <Stack.Screen
            name="new-pattern"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.6] }}
          />
          <Stack.Screen
            name="change-icon"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.75] }}
          />
          <Stack.Screen
            name="enable-midi"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.6] }}
          />
          <Stack.Screen
            name="tempo"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.45] }}
          />
          <Stack.Screen
            name="share-pattern"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.9] }}
          />
          {/* Hidden debug sheet — long-press the MIDI tab's Diagnostics
              header. Switches the EAS Update channel at runtime. */}
          <Stack.Screen
            name="channel-surf"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.6] }}
          />
          {/* The channel link (euxy://c/<channel>). Deliberately NOT a sheet:
              a form sheet presented across an expo-updates reload latches
              react-native-screens' _updatingModals flag and no sheet in the app
              can ever present again (see c/[channel].tsx). This route applies
              the override and pops straight back to the tabs, so nothing is
              presented when the reload lands. It stays in THIS Stack because
              the anchor declared above guarantees a screen to pop back to. */}
          <Stack.Screen name="c/[channel]" options={{ animation: 'none' }} />
          {/* NOTE: the shared-pattern sheet (/p) is NOT here — it lives in the
              Patterns tab's stack so an incoming link opens the library it is
              about. See app/(tabs)/(patterns)/_layout.tsx. */}
        </Stack>
        {/* Transient status line (channel switches today). Above the Stack,
            below the boot overlay, pointerEvents 'none' always. */}
        <NoticeBanner />
        {/* LED power-on: a pure LAYER over the live app — the Stack above
            always renders (never conditionally hidden behind the boot), so
            the fade reveals UI that was already there. BootSplash holds the
            native splash until this tree has rendered and laid out. */}
        <BootSplash />
      </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

export default wrapWithObserveRoot(RootLayout);
