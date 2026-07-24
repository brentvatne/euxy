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
        headerTransparent: false,
        headerShadowVisible: false,
        headerBlurEffect: 'none',
        headerTintColor: color.label,
        headerLargeTitleStyle: { color: color.label },
        headerTitleStyle: { color: color.label },
        headerLargeStyle: { backgroundColor: color.ground },
        headerStyle: { backgroundColor: color.ground },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Patterns' }} />
    </Stack>
  );
}
