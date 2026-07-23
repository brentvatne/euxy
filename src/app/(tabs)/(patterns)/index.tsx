// Wave 0 placeholder — Agent C builds the Patterns library (list + search +
// swipe-to-delete) and the New Pattern sheet.
import { ScrollView, StyleSheet, View } from 'react-native';

import { usePatterns } from '@/state/selectors';
import { useStore } from '@/state/store';
import { AppText } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';

export default function PatternsScreen() {
  const patterns = usePatterns();
  const activeId = useStore((s) => s.activePatternId);

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={styles.root} contentContainerStyle={styles.content}>
      {patterns.map((p) => (
        <View key={p.id} style={styles.cell}>
          <View>
            <AppText variant="headline">{p.name}</AppText>
            <AppText variant="footnote" tone="tertiary">
              {p.lanes.length} lanes · {p.bpm} BPM
            </AppText>
          </View>
          {p.id === activeId ? (
            <AppText variant="caption" tone="secondary" uppercase>
              Active
            </AppText>
          ) : null}
        </View>
      ))}
      <AppText variant="footnote" tone="tertiary">
        Wave 0 placeholder · Agent C builds the library, search, and New Pattern sheet.
      </AppText>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.lg, gap: space.md },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: radius.cell,
    padding: space.lg,
  },
});
