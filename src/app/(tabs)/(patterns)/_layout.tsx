/**
 * Patterns stack — large-title list (search bar added by Agent C), plus the
 * shared-pattern sheet a euxy link opens.
 *
 * The /p sheet is registered HERE rather than in the root Stack so an incoming
 * universal link / euxy:// link resolves to a route inside this tab: the router
 * therefore selects Patterns on the way in (cold or warm), landing the sheet on
 * top of the library it was just added to. `patterns` is this group's anchor
 * (it matches the group name), so the list is always underneath — Done has
 * somewhere to go even on a cold link.
 */
import { Stack } from 'expo-router/stack';

import { sheetOptions } from '@/theme/navigation';
import { color } from '@/theme/tokens';

export default function PatternsStack() {
  return (
    <Stack
      // Same transparent large-title recipe as the MIDI stack — an opaque
      // header makes the large-title collapse stutter.
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
      <Stack.Screen name="patterns" options={{ title: 'Patterns' }} />
      {/* Two URL shapes, one sheet: /p/<payload> is canonical, /p?d=<payload>
          is kept for links already in the wild. */}
      <Stack.Screen name="p" options={{ ...sheetOptions, sheetAllowedDetents: [0.45] }} />
      <Stack.Screen name="p/[d]" options={{ ...sheetOptions, sheetAllowedDetents: [0.45] }} />
    </Stack>
  );
}
