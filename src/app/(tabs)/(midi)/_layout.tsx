/**
 * MIDI stack — large-title grouped form (Connection / Timing / Diagnostics /
 * Defaults / Panic). This tab is also the entire web experience. Filled by
 * Agent D.
 */
import { Stack } from 'expo-router/stack';

import { largeTitleStackOptionsFor } from '@/theme/navigation';
import { useScheme } from '@/theme/theme';

export default function MidiStack() {
  const scheme = useScheme();
  return (
    <Stack screenOptions={largeTitleStackOptionsFor(scheme)}>
      <Stack.Screen name="midi" options={{ title: 'MIDI' }} />
      <Stack.Screen name="activity-log" options={{ title: 'Activity Log', headerLargeTitle: false }} />
    </Stack>
  );
}
