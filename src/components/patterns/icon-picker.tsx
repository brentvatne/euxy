/**
 * IconPicker — the full chip grid ("Sheet · Change icon" / New Pattern
 * ICON group, simplified 2026-07-24 design: no label row, no Shuffle —
 * creation still shuffles the default silently): big readable chips
 * (4 per row, Brent's call over the 6-per-row mock) straight on the sheet.
 * The HOST provides scrolling — 50 glyphs don't fit a form sheet. `horizontal`
 * lays the chips out as one non-wrapping row instead (New Pattern's ICON
 * group, scrolled sideways by its host).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/shims';
import { allChipNames, CHIPS, type ChipName } from './chips';
import { LedChip } from './led-chip';

/** Big enough that the glyphs actually read (~44px of LED grid per chip). */
const CHIP_SIZE = 76;

export function IconPicker({
  selected,
  onSelect,
  horizontal = false,
  size = CHIP_SIZE,
}: {
  selected: ChipName | null;
  onSelect: (name: ChipName) => void;
  /** Single non-wrapping row (host scrolls it sideways) instead of the grid. */
  horizontal?: boolean;
  /** Chip size in px — the grid's 76 unless the host is tighter on space. */
  size?: number;
}) {
  return (
    <View>
      <View style={[styles.grid, horizontal && styles.row]}>
        {allChipNames().map((name) => {
          const isSelected = name === selected;
          return (
            <Pressable
              key={name}
              onPress={() => {
                if (!isSelected) haptics.selection();
                onSelect(name);
              }}
              accessibilityRole="button"
              accessibilityLabel={`Icon ${name}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [
                styles.slot,
                isSelected && styles.slotSelected,
                pressed && styles.pressedDim,
              ]}
            >
              <LedChip shades={CHIPS[name]} size={size} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    justifyContent: 'center',
  },
  row: { flexWrap: 'nowrap', justifyContent: 'flex-start' },
  // Ring sits OUTSIDE the chip so selection never changes the glyph's size.
  slot: { borderRadius: 21, borderWidth: 2, borderColor: 'transparent', padding: 1 },
  slotSelected: { borderColor: '#F6F4F4' },
  pressedDim: { opacity: 0.65 },
});
