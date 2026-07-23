/**
 * Sequencer stack. The Sequencer uses a compact in-content header (pattern name,
 * BPM, connection dot) rather than a large title, so the native header is off.
 */
import { Stack } from 'expo-router/stack';

export default function SequencerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
