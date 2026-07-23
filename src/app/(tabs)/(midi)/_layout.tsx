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
      screenOptions={{
        headerLargeTitle: true,
        headerTransparent: true,
        headerShadowVisible: false,
        headerBlurEffect: 'none',
        headerLargeStyle: { backgroundColor: color.ground },
        headerStyle: { backgroundColor: color.ground },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'MIDI' }} />
    </Stack>
  );
}
