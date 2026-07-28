/**
 * A single sequencer step cell. Values pulled from Paper node WV-0 (Sequencer
 * lane): hit = #AFAFB3, empty = #2F2F36, playhead = dark #16161D bg + 2px white
 * border. Height 22, radius ~4. In a lane the blocks are fit-to-width (`grow`),
 * gap 4 between them.
 *
 * Presentational + memoized: the grid renders once and a playhead moves across
 * it, so this never re-renders on the tick.
 */
import { memo } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { color, radius, ramp } from '@/theme/tokens';

export interface StepBlockProps {
  hit: boolean;
  active?: boolean;
  /** Fit-to-width (flex:1) instead of a fixed square — the Sequencer default. */
  grow?: boolean;
  /** Fixed side length when not `grow` (default 22). */
  size?: number;
  /** Row height (default 22). */
  height?: number;
  onPress?: () => void;
  style?: ViewStyle;
}

export const StepBlock = memo(function StepBlock({
  hit,
  active = false,
  grow = false,
  size = 22,
  height = 22,
  onPress,
  style,
}: StepBlockProps) {
  const body = (
    <View
      style={[
        styles.base,
        grow ? { flex: 1, height } : { width: size, height: size },
        { backgroundColor: hit ? color.stepHit : active ? ramp[7] : color.stepEmpty },
        active && styles.active,
        style,
      ]}
    />
  );
  if (!onPress) return body;
  return (
    <Pressable onPress={onPress} style={grow ? styles.grow : undefined} accessibilityRole="button">
      {body}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  base: { borderRadius: radius.step },
  grow: { flex: 1 },
  active: { borderWidth: 2, borderColor: color.label },
});
