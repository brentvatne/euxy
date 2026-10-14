// Settings tab — Connection / Timing / Sound / Appearance / Diagnostics /
// Routing / Panic. Also the entire web experience (minimal MIDI connection
// tester). Route stays thin.
import { Stack, router } from 'expo-router';
import { Pressable } from 'react-native';

import MidiScreen from '@/components/midi/midi-screen';
import { SFSymbol } from '@/components/ui';
import { haptics } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { space } from '@/theme/tokens';
import { useTheme } from '@/theme/theme';

function openAbout() {
  haptics.selection();
  router.push('/about');
}

export default function SettingsTab() {
  useMarkInteractive();
  const { color } = useTheme();
  return (
    <>
      <Stack.Screen
        options={{
          unstable_headerRightItems: () => [
            {
              type: 'button',
              label: 'About',
              accessibilityLabel: 'About euxy',
              icon: { type: 'sfSymbol', name: 'info.circle' },
              tintColor: color.label,
              onPress: openAbout,
            },
          ],
          // Non-iOS has no header items API; keep a plain button there.
          headerRight: () => (
            <Pressable onPress={openAbout} hitSlop={space.md} accessibilityRole="button" accessibilityLabel="About euxy">
              <SFSymbol name="info.circle" size={22} tint={color.label} />
            </Pressable>
          ),
        }}
      />
      <MidiScreen />
    </>
  );
}
