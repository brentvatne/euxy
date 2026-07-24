/**
 * FloatingActions — the Sequencer's floating capsule (Paper 7A-0 "Floating
 * action bar"): add lane · mutate · undo mutate. Replaces both the old tools
 * row and the list-bottom "Add lane" row, hovering bottom-right above the
 * transport so the actions stay under the thumb while jamming.
 */
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { color, ramp } from '@/theme/tokens';
import { SFSymbol } from '@/components/ui';

type SymbolName = ComponentProps<typeof SFSymbol>['name'];

export function FloatingActions({
  canMutate,
  canUndo,
  onAddLane,
  onMutate,
  onUndo,
}: {
  canMutate: boolean;
  canUndo: boolean;
  onAddLane: () => void;
  onMutate: () => void;
  onUndo: () => void;
}) {
  return (
    <View style={styles.bar} pointerEvents="box-none">
      <ActionButton label="Add lane" icon="plus" onPress={onAddLane} />
      <ActionButton label="Mutate pattern" icon="shuffle" onPress={onMutate} disabled={!canMutate} />
      <ActionButton label="Undo mutation" icon="arrow.uturn.backward" onPress={onUndo} disabled={!canUndo} />
    </View>
  );
}

function ActionButton({
  label,
  icon,
  onPress,
  disabled = false,
}: {
  label: string;
  icon: SymbolName;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
    >
      <SFSymbol name={icon} size={16} tint={disabled ? color.label4 : color.label} />
    </Pressable>
  );
}

// Paper 7A-0: capsule #16161D r999 p6 gap6, 44px circle buttons on surface2,
// heavy drop shadow so it reads as floating over the lane grid.
const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    flexDirection: 'row',
    gap: 6,
    padding: 6,
    borderRadius: 999,
    backgroundColor: ramp[7],
    shadowColor: '#000000',
    shadowOpacity: 0.55,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 8 },
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 999,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnPressed: { opacity: 0.6 },
});
