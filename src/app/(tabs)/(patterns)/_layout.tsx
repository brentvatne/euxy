/**
 * Patterns stack — large-title list (search bar added by Agent C).
 */
import { Stack } from 'expo-router/stack';

import { color } from '@/theme/tokens';

export default function PatternsStack() {
  return (
    <Stack
      // Same transparent large-title recipe as the MIDI stack — an opaque
      // header makes the large-title collapse stutter.
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerLargeTitleShadowVisible: false,
        headerBlurEffect: 'none',
        headerLargeStyle: { backgroundColor: 'transparent' },
        headerTintColor: color.label,
        headerLargeTitleStyle: { color: color.label },
        headerTitleStyle: { color: color.label },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Patterns' }} />
    </Stack>
  );
}
