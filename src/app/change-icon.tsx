/**
 * Change-icon form sheet (Paper "Sheet · Change icon"): Cancel / Icon / Done
 * over the active pattern's name, then the shared 24-glyph picker. Selection
 * is staged locally — Done commits, Cancel discards. Opened from the pattern
 * title menu ("Change Icon…", after Rename).
 */
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { CHIPS, chipForPattern, type ChipName } from '@/components/patterns/chips';
import { IconPicker } from '@/components/patterns/icon-picker';
import { AppText, SheetHeader } from '@/components/ui';
import { useStore } from '@/state/store';
import { color, font, space } from '@/theme/tokens';

/** The pattern's effective glyph NAME (falls back like the chip render does). */
function effectiveChipName(pattern: { id: string; icon?: string }): ChipName {
  const shades = chipForPattern(pattern);
  return (Object.keys(CHIPS) as ChipName[]).find((n) => CHIPS[n] === shades)!;
}

export default function ChangeIconSheet() {
  const pattern = useStore((s) => s.patterns.find((p) => p.id === s.activePatternId));
  const setActivePatternIcon = useStore((s) => s.setActivePatternIcon);
  const initial = useMemo(() => (pattern ? effectiveChipName(pattern) : null), [pattern?.id]);
  const [selected, setSelected] = useState<ChipName | null>(initial);

  if (!pattern) return null;

  return (
    <View style={styles.root}>
      <View style={styles.grabberSpace} />
      <SheetHeader
        title=""
        onCancel={() => router.back()}
        onDone={() => {
          if (selected) setActivePatternIcon(selected);
          router.back();
        }}
      />
      {/* 30 glyphs need scrolling. collapsable={false} wrapper keeps the
          ScrollView OUT of direct-child position — react-native-screens'
          formSheet frame correction otherwise paints it over the header
          (same workaround as lane-editor). */}
      <View style={styles.flex} collapsable={false}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <IconPicker selected={selected} onSelect={setSelected} />
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  flex: { flex: 1 },
  grabberSpace: { height: 13 },
  subtitle: {
    textAlign: 'center',
    fontFamily: font.text,
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 16,
    color: color.label3,
    paddingBottom: 12,
  },
  content: { paddingHorizontal: 16, paddingBottom: space.xxl },
});
