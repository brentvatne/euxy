/**
 * LedChip — a pattern's 5×5 LED-grid glyph (Paper "Preset icons"), with the
 * "now-playing sweep" from the LED-motion spec (concept A): while the pattern
 * is playing, a light column sweeps the grid one column per 16th, driven off
 * the engine's playhead tick on the UI thread — zero re-renders. Honors
 * Reduced Motion by staying static.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion } from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { CHIP_SHADE_COLORS } from './chips';

/** Geometry from the Paper chip: a 152px chip holds a 22-unit grid (cell 3.2,
 * gap 1) with equal padding around — everything scales off `size`. */
export function LedChip({
  shades,
  size = 40,
  playing = false,
}: {
  /** 25 shade digits, row-major (see chips.ts). */
  shades: string;
  size?: number;
  /** Enables the now-playing sweep (active pattern + transport running). */
  playing?: boolean;
}) {
  const unit = (size * 0.58) / 22; // grid occupies ~58% of the chip, centered
  const cell = 3.2 * unit;
  const gap = unit;
  const grid = cell * 5 + gap * 4;
  const reduceMotion = useReducedMotion();

  return (
    <View style={[styles.chip, { width: size, height: size, borderRadius: size * 0.24 }]}>
      <View style={{ width: grid, height: grid }}>
        {Array.from({ length: 5 }, (_, r) => (
          <View key={r} style={[styles.row, { gap, marginTop: r === 0 ? 0 : gap }]}>
            {Array.from({ length: 5 }, (_, c) => (
              <View
                key={c}
                style={{
                  width: cell,
                  height: cell,
                  borderRadius: cell * 0.3,
                  backgroundColor: CHIP_SHADE_COLORS[Number(shades[r * 5 + c])],
                }}
              />
            ))}
          </View>
        ))}
        {playing && !reduceMotion ? <Sweep cellW={cell} gap={gap} height={grid} /> : null}
      </View>
    </View>
  );
}

/** The playhead column: one column per 16th (6 ticks at 24 PPQN), wrapping
 * the 5 columns. A soft light wash — the "wall of tiny hardware LEDs". */
function Sweep({ cellW, gap, height }: { cellW: number; gap: number; height: number }) {
  const style = useAnimatedStyle(() => {
    const col = Math.floor(playheadTick.value / 6) % 5;
    return {
      opacity: playheadPlaying.value ? 1 : 0,
      transform: [{ translateX: col * (cellW + gap) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.sweep, { width: cellW, height, borderRadius: cellW * 0.3 }, style]}
    />
  );
}

const styles = StyleSheet.create({
  chip: {
    backgroundColor: '#2C2C2E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: { flexDirection: 'row' },
  sweep: {
    position: 'absolute',
    top: 0,
    left: 0,
    backgroundColor: 'rgba(246,244,244,0.28)',
  },
});
