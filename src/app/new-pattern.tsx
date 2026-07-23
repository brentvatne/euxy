// Wave 0 stub — Agent C builds New Pattern (name / tempo / base resolution).
// Wired to the store action so the flow works end-to-end even as a stub.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useStore } from '@/state/store';
import { AppText, SheetHeader } from '@/components/ui';
import { space } from '@/theme/tokens';

export default function NewPatternSheet() {
  const newPattern = useStore((s) => s.newPattern);

  return (
    <View style={styles.root}>
      <SheetHeader
        title="New Pattern"
        onCancel={() => router.back()}
        onDone={() => {
          newPattern();
          router.back();
        }}
        doneLabel="Create"
      />
      <View style={styles.body}>
        <AppText variant="footnote" tone="tertiary">
          Wave 0 stub · Agent C builds name / tempo / base-resolution fields here.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: space.lg, gap: space.md },
});
