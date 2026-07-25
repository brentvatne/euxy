/**
 * IconPicker — the 24-glyph chip grid ("Sheet · Change icon" / New Pattern
 * ICON group): big readable chips (4 per row) straight on the sheet surface,
 * selected = 2px light ring, with a Shuffle affordance in the label row.
 * Shared by the Change-icon sheet and (later) the New Pattern sheet.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { Key } from '@/components/ui/key';
import { color, font } from '@/theme/tokens';
import { allChipNames, CHIPS, randomChipName, type ChipName } from './chips';
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
      <View style={styles.labelRow}>
        <AppText style={styles.label}>Icon</AppText>
        <Key
          onPress={() => onSelect(randomChipName())}
          accessibilityRole="button"
          accessibilityLabel="Shuffle icon"
        >
          <AppText style={styles.shuffle}>Shuffle</AppText>
        </Key>
      </View>
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
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    paddingBottom: 8,
  },
  label: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: color.label3 },
  shuffle: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: color.label },
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
