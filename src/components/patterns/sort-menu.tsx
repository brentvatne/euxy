/**
 * Sort control for the Patterns library header — an @expo/ui MenuView (the
 * same native SwiftUI menu the sequencer header uses), so the checkmark and
 * the "Sort by" section header are the system's, not a hand-drawn sheet.
 *
 * iOS drives the header from native bar items instead (see patterns.tsx), so
 * `SortMenuButton` is the off-iOS path; `SORT_OPTIONS` is shared by both.
 *
 * Two orders: Date Added (the default) and BPM. Each runs descending first —
 * newest / fastest at the top — and picking the selected order again flips it.
 */
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { StyleSheet, View } from 'react-native';

import { SFSymbol } from '@/components/ui';
import { haptics } from '@/lib/shims';
import type { Pattern, PatternSort, PatternSortDir } from '@/state/types';
import { color, space } from '@/theme/tokens';

/** Shared with the iOS header's native Sort menu, so both list the same orders. */
export const SORT_OPTIONS = [
  { id: 'created', title: 'Date Added', image: 'clock' },
  { id: 'bpm', title: 'BPM', image: 'metronome' },
] as const satisfies readonly { id: PatternSort; title: string; image: MenuAction['image'] }[];

/** Creation stamp; `updatedAt` covers the window before the store backfills. */
const bornAt = (p: Pattern) => p.createdAt ?? p.updatedAt;

/**
 * Order the library. Descending is each key's own direction — newest first for
 * Date Added, fastest first for BPM — and 'asc' is the exact reverse, so the
 * creation-date tie-break inside the BPM order flips with it.
 */
export function sortPatterns(
  patterns: Pattern[],
  sort: PatternSort,
  dir: PatternSortDir,
): Pattern[] {
  const flip = dir === 'asc' ? -1 : 1;
  return [...patterns].sort(
    (a, b) =>
      flip * (sort === 'bpm' ? b.bpm - a.bpm || bornAt(b) - bornAt(a) : bornAt(b) - bornAt(a)),
  );
}

/**
 * Icon for one menu row: the selected order trades its key glyph for a
 * direction arrow, the rest keep theirs. The system checkmark says WHICH order
 * is on, so the arrow is what is left to say which way it runs.
 */
export const sortOptionImage = (
  option: (typeof SORT_OPTIONS)[number],
  sort: PatternSort,
  dir: PatternSortDir,
) =>
  option.id !== sort
    ? option.image
    : dir === 'asc'
      ? ('arrow.up' as const)
      : ('arrow.down' as const);

export function SortMenuButton({
  sort,
  dir,
  onChange,
}: {
  sort: PatternSort;
  dir: PatternSortDir;
  onChange: (sort: PatternSort) => void;
}) {
  const actions: MenuAction[] = SORT_OPTIONS.map((o) => ({
    ...o,
    image: sortOptionImage(o, sort, dir),
    state: o.id === sort ? 'on' : 'off',
  }));
  return (
    <MenuView
      title="Sort by"
      actions={actions}
      onPressAction={({ nativeEvent }) => {
        haptics.selection();
        onChange(nativeEvent.event as PatternSort);
      }}
    >
      <View style={styles.trigger} accessibilityRole="button" accessibilityLabel="Sort patterns">
        <SFSymbol name="arrow.up.arrow.down" size={20} tint={color.label} />
      </View>
    </MenuView>
  );
}

const styles = StyleSheet.create({
  // A sized box, not a bare symbol: the SwiftUI menu host measures its content,
  // and a 20pt glyph alone leaves no room for the tap.
  trigger: {
    width: 20 + space.md,
    height: 20 + space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
