/**
 * Sequencer stack. The Sequencer uses a compact in-content header (pattern name,
 * BPM, connection dot) rather than a large title, so the native header is off.
 */
import { Stack } from 'expo-router/stack';

import { useRailContentStyle } from '@/theme/navigation';

export default function SequencerStack() {
  const railContentStyle = useRailContentStyle();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: railContentStyle }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
