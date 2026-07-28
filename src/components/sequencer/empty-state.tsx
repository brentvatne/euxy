/**
 * First-run / empty-pattern state (Paper 22T-0): dot-grid glyph, "No lanes
 * yet", explainer copy, and a bright Add-lane CTA. Rendered by the Sequencer
 * when the active pattern has no lanes (also guards the new-pattern flow —
 * an empty pattern must never crash the Sequencer subtree).
 *
 * LED-motion concept D: the dot grid quietly lives — every few seconds ONE
 * random bright cell attacks a step brighter and eases back (useIdleTwinkle
 * pauses it while playing / blurred / Reduced Motion). The grid is plain
 * Views at the exact Paper geometry (5×3, 10pt cells, x-step 14 / y-step 19
 * inside the original 80×52 box) with an LedGrid pulse overlay on top.
 */
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';

import { haptics } from '@/lib/shims';
import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';
import { LedGrid, twinkle } from '@/components/ui/led-grid';
import { useIdleTwinkle } from '@/components/ui/use-idle-twinkle';

// Bright/dim map of the Paper glyph, row-major ('1' = bright #3A3A40 dot).
const SHADES = '01001' + '10010' + '01001';
const BRIGHT = '#3A3A40';
// Twinkle peak — one palette step brighter than the bright dots (trail grey).
const TWINKLE_COLORS = ['transparent', '#6E6E76'] as const;
const CELL = 10;
const GAP_X = 4;
const GAP_Y = 9;
// 6 bright cells × ~4s per slot ⇒ one twinkle every few seconds, ~24s until
// the shuffled sequence repeats — never reads as a loop.
const TWINKLE_LOOP_MS = 24000;
// 400ms ease-out decay per the motion principles (fraction of one 4s slot).
const TWINKLE_FALL = 400 / (TWINKLE_LOOP_MS / 6);

export function EmptyState({ onAddLane }: { onAddLane: () => void }) {
  // Lazy useState, not useMemo: useMemo is a hint React may discard and
  // recompute, which would reshuffle the twinkle order mid-animation.
  const [seed] = useState(() => Math.floor(Math.random() * 0x7fffffff));
  const order = useMemo(() => twinkle(SHADES, seed), [seed]);
  const progress = useIdleTwinkle(TWINKLE_LOOP_MS);
  return (
    <View style={styles.root}>
      {/* Same 80×52 box as the original SVG so the layout doesn't shift. */}
      <View style={styles.glyphBox}>
        <View style={styles.glyphGrid}>
          {[...SHADES].map((s, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                {
                  left: (i % 5) * (CELL + GAP_X),
                  top: Math.floor(i / 5) * (CELL + GAP_Y),
                  backgroundColor: s === '1' ? BRIGHT : color.stepEmpty,
                },
              ]}
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
              cols={5}
              cell={CELL}
              gapX={GAP_X}
              gapY={GAP_Y}
              cellRadius={2}
              renderBase={false}
            />
          </View>
        </View>
      </View>
      <View style={styles.textBlock}>
        <AppText style={styles.title}>No lanes yet</AppText>
        <AppText style={styles.body}>
          Add a Euclidean lane, then dial in steps, pulses & rotation to build a rhythm on the
          OP–XY.
        </AppText>
      </View>
      <Pressable
        onPress={() => {
          haptics.impact('light');
          onAddLane();
        }}
        style={styles.cta}
        accessibilityRole="button"
      >
        <Svg width={17} height={17} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" fill="none" stroke="#000000" strokeWidth={2.6} strokeLinecap="round" />
        </Svg>
        <AppText style={styles.ctaLabel}>Add lane</AppText>
      </Pressable>
    </View>
  );
}

// Exact values from Paper 22T-0: min-h 430, py 72, px 44, gap 20.
const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 430,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 72,
    paddingHorizontal: 44,
    gap: 20,
  },
  glyphBox: { width: 80, height: 52 },
  glyphGrid: { position: 'absolute', left: 2, top: 2, width: 66, height: 48 },
  dot: { position: 'absolute', width: CELL, height: CELL, borderRadius: 2 },
  textBlock: { alignItems: 'center', gap: 8 },
  title: {
    fontFamily: font.display,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.22,
    color: color.label,
  },
  body: {
    fontFamily: font.text,
    fontWeight: '400',
    fontSize: 15,
    lineHeight: 21,
    color: color.label3,
    textAlign: 'center',
    maxWidth: 260,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 13,
    paddingHorizontal: 22,
    borderRadius: 12,
    backgroundColor: color.label,
  },
  ctaLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: '#000000' },
});
