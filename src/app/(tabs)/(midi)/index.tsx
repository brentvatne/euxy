// Wave 0 placeholder — Agent D builds the MIDI tab (Connection / Timing /
// Diagnostics / Defaults / Panic) and the Device-picker + Enable-MIDI sheets.
// This tab is also the entire web experience.
import { ScrollView, StyleSheet, View } from 'react-native';

import { useSettings } from '@/state/selectors';
import { AppText, StatusDot } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';

export default function MidiScreen() {
  const settings = useSettings();
  const connected = !!settings.outputId;

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.cell}>
        <AppText variant="micro" tone="tertiary" uppercase>
          Connection
        </AppText>
        <StatusDot connected={connected} label={connected ? 'Connected' : 'No device'} />
      </View>
      <AppText variant="footnote" tone="tertiary">
        Wave 0 placeholder · Agent D wires device pickers, timing, diagnostics, panic, and the web MIDI tester here.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.lg, gap: space.md },
  cell: { backgroundColor: color.surface, borderRadius: radius.cell, padding: space.lg, gap: space.md },
});
