/**
 * Sort control for the Patterns library header — an @expo/ui MenuView (the
 * same native SwiftUI menu the sequencer header uses), so the checkmark and
 * the "Sort by" section header are the system's, not a hand-drawn sheet.
 *
 * iOS drives the header from native bar items instead (see patterns.tsx), so
 * `SortMenuButton` is the off-iOS path; `SORT_OPTIONS` is shared by both.
 *
 * Two orders: Date Added (newest first — the default) and BPM (slowest first).
 */
import { MenuView, type MenuAction } from '@expo/ui/community/menu';
import { StyleSheet, View } from 'react-native';

import { SFSymbol } from '@/components/ui';
import { haptics } from '@/lib/shims';
import type { Pattern, PatternSort } from '@/state/types';
import { color, space } from '@/theme/tokens';

/** Shared with the iOS header's native Sort menu, so both list the same orders. */
export const SORT_OPTIONS = [
  { id: 'created', title: 'Date Added', image: 'clock' },
  { id: 'bpm', title: 'BPM', image: 'metronome' },
] as const satisfies readonly { id: PatternSort; title: string; image: MenuAction['image'] }[];

/** Creation stamp; `updatedAt` covers the window before the store backfills. */
const bornAt = (p: Pattern) => p.createdAt ?? p.updatedAt;

/**
 * Order the library. Newest first by default; BPM breaks ties by creation date
 * so patterns at the same tempo keep the default order among themselves.
 */
export function sortPatterns(patterns: Pattern[], sort: PatternSort): Pattern[] {
  return [...patterns].sort((a, b) =>
    sort === 'bpm' ? a.bpm - b.bpm || bornAt(b) - bornAt(a) : bornAt(b) - bornAt(a),
  );
}

export function SortMenuButton({
  sort,
  onChange,
}: {
  sort: PatternSort;
  onChange: (sort: PatternSort) => void;
}) {
  const actions: MenuAction[] = SORT_OPTIONS.map((o) => ({
    ...o,
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
