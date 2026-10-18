/**
 * Sequencer stack. The Sequencer uses a compact in-content header (pattern name,
 * BPM, connection dot) rather than a large title, so the native header is off.
 * It keeps out of iPhone Duo's side rail itself (see the screen), so its pinned
 * transport can still run to the screen's edge.
 */
import { Stack } from 'expo-router/stack';

export default function SequencerStack() {
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
    </Stack>
  );
}
