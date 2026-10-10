/**
 * MIDI stack — large-title grouped form (Connection / Timing / Diagnostics /
 * Defaults / Panic). This tab is also the entire web experience. Filled by
 * Agent D.
 */
import { Stack } from 'expo-router/stack';

import { largeTitleStackOptions } from '@/theme/navigation';

export default function MidiStack() {
  return (
    <Stack screenOptions={largeTitleStackOptions}>
      <Stack.Screen name="midi" options={{ title: 'MIDI' }} />
      <Stack.Screen name="activity-log" options={{ title: 'Activity Log', headerLargeTitle: false }} />
    </Stack>
  );
}
