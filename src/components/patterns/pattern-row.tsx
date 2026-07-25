/**
 * PatternRow — one row in the Patterns library. Leading dot-matrix badge, name
 * + metadata, trailing active dot / chevron. Wrapped in a swipe-to-delete
 * gesture (reveal a red Delete action on left-swipe). Grouped-list rounding is
 * driven by `first` / `last` so a run of rows reads as one card with hairline
 * separators.
 */
import { memo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
// Gesture-handler's Pressable, NOT React Native's: when the swipe pan
// activates it CANCELS the press natively. RN's Pressable races it — a
// mid-swipe finger lift fired onPress (load + tab switch), which is why
// swiping a row "vanished" instead of revealing the actions (ROADMAP §11).
import { Pressable } from 'react-native-gesture-handler';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { AppText, SFSymbol } from '@/components/ui';
import { haptics } from '@/lib/shims';
import type { Pattern } from '@/state/types';
import { color, font, radius, space } from '@/theme/tokens';
import { chipForPattern } from './chips';
import { LedChip } from './led-chip';

export interface PatternRowProps {
  pattern: Pattern;
  active: boolean;
  /** Active pattern + transport running — animates the chip's playhead sweep. */
  playing?: boolean;
  first: boolean;
  last: boolean;
  onPress: () => void;
  onDelete: () => void;
  /** Long-press: the host opens the Rename / Change Icon / Delete menu. */
  onLongPress?: () => void;
  /** Factory presets only: swipe reveals Reset next to Delete. */
  onReset?: () => void;
}

function laneWord(n: number) {
  return n === 1 ? 'lane' : 'lanes';
}

/** "edited just now" → "edited 5m ago" → … (Paper GR-0 row metadata). */
function editedLabel(updatedAt: number): string {
  const s = Math.max(0, (Date.now() - updatedAt) / 1000);
  if (s < 60) return 'edited just now';
  if (s < 3600) return `edited ${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `edited ${Math.floor(s / 3600)}h ago`;
  const days = Math.floor(s / 86400);
  return days === 1 ? 'edited yesterday' : `edited ${days}d ago`;
}

function PatternRowImpl({ pattern, active, playing = false, first, last, onPress, onDelete, onLongPress, onReset }: PatternRowProps) {
  const swipeRef = useRef<SwipeableMethods>(null);
  // A swipe must never double as a select: while the row is dragged or open,
  // a tap only closes the swipe.
  const swiping = useRef(false);
  const subtitle = `${pattern.lanes.length} ${laneWord(pattern.lanes.length)} · ${pattern.bpm} BPM · ${editedLabel(pattern.updatedAt)}`;

  const cornerStyle = {
    borderTopLeftRadius: first ? radius.cell : radius.step - 2,
    borderTopRightRadius: first ? radius.cell : radius.step - 2,
    borderBottomLeftRadius: last ? radius.cell : radius.step - 2,
    borderBottomRightRadius: last ? radius.cell : radius.step - 2,
  };

  const renderRightActions = () => (
    <View style={styles.actionsRow}>
      {onReset ? (
        <Pressable
          style={styles.resetAction}
          accessibilityRole="button"
          accessibilityLabel={`Reset ${pattern.name} to factory`}
          onPress={() => {
            haptics.impact('light');
            swipeRef.current?.close();
            onReset();
          }}
        >
          <AppText variant="subhead" style={styles.deleteText}>
            Reset
          </AppText>
        </Pressable>
      ) : null}
      <Pressable
        style={styles.deleteAction}
        accessibilityRole="button"
        accessibilityLabel={`Delete ${pattern.name}`}
        onPress={() => {
          haptics.warning();
          swipeRef.current?.close();
          onDelete();
        }}
      >
        <AppText variant="subhead" style={styles.deleteText}>
          Delete
        </AppText>
      </Pressable>
    </View>
  );

  return (
    <ReanimatedSwipeable
      ref={swipeRef}
      friction={2}
      rightThreshold={40}
      overshootRight={false}
      containerStyle={[styles.swipeContainer, cornerStyle]}
      renderRightActions={renderRightActions}
      onSwipeableOpenStartDrag={() => {
        swiping.current = true;
      }}
      onSwipeableClose={() => {
        swiping.current = false;
      }}
    >
      <Pressable
        onPress={() => {
          if (swiping.current) {
            swipeRef.current?.close();
            return;
          }
          haptics.selection();
          onPress();
        }}
        // Same swipe guard as tap: a drag must never double as a long-press.
        onLongPress={
          onLongPress
            ? () => {
                if (swiping.current) return;
                onLongPress();
              }
            : undefined
        }
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
      >
        <LedChip shades={chipForPattern(pattern)} size={38} playing={playing} />
        <View style={styles.textCol}>
          <AppText style={styles.name} numberOfLines={1}>
            {pattern.name}
          </AppText>
          <AppText style={styles.sub} numberOfLines={1}>
            {subtitle}
          </AppText>
        </View>
        {active ? <View style={styles.activeDot} /> : null}
        <SFSymbol name="chevron.right" size={16} tint={color.labelDisabled} />
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
  textCol: { flex: 1, gap: 2 },
  // Paper KL-0: name semibold 16/20 white; sub regular 13/16 label25.
  name: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: '#FFFFFF' },
  sub: { fontFamily: font.text, fontWeight: '400', fontSize: 13, lineHeight: 16, color: color.label25 },
  activeDot: {
    width: 8,
    height: 8,
    borderRadius: radius.chip,
    backgroundColor: color.connected,
  },
  actionsRow: { flexDirection: 'row' },
  resetAction: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.surface3,
  },
  deleteAction: {
    width: 76,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: color.danger,
  },
  deleteText: { color: color.label, fontWeight: '600' },
});
