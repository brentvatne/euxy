/**
 * LedGrid — the generic glyph animator (ROADMAP "LED motion system").
 * Renders any glyph bitmap from the chip registry and animates it from ONE
 * `progress` shared value plus a precomputed ORDER ARRAY: each cell derives
 * its brightness on the UI thread — instant attack, no JS round-trips, and
 * reversing `progress` powers cells down in reverse order. Every LED concept
 * is a different order array (type-on, chase, twinkle, decay, …) and/or a
 * different `mode`:
 *
 * - `fill`  (default) — cell is lit iff `progress × N > orderIndex`. Type-on
 *   (boot splash), concept-G ignite/dropout (fill up / drain down).
 * - `pulse` — one cell at a time: cell k attacks instantly when the head
 *   `progress × N` crosses k and eases back out over `pulseFall` of its slot.
 *   Concept-D idle twinkle.
 * - `trail` — perimeter chase: the head walks the order loop with a
 *   `trail`-cell phosphor tail fading behind it. Concept-F searching sweep.
 *
 * Order arrays are plain precomputed number arrays — all randomness (seeds)
 * is picked JS-side, never inside worklets.
 *
 * `renderBase={false}` draws ONLY the lit overlays, for compositing on top of
 * something that already shows the unlit grid (the boot splash renders the
 * actual splash PNG underneath so the native→JS handoff is pixel-identical).
 */
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, type SharedValue } from 'react-native-reanimated';

import { CHIP_SHADE_COLORS } from '@/components/patterns/chips';

export type LedGridMode = 'fill' | 'pulse' | 'trail';

/** Row-major ignition order over a glyph's lit cells (boot type-on). */
export function typeOnOrder(shades: string): (number | null)[] {
  let n = 0;
  return [...shades].map((s) => (s === '0' ? null : n++));
}

export function litCount(shades: string): number {
  return [...shades].filter((s) => s !== '0').length;
}

/** Deterministic PRNG (mulberry32) — seeds are picked JS-side, never in worklets. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Seeded Fisher–Yates order over a glyph's lit cells. */
function shuffledLitOrder(shades: string, seed: number): (number | null)[] {
  const lit: number[] = [];
  [...shades].forEach((s, i) => {
    if (s !== '0') lit.push(i);
  });
  const rnd = mulberry32(seed);
  for (let i = lit.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [lit[i], lit[j]] = [lit[j], lit[i]];
  }
  const order: (number | null)[] = Array(shades.length).fill(null);
  lit.forEach((cellIndex, k) => {
    order[cellIndex] = k;
  });
  return order;
}

/**
 * Concept D — idle twinkle: shuffled order over the lit cells, one cell at a
 * time on a slow `pulse` loop. Same seed ⇒ same sequence (pure).
 */
export function twinkle(shades: string, seed = 1): (number | null)[] {
  return shuffledLitOrder(shades, seed);
}

/**
 * Concept G — random power-down: shuffled order, REVERSED, so driving a
 * `fill` progress 1 → ε drops cells in random order down to the last survivor
 * (orderIndex 0, the ember) and 0 → 1 re-ignites them in the reverse order.
 */
export function decay(shades: string, seed = 1): (number | null)[] {
  const shuffled = shuffledLitOrder(shades, seed);
  const n = shuffled.reduce<number>((m, v) => (v != null && v >= m ? v + 1 : m), 0);
  return shuffled.map((v) => (v == null ? null : n - 1 - v));
}

/**
 * Concept F — perimeter ring walk: clockwise from the top-left corner; the
 * centre never lights (radar around an empty centre). 16 steps on a 5×5 grid.
 */
export function chase(cols = 5, rows = 5): (number | null)[] {
  const order: (number | null)[] = Array(cols * rows).fill(null);
  let k = 0;
  for (let c = 0; c < cols; c++) order[c] = k++; // top edge →
  for (let r = 1; r < rows; r++) order[r * cols + (cols - 1)] = k++; // right edge ↓
  for (let c = cols - 2; c >= 0; c--) order[(rows - 1) * cols + c] = k++; // bottom edge ←
  for (let r = rows - 2; r >= 1; r--) order[r * cols] = k++; // left edge ↑
  return order;
}

/** Geometry is the splash spec scaled by size: at 276pt — 44pt cells, 14pt
 * gaps, 9pt radius (matches assets/images/splash-icon.png edge to edge). */
function metrics(size: number) {
  const u = size / 276;
  return { cell: 44 * u, gapX: 14 * u, gapY: 14 * u, radius: 9 * u };
}

export function LedGrid({
  shades,
  order,
  progress,
  size,
  cols = 5,
  mode = 'fill',
  trail = 2,
  pulseFall = 1,
  colors = CHIP_SHADE_COLORS,
  cell,
  gapX,
  gapY,
  cellRadius,
  renderBase = true,
  unlitColor = '#1A1A1F',
}: {
  shades: string;
  /** Per-cell ignition index (null = never lights). See typeOnOrder() & friends. */
  order: (number | null)[];
  progress: SharedValue<number>;
  /** Square size for the default 5×5 splash-metric layout (ignored if `cell` given). */
  size?: number;
  /** Grid columns (rows derive from shades.length). */
  cols?: number;
  mode?: LedGridMode;
  /** `trail` mode: cells of phosphor tail behind the head. */
  trail?: number;
  /** `pulse` mode: fraction of one slot over which the pulse decays. */
  pulseFall?: number;
  /** Shade digit → overlay color (defaults to the chip registry shades). */
  colors?: readonly string[];
  /** Explicit metrics override (all in pt). When `cell` is set, `size` is ignored. */
  cell?: number;
  gapX?: number;
  gapY?: number;
  cellRadius?: number;
  renderBase?: boolean;
  unlitColor?: string;
}) {
  const m =
    cell != null
      ? { cell, gapX: gapX ?? 0, gapY: gapY ?? gapX ?? 0, radius: cellRadius ?? (cell * 9) / 44 }
      : metrics(size ?? 0);
  const rows = Math.ceil(shades.length / cols);
  const width = cols * m.cell + (cols - 1) * m.gapX;
  const height = rows * m.cell + (rows - 1) * m.gapY;
  // Slot count comes from the order array (highest index + 1), so partial
  // orders (e.g. a perimeter chase over a full-grid glyph) stay correct.
  const total = order.reduce<number>((acc, v) => (v != null && v >= acc ? v + 1 : acc), 1);
  return (
    <View pointerEvents="none" style={{ width, height }}>
      {Array.from({ length: shades.length }, (_, i) => {
        const idx = order[i];
        const left = (i % cols) * (m.cell + m.gapX);
        const top = Math.floor(i / cols) * (m.cell + m.gapY);
        return (
          <View key={i} style={{ position: 'absolute', left, top, width: m.cell, height: m.cell }}>
            {renderBase ? (
              <View style={[StyleSheet.absoluteFill, { borderRadius: m.radius, backgroundColor: unlitColor }]} />
            ) : null}
            {idx != null ? (
              <Cell
                orderIndex={idx}
                total={total}
                progress={progress}
                mode={mode}
                trail={trail}
                pulseFall={pulseFall}
                radius={m.radius}
                color={colors[Number(shades[i])]}
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
  mode,
  trail,
  pulseFall,
  radius,
  color,
}: {
  orderIndex: number;
  total: number;
  progress: SharedValue<number>;
  mode: LedGridMode;
  trail: number;
  pulseFall: number;
  radius: number;
  color: string;
}) {
  const style = useAnimatedStyle(() => {
    const x = progress.value * total - orderIndex;
    if (mode === 'pulse') {
      // Instant attack as the head crosses this slot, eased decay back to rest.
      if (x <= 0 || x >= 1) return { opacity: 0 };
      const k = 1 - Math.min(1, x / pulseFall);
      return { opacity: k * k };
    }
    if (mode === 'trail') {
      // Distance behind the looping head; head full, tail fades over `trail` cells.
      const d = ((x % total) + total) % total;
      const span = trail + 1;
      if (d >= span) return { opacity: 0 };
      const k = 1 - d / span;
      return { opacity: k * k };
    }
    return { opacity: x > 0 ? 1 : 0 };
  });
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { borderRadius: radius, backgroundColor: color }, style]} />
  );
}
