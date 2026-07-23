/**
 * Patterns stack — large-title list (search bar added by Agent C).
 */
import { Stack } from 'expo-router/stack';

import { color } from '@/theme/tokens';

export default function PatternsStack() {
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
      <Stack.Screen name="index" options={{ title: 'Patterns' }} />
    </Stack>
  );
}
