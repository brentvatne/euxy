/**
 * MIDI stack — large-title grouped form (Connection / Timing / Diagnostics /
 * Defaults / Panic). This tab is also the entire web experience. Filled by
 * Agent D.
 */
import { Stack } from 'expo-router/stack';

import { color } from '@/theme/tokens';

export default function MidiStack() {
  return (
    <Stack
      // Correct iOS large-title recipe: the header is TRANSPARENT and the
      // scroll view supplies the background (contentInsetAdjustmentBehavior
      // "automatic"). An opaque headerStyle/headerLargeStyle makes the
      // large→small collapse fight the scroll view and stutter.
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
      <Stack.Screen name="midi" options={{ title: 'MIDI' }} />
      <Stack.Screen name="activity-log" options={{ title: 'Activity Log', headerLargeTitle: false }} />
    </Stack>
  );
}
