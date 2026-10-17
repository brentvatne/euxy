/**
 * Settings stack — large-title grouped form (Connection / Timing / Sound /
 * Appearance / Diagnostics / Routing / Panic). This tab is also the entire web experience. Filled by
 * Agent D.
 */
import { Stack } from 'expo-router/stack';

import { largeTitleStackOptionsFor, useRailContentStyle } from '@/theme/navigation';
import { useScheme } from '@/theme/theme';

export default function SettingsStack() {
  const scheme = useScheme();
  const railContentStyle = useRailContentStyle();
  return (
    <Stack screenOptions={{ ...largeTitleStackOptionsFor(scheme), contentStyle: railContentStyle }}>
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="activity-log" options={{ title: 'Activity Log', headerLargeTitle: false }} />
    </Stack>
  );
}
