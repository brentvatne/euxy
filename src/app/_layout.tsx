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
import { configureObserve, wrapWithObserveRoot } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { useShotRig } from '@/lib/shot-rig';
import { navTheme } from '@/theme/navigation';
import { color, radius } from '@/theme/tokens';

// EAS Observe: per-route navigation metrics. Must run at module scope,
// before any screen mounts.
configureObserve({
  integrations: { 'expo-router': true },
});

const sheetOptions = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  sheetCornerRadius: radius.sheet,
  headerShown: false,
  contentStyle: { backgroundColor: color.surface },
} as const;

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
          {/* Shared patterns arriving via universal link or euxy://. Two URL
              shapes, one sheet: /p/<payload> is canonical, /p?d=<payload> is
              kept for links already in the wild. */}
          <Stack.Screen name="p" options={{ ...sheetOptions, sheetAllowedDetents: [0.45] }} />
          <Stack.Screen name="p/[d]" options={{ ...sheetOptions, sheetAllowedDetents: [0.45] }} />
        </Stack>
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
