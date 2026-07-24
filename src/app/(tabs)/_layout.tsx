/**
 * Bottom tabs (native). Three tabs: Sequencer (home) · Patterns · MIDI. Each is
 * its own Stack (see the group _layout files). Tint is white per the monochrome
 * rule — no system blue. Tabs are static (never added/removed at runtime).
 */
import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { TINT } from '@/theme/navigation';

// Only (sequencer) has an index route, so "/" (the launch URL) is unambiguous
// and the app always opens on the Sequencer. The other tabs own /patterns and
// /midi. (unstable_settings.initialRouteName does NOT disambiguate colliding
// group index routes — the first alphabetical group wins.)
export default function TabsLayout() {
  return (
    <NativeTabs tintColor={TINT}>
      <NativeTabs.Trigger name="(sequencer)">
        <NativeTabs.Trigger.Icon sf={{ default: 'square.grid.3x3', selected: 'square.grid.3x3.fill' }} md="grid_view" />
        <NativeTabs.Trigger.Label>Sequencer</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(patterns)">
        <NativeTabs.Trigger.Icon sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }} md="layers" />
        <NativeTabs.Trigger.Label>Patterns</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(midi)">
        <NativeTabs.Trigger.Icon sf="waveform" md="graphic_eq" />
        <NativeTabs.Trigger.Label>MIDI</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
