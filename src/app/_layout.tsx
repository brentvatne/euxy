/**
 * Root navigator. A Stack that hosts the tab group plus the app's form sheets
 * (so a sheet presents over the tabs from anywhere). Dark monochrome theme is
 * applied here via ThemeProvider; the tab bar takes its own tint in (tabs).
 */
import { ThemeProvider } from 'expo-router/react-navigation';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { navTheme } from '@/theme/navigation';
import { color } from '@/theme/tokens';

const sheetOptions = {
  presentation: 'formSheet',
  sheetGrabberVisible: true,
  headerShown: false,
  contentStyle: { backgroundColor: color.surface },
} as const;

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={navTheme}>
        <StatusBar style="light" />
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: color.ground } }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="lane-editor"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.6, 1.0] }}
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
            name="enable-midi"
            options={{ ...sheetOptions, sheetAllowedDetents: [0.6] }}
          />
        </Stack>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
