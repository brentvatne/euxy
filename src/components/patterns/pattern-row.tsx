/**
 * PatternRow — one row in the Patterns library. Leading dot-matrix badge, name
 * + metadata, trailing active dot / chevron. Wrapped in a swipe-to-delete
 * gesture (reveal a red Delete action on left-swipe). Grouped-list rounding is
 * driven by `first` / `last` so a run of rows reads as one card with hairline
 * separators.
 */
import { memo, useRef } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppText, SFSymbol } from '@/components/ui';
import type { Pattern } from '@/state/types';
import { color, radius, space } from '@/theme/tokens';
import { PatternGlyph } from './pattern-glyph';
import { resolutionLabel } from './resolution';

export interface PatternRowProps {
  pattern: Pattern;
  active: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onDelete: () => void;
  /** Delete is suppressed for the final remaining pattern (must keep >= 1). */
  canDelete: boolean;
}

function laneWord(n: number) {
  return n === 1 ? 'lane' : 'lanes';
}

function PatternRowImpl({
  pattern,
  active,
  first,
  last,
  onPress,
  onDelete,
  canDelete,
}: PatternRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  const subtitle = `${pattern.lanes.length} ${laneWord(pattern.lanes.length)} · ${pattern.bpm} BPM · ${resolutionLabel(pattern.baseResolutionTicks)}`;

  const cornerStyle = {
    borderTopLeftRadius: first ? radius.cell : radius.step - 2,
    borderTopRightRadius: first ? radius.cell : radius.step - 2,
    borderBottomLeftRadius: last ? radius.cell : radius.step - 2,
    borderBottomRightRadius: last ? radius.cell : radius.step - 2,
  };

  const renderRightActions = () => (
    <Pressable
      style={styles.deleteAction}
      accessibilityRole="button"
      accessibilityLabel={`Delete ${pattern.name}`}
      onPress={() => {
        swipeRef.current?.close();
        onDelete();
      }}
    >
      <AppText variant="subhead" style={styles.deleteText}>
        Delete
      </AppText>
    </Pressable>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      enabled={canDelete}
      overshootRight={false}
      containerStyle={[styles.swipeContainer, cornerStyle]}
      renderRightActions={canDelete ? renderRightActions : undefined}
    >
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <View style={styles.badge}>
          <PatternGlyph />
        </View>
        <View style={styles.textCol}>
          <AppText variant="headline" numberOfLines={1}>
            {pattern.name}
          </AppText>
          <AppText variant="footnote" tone="secondary" numberOfLines={1}>
            {subtitle}
          </AppText>
        </View>
        {active ? <View style={styles.activeDot} /> : null}
        <SFSymbol name="chevron.right" size={14} tint={color.labelDisabled} />
      </Pressable>
    </ReanimatedSwipeable>
  );
}

export const PatternRow = memo(PatternRowImpl);

const styles = StyleSheet.create({
  swipeContainer: {
    marginBottom: 1,
    backgroundColor: color.danger,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md + 1,
    paddingVertical: 14,
    paddingHorizontal: space.lg,
    backgroundColor: color.surface,
  },
  rowPressed: { backgroundColor: color.surface2 },
  badge: {
    width: 38,
    height: 38,
    borderRadius: 9,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  textCol: { flex: 1, gap: 2 },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: radius.chip,
    backgroundColor: color.connected,
  },
  deleteAction: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.danger,
  },
  deleteText: { color: color.label, fontWeight: '600' },
});
