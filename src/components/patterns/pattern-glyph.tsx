/**
 * PatternGlyph — the dot-matrix badge on the Patterns empty state (echoes the
 * OP-XY device screen). A fixed 4×2 grid of rounded squares in two grayscale
 * tones, at the exact geometry of the original Paper SVG (viewBox 22: 3.2pt
 * cells, x-step 4.5 / y-step 4.8, offset 2.5/7 — all scaled by size/22).
 *
 * LED-motion concept D: with `twinkle`, the glyph quietly lives — every few
 * seconds ONE random lit cell attacks a step brighter (#F6F4F4) and eases
 * back. useIdleTwinkle pauses it while the transport is playing, while the
 * screen is blurred, and under Reduced Motion.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { color } from '@/theme/tokens';
import { LedGrid, twinkle as twinkleOrder } from '@/components/ui/led-grid';
import { useIdleTwinkle } from '@/components/ui/use-idle-twinkle';

// Lit/dim map per the Paper reference glyph (row-major, '1' = lit).
const SHADES = '1011' + '0101';
const TWINKLE_COLORS = ['transparent', '#F6F4F4'] as const;
// 5 lit cells × ~4s per slot ⇒ one twinkle every few seconds, no visible loop.
const TWINKLE_LOOP_MS = 20000;
const TWINKLE_FALL = 400 / (TWINKLE_LOOP_MS / 5);

export function PatternGlyph({ size = 22, twinkle = false }: { size?: number; twinkle?: boolean }) {
  const u = size / 22;
  // Lazy useState, not useMemo: useMemo is a hint React may discard and
  // recompute, which would reshuffle the twinkle order mid-animation.
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const order = useMemo(() => twinkleOrder(SHADES, seed), [seed]);
  const progress = useIdleTwinkle(TWINKLE_LOOP_MS, twinkle);
  return (
    <View style={{ width: size, height: size }}>
      <View style={{ position: 'absolute', left: 2.5 * u, top: 7 * u }}>
        {[...SHADES].map((s, i) => (
          <View
            key={i}
            style={{
              position: 'absolute',
              left: (i % 4) * 4.5 * u,
              top: Math.floor(i / 4) * 4.8 * u,
              width: 3.2 * u,
              height: 3.2 * u,
              borderRadius: u,
              backgroundColor: s === '1' ? color.stepHit : color.surface4,
            }}
          />
        ))}
        <View style={StyleSheet.absoluteFill}>
          <LedGrid
            shades={SHADES}
            order={order}
            progress={progress}
            mode="pulse"
            pulseFall={TWINKLE_FALL}
            colors={TWINKLE_COLORS}
            cols={4}
            cell={3.2 * u}
            gapX={1.3 * u}
            gapY={1.6 * u}
            cellRadius={u}
            renderBase={false}
          />
        </View>
      </View>
    </View>
  );
}
