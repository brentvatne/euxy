// Wave 0 stub — Agent D builds Enable MIDI (web permission explainer + Safari/iOS
// fallback). Primarily a web concern.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, SheetHeader } from '@/components/ui';
import { space } from '@/theme/tokens';

export default function EnableMidiSheet() {
  return (
    <View style={styles.root}>
      <SheetHeader title="Enable MIDI" onDone={() => router.back()} doneLabel="Close" />
      <View style={styles.body}>
        <AppText variant="footnote" tone="tertiary">
          Wave 0 stub · Agent D builds the Web MIDI permission explainer here.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: space.lg, gap: space.md },
});
