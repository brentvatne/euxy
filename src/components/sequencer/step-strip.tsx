/**
 * StepStrip — a lane's step blocks with the OP-XY light convention (Paper
 * WV-0/ZZ-0 2026-07-24 revision): every SEQUENCED step carries a steady white
 * LED at its top-center (like the hardware's key lights), and the playhead is
 * the light travelling the grid — on an empty step the light appears; where it
 * crosses a sequenced step it becomes a prominent BLACK dot. No cyan.
 *
 * ALL steps are always visible (no horizontal scrolling): like the Lane
 * Editor's combined card, a lane wraps at 16 steps per row, and every lane
 * sizes its blocks against exactly 16 slots — a short lane (8, 12) keeps the
 * same block size and leaves trailing space; a 64-step lane is 4 rows.
 *
 * The travelling light is two UI-thread overlays sharing one derived step:
 *   • `Light` — an LED shown only while the current step is EMPTY
 *   • `Dark`  — the black dot, shown only while the current step is a HIT
 * Blocks render once; NOTHING re-renders on the tick.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue } from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { patternForLane } from '@/state/selectors';
import type { Lane } from '@/state/types';
import { color } from '@/theme/tokens';

const PER_ROW = 16;
const GAP = 4;
const BLOCK_H = 22;
const RADIUS = 4;
const LED = 5;
const LED_TOP = 3;

export interface StepStripProps {
  lane: Lane;
}

/** Steady sequenced-step light (Paper: 5px white, dark ring, soft glow). */
function Led() {
  return <View style={styles.led} />;
}

export function StepStrip({ lane }: StepStripProps) {
  const pattern = patternForLane(lane);
  const n = pattern.length;
  const [width, setWidth] = useState(0);

  const blockW = width > 0 ? (width - GAP * (PER_ROW - 1)) / PER_ROW : 0;

  const rows: number[][] = [];
  for (let i = 0; i < n; i += PER_ROW) {
    rows.push(Array.from({ length: Math.min(PER_ROW, n - i) }, (_, j) => i + j));
  }

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {blockW > 0
        ? rows.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((i) => (
                <View
                  key={i}
                  style={[
                    styles.block,
                    { width: blockW },
                    { backgroundColor: pattern[i] ? color.stepHit : color.stepEmpty },
                  ]}
                >
                  {pattern[i] ? <Led /> : null}
                </View>
              ))}
            </View>
          ))
        : null}
      {blockW > 0 ? <TravellingLight lane={lane} pattern={pattern} blockW={blockW} /> : null}
    </View>
  );
}

/**
 * The playhead: one derived step position drives two overlays — the light
 * (visible on empty steps) and the black dot on hit steps. Position wraps
 * with the grid (x = step % 16, y = row).
 */
function TravellingLight({
  lane,
  pattern,
  blockW,
}: {
  lane: Lane;
  pattern: number[];
  blockW: number;
}) {
  const res = lane.resolutionTicks;
  const len = lane.length;

  const step = useDerivedValue(() =>
    res > 0 && len > 0 ? Math.floor(playheadTick.value / res) % len : 0,
  );

  const lightStyle = useAnimatedStyle(() => {
    const s = step.value;
    return {
      opacity: playheadPlaying.value && pattern[s] !== 1 ? 1 : 0,
      transform: [
        { translateX: (s % PER_ROW) * (blockW + GAP) },
        { translateY: Math.floor(s / PER_ROW) * (BLOCK_H + GAP) },
      ],
    };
  });
  const darkStyle = useAnimatedStyle(() => {
    const s = step.value;
    return {
      opacity: playheadPlaying.value && pattern[s] === 1 ? 1 : 0,
      transform: [
        { translateX: (s % PER_ROW) * (blockW + GAP) },
        { translateY: Math.floor(s / PER_ROW) * (BLOCK_H + GAP) },
      ],
    };
  });

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.overlay, { width: blockW }, lightStyle]}>
        <View style={styles.led} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.overlay, { width: blockW }, darkStyle]}>
        <View style={styles.darkDot} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  block: {
    height: BLOCK_H,
    borderRadius: RADIUS,
    alignItems: 'center',
    paddingTop: LED_TOP,
  },
  led: {
    width: LED,
    height: LED,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
    // Soft emissive glow (iOS).
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.7,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 0 },
  },
  // Playhead-on-hit: the light goes dark but stays PRESENT — a black dot
  // with a faint light rim (Paper 2026-07-24 revision).
  darkDot: {
    width: LED + 1,
    height: LED + 1,
    borderRadius: 999,
    backgroundColor: '#08080a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: BLOCK_H,
    alignItems: 'center',
    paddingTop: LED_TOP,
  },
});
