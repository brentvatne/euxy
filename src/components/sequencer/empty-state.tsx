/**
 * First-run / empty-pattern state (Paper 22T-0): dot-grid glyph, "No lanes
 * yet", explainer copy, and a bright Add-lane CTA. Rendered by the Sequencer
 * when the active pattern has no lanes (also guards the new-pattern flow —
 * an empty pattern must never crash the Sequencer subtree).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';

import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';

const DOTS: { x: number; y: number; bright: boolean }[] = [
  { x: 2, y: 2, bright: false }, { x: 16, y: 2, bright: true }, { x: 30, y: 2, bright: false },
  { x: 44, y: 2, bright: false }, { x: 58, y: 2, bright: true },
  { x: 2, y: 21, bright: true }, { x: 16, y: 21, bright: false }, { x: 30, y: 21, bright: false },
  { x: 44, y: 21, bright: true }, { x: 58, y: 21, bright: false },
  { x: 2, y: 40, bright: false }, { x: 16, y: 40, bright: true }, { x: 30, y: 40, bright: false },
  { x: 44, y: 40, bright: false }, { x: 58, y: 40, bright: true },
];

export function EmptyState({ onAddLane }: { onAddLane: () => void }) {
  return (
    <View style={styles.root}>
      <Svg width={80} height={52} viewBox="0 0 80 52">
        {DOTS.map((d, i) => (
          <Rect
            key={i}
            x={d.x}
            y={d.y}
            width={10}
            height={10}
            rx={2}
            fill={d.bright ? '#3A3A40' : color.stepEmpty}
          />
        ))}
      </Svg>
      <View style={styles.textBlock}>
        <AppText style={styles.title}>No lanes yet</AppText>
        <AppText style={styles.body}>
          Add a Euclidean lane, then dial in steps, pulses & rotation to build a rhythm on the
          OP–XY.
        </AppText>
      </View>
      <Pressable onPress={onAddLane} style={styles.cta} accessibilityRole="button">
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
