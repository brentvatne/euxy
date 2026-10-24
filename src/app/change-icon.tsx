/**
 * Change-icon form sheet (Paper "Sheet · Change icon"): Cancel / Done over
 * the shared glyph picker. Selection applies LIVE — tapping a glyph sets the
 * pattern's icon immediately (Brent 2026-07-25: no Done gate); Done just
 * closes, Cancel restores the icon the sheet opened with. Opened from the
 * pattern title menu ("Change Icon…", after Rename) for the active pattern,
 * or from a Patterns row long-press with an explicit `patternId` param
 * targeting any pattern.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { effectiveChipName, type ChipName } from '@/components/patterns/chips';
import { IconPicker } from '@/components/patterns/icon-picker';
import { AppText, SheetHeader } from '@/components/ui';
import { useStore } from '@/state/store';
import { font, space } from '@/theme/tokens';
import { themed, useStyles } from '@/theme/theme';
import { useSheetBottomInset } from '@/components/ui/use-sheet-bottom-inset';
import { useMarkInteractive } from '@/lib/use-mark-interactive';

export default function ChangeIconSheet() {
  const styles = useStyles(stylesFor);
  useMarkInteractive();
  const bottomInset = useSheetBottomInset();
  const { patternId } = useLocalSearchParams<{ patternId?: string }>();
  const pattern = useStore((s) =>
    s.patterns.find((p) => p.id === (patternId ?? s.activePatternId)),
  );
  const setPatternIcon = useStore((s) => s.setPatternIcon);
  // Keyed on id alone, deliberately: `initial` must stay the OPEN-TIME glyph for
  // onCancel to revert to. Selection applies live, so depending on `pattern` would
  // retrack every tap and make cancel restore the last pick, not the original.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const initial = useMemo(() => (pattern ? effectiveChipName(pattern) : null), [pattern?.id]);
  const [selected, setSelected] = useState<ChipName | null>(initial);

  if (!pattern) return null;

  return (
    <View style={styles.root}>
      <View style={styles.grabberSpace} />
      <SheetHeader
        title="Icon"
        onCancel={() => {
          // Selection applied live — cancelling puts back the open-time glyph.
          if (initial && selected !== initial) setPatternIcon(pattern.id, initial);
          router.back();
        }}
        onDone={() => router.back()}
      />
      <AppText style={styles.subtitle} numberOfLines={1}>
        For “{pattern.name}”
      </AppText>
      {/* The glyph grid needs scrolling. collapsable={false} wrapper keeps the
          ScrollView OUT of direct-child position — react-native-screens'
          formSheet frame correction otherwise paints it over the header
          (same workaround as lane-editor). */}
      <View style={styles.flex} collapsable={false}>
        <ScrollView nestedScrollEnabled contentContainerStyle={[styles.content, { paddingBottom: space.xxl + bottomInset }]} showsVerticalScrollIndicator={false}>
          <IconPicker
            selected={selected}
            onSelect={(name) => {
              setSelected(name);
              setPatternIcon(pattern.id, name);
            }}
          />
        </ScrollView>
      </View>
    </View>
  );
}

const stylesFor = themed(({ color }) => ({
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
}));
