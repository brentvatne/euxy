/**
 * IconPicker — the 30-glyph chip grid ("Sheet · Change icon" / New Pattern
 * ICON group, simplified 2026-07-24 design: no label row, no Shuffle —
 * creation still shuffles the default silently): big readable chips
 * (4 per row, Brent's call over the 6-per-row mock) straight on the sheet.
 * The HOST provides scrolling — 30 glyphs don't fit a form sheet.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { allChipNames, CHIPS, type ChipName } from './chips';
import { LedChip } from './led-chip';

/** Big enough that the glyphs actually read (~44px of LED grid per chip). */
const CHIP_SIZE = 76;

export function IconPicker({
  selected,
  onSelect,
}: {
  selected: ChipName | null;
  onSelect: (name: ChipName) => void;
}) {
  return (
    <View>
      <View style={styles.grid}>
        {allChipNames().map((name) => {
          const isSelected = name === selected;
          return (
            <Pressable
              key={name}
              onPress={() => onSelect(name)}
              accessibilityRole="button"
              accessibilityLabel={`Icon ${name}`}
              accessibilityState={{ selected: isSelected }}
              style={({ pressed }) => [
                styles.slot,
                isSelected && styles.slotSelected,
                pressed && styles.pressedDim,
              ]}
            >
              <LedChip shades={CHIPS[name]} size={CHIP_SIZE} />
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
  // Ring sits OUTSIDE the chip so selection never changes the glyph's size.
  slot: { borderRadius: 21, borderWidth: 2, borderColor: 'transparent', padding: 1 },
  slotSelected: { borderColor: '#F6F4F4' },
  pressedDim: { opacity: 0.65 },
});
