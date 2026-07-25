/**
 * Root navigator. A Stack that hosts the tab group plus the app's form sheets
 * (so a sheet presents over the tabs from anywhere). Dark monochrome theme is
 * applied here via ThemeProvider; the tab bar takes its own tint in (tabs).
 */
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { BootSplash } from '@/components/boot-splash';
import { enableMidi } from '@/components/midi/runtime';
import { KeyboardProvider } from '@/components/ui/keyboard';
import {
  configureObserve,
  reloadUpdateAsync,
  useObserve,
  useUpdates,
  wrapWithObserveRoot,
} from '@/lib/shims';
import { useShotRig } from '@/lib/shot-rig';
import { navTheme } from '@/theme/navigation';
import { color } from '@/theme/tokens';

// EAS Observe: per-route navigation metrics. Must run at module scope,
// before any screen mounts.
configureObserve({
  integrations: { 'expo-router': true },
});

/**
 * OTA updates: expo-updates checks + downloads on launch (default
 * checkAutomatically: ON_LOAD); once the download is ready we prompt to
 * reload so the user applies it on their own terms. "Later" leaves the
 * update staged for the next cold launch. No-ops in dev clients.
 */
function useUpdatePrompt() {
  const { isUpdatePending } = useUpdates();
  const prompted = useRef(false);
  useEffect(() => {
    if (__DEV__ || !isUpdatePending || prompted.current) return;
    prompted.current = true;
    Alert.alert('Update ready', 'A new version of euxy has been downloaded. Reload now to apply it?', [
      { text: 'Later', style: 'cancel' },
      { text: 'Reload', onPress: () => reloadUpdateAsync() },
    ]);
  }, [isUpdatePending]);
}

const sheetOptions = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: color.surface },
} as const;

function RootLayout() {
  useUpdatePrompt();
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

  // App-level TTI: no splash-blocking work exists (store hydration is a sync
  // SQLite read), so the app is interactive as soon as the root mounts.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);

  return (
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
          {/* /p — shared patterns arriving via universal link or euxy:// */}
          <Stack.Screen name="p" options={{ ...sheetOptions, sheetAllowedDetents: [0.45] }} />
        </Stack>
        {/* LED power-on: a pure LAYER over the live app — the Stack above
            always renders (never conditionally hidden behind the boot), so
            the fade reveals UI that was already there. BootSplash holds the
            native splash until this tree has rendered and laid out. */}
        <BootSplash />
      </ThemeProvider>
      </KeyboardProvider>
    </SafeAreaProvider>
  );
}

export default wrapWithObserveRoot(RootLayout);
