/**
 * LedGrid — the generic 5×5 glyph animator (ROADMAP "LED motion system").
 * Renders any glyph bitmap from the chip registry and animates it from ONE
 * `progress` shared value plus a precomputed ORDER ARRAY: each cell derives
 * `lit = progress × N > orderIndex` on the UI thread — instant attack, no JS
 * round-trips, and reversing `progress` powers cells down in reverse order.
 * Every LED concept is a different order array (type-on, sweep, chase, …).
 *
 * `renderBase={false}` draws ONLY the lit overlays, for compositing on top of
 * something that already shows the unlit grid (the boot splash renders the
 * actual splash PNG underneath so the native→JS handoff is pixel-identical).
 */
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { CHIP_SHADE_COLORS } from '@/components/patterns/chips';

/** Row-major ignition order over a glyph's lit cells (boot type-on). */
export function typeOnOrder(shades: string): (number | null)[] {
  let n = 0;
  return [...shades].map((s) => (s === '0' ? null : n++));
}

export function litCount(shades: string): number {
  return [...shades].filter((s) => s !== '0').length;
}

/** Geometry is the splash spec scaled by size: at 276pt — 44pt cells, 14pt
 * gaps, 9pt radius (matches assets/images/splash-icon.png edge to edge). */
function metrics(size: number) {
  const u = size / 276;
  return { cell: 44 * u, gap: 14 * u, radius: 9 * u };
}

export function LedGrid({
  shades,
  order,
  progress,
  size,
  renderBase = true,
  unlitColor = '#1A1A1F',
}: {
  shades: string;
  /** Per-cell ignition index (null = never lights). See typeOnOrder(). */
  order: (number | null)[];
  progress: SharedValue<number>;
  size: number;
  renderBase?: boolean;
  unlitColor?: string;
}) {
  const { cell, gap, radius } = metrics(size);
  const total = litCount(shades);
  return (
    <View pointerEvents="none" style={{ width: size, height: size }}>
      {Array.from({ length: 25 }, (_, i) => {
        const idx = order[i];
        const left = (i % 5) * (cell + gap);
        const top = Math.floor(i / 5) * (cell + gap);
        return (
          <View key={i} style={{ position: 'absolute', left, top, width: cell, height: cell }}>
            {renderBase ? (
              <View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: unlitColor }]} />
            ) : null}
            {idx != null ? (
              <Cell
                orderIndex={idx}
                total={total}
                progress={progress}
                radius={radius}
                color={CHIP_SHADE_COLORS[Number(shades[i])]}
              />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

function Cell({
  orderIndex,
  total,
  progress,
  radius,
  color,
}: {
  orderIndex: number;
  total: number;
  progress: SharedValue<number>;
  radius: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: progress.value * total > orderIndex ? 1 : 0,
  }));
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color }, style]} />
  );
}
