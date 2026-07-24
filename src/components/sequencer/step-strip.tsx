/**
 * StepStrip — a lane's step blocks with the OP-XY light convention (Paper
 * WV-0/ZZ-0 2026-07-24 revision): every SEQUENCED step carries a steady white
 * LED at its top-center (like the hardware's key lights), and the playhead is
 * the light travelling the grid — on an empty step the light appears; when it
 * crosses a sequenced step, that step's light goes out for the step. No cyan,
 * no outlines.
 *
 * The travelling light is two UI-thread overlays sharing one derived position:
 *   • `Light` — an LED shown only while the current step is EMPTY
 *   • `Dark`  — a prominent BLACK dot over the LED spot, shown only while the
 *     current step is a HIT (the light "switches off" into a dark dot)
 * Blocks render once; NOTHING re-renders on the tick.
 *
 * Sizing redline unchanged: blocks fit-to-width down to MIN_BLOCK (15px, from
 * 1OO-0); past that the lane scrolls horizontally with fixed-width blocks, an
 * auto-following playhead, and a right edge fade (ZZ-0). The overview variant
 * always fits (blocks just shrink).
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  scrollTo,
  useAnimatedRef,
  useAnimatedStyle,
  useDerivedValue,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { patternForLane } from '@/state/selectors';
import type { Lane } from '@/state/types';
import { color } from '@/theme/tokens';

const MIN_BLOCK = 15; // fixed block width once a lane overflows (Paper 1OO-0/ZZ-0)
const FADE_W = 44;

export interface StepStripProps {
  lane: Lane;
  /** 'lane' = 22px blocks (WV-0); 'overview' = 12px compact rows (2CD-0). */
  variant?: 'lane' | 'overview';
}

const METRICS = {
  lane: { height: 22, gap: 4, radius: 4, led: 5, ledTop: 3 },
  overview: { height: 12, gap: 2, radius: 2, led: 4, ledTop: 2 },
} as const;

type Metrics = (typeof METRICS)['lane' | 'overview'];

/** Steady sequenced-step light (Paper: 5px white, dark ring, soft glow). */
function Led({ m }: { m: Metrics }) {
  return <View style={[styles.led, { width: m.led, height: m.led }]} />;
}

function Block({ hit, m, width }: { hit: number; m: Metrics; width?: number }) {
  return (
    <View
      style={[
        styles.block,
        { height: m.height, borderRadius: m.radius, paddingTop: m.ledTop },
        width != null ? { width } : { flex: 1 },
        { backgroundColor: hit ? color.stepHit : color.stepEmpty },
      ]}
    >
      {hit ? <Led m={m} /> : null}
    </View>
  );
}

export function StepStrip({ lane, variant = 'lane' }: StepStripProps) {
  const m = METRICS[variant];
  const pattern = patternForLane(lane);
  const n = pattern.length;
  const [width, setWidth] = useState(0);

  // Uniform grid: every lane sizes its blocks against AT LEAST 16 slots, so a
  // short lane (8, 12 steps) keeps the same block size as a 16-step lane and
  // leaves trailing space — mixed block widths read as noise (2026-07-24).
  // Longer lanes still shrink-to-fit until MIN_BLOCK, then scroll.
  const slots = Math.max(16, n);
  const fitBlockW = width > 0 && n > 0 ? (width - m.gap * (slots - 1)) / slots : 0;
  const scrolls = variant === 'lane' && width > 0 && fitBlockW < MIN_BLOCK;
  const blockW = scrolls ? MIN_BLOCK : fitBlockW;

  return (
    <View
      style={[styles.root, { height: m.height }, scrolls && { borderRadius: m.radius, overflow: 'hidden' }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {scrolls ? (
        <ScrollingBlocks lane={lane} pattern={pattern} m={m} blockW={blockW} viewportW={width} />
      ) : (
        <>
          <View style={[styles.row, { gap: m.gap }]}>
            {pattern.map((hit, i) => (
              <Block key={i} hit={hit} m={m} width={blockW > 0 ? blockW : undefined} />
            ))}
          </View>
          {blockW > 0 ? <TravellingLight lane={lane} pattern={pattern} m={m} blockW={blockW} /> : null}
        </>
      )}
    </View>
  );
}

/** The 64-step case: fixed blocks, auto-following scroll, right edge fade. */
function ScrollingBlocks({
  lane,
  pattern,
  m,
  blockW,
  viewportW,
}: {
  lane: Lane;
  pattern: number[];
  m: Metrics;
  blockW: number;
  viewportW: number;
}) {
  const ref = useAnimatedRef<Animated.ScrollView>();
  const res = lane.resolutionTicks;
  const len = lane.length;
  const contentW = len * (blockW + m.gap) - m.gap;

  // Keep the playhead centered-ish while running (UI thread, no re-render).
  useDerivedValue(() => {
    if (!playheadPlaying.value || res <= 0 || len <= 0) return;
    const step = Math.floor(playheadTick.value / res) % len;
    const x = step * (blockW + m.gap) - viewportW / 2 + blockW / 2;
    scrollTo(ref, Math.max(0, Math.min(contentW - viewportW, x)), 0, false);
  });

  return (
    <>
      <Animated.ScrollView
        ref={ref}
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ height: m.height }}
      >
        <View style={[styles.row, { gap: m.gap }]}>
          {pattern.map((hit, i) => (
            <Block key={i} hit={hit} m={m} width={blockW} />
          ))}
        </View>
        <TravellingLight lane={lane} pattern={pattern} m={m} blockW={blockW} />
      </Animated.ScrollView>
      {/* Right edge fade (Paper ZZ-0: 44px transparent → black). */}
      <View style={[styles.fade, { width: FADE_W, height: m.height }]} pointerEvents="none">
        <Svg width="100%" height="100%">
          <Defs>
            <LinearGradient id="fade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#000000" stopOpacity="0" />
              <Stop offset="0.9" stopColor="#000000" stopOpacity="1" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#fade)" />
        </Svg>
      </View>
    </>
  );
}

/**
 * The playhead: one derived step position drives two overlays — the light
 * (visible on empty steps) and the cover that blanks a hit step's steady LED.
 */
function TravellingLight({
  lane,
  pattern,
  m,
  blockW,
}: {
  lane: Lane;
  pattern: number[];
  m: Metrics;
  blockW: number;
}) {
  const res = lane.resolutionTicks;
  const len = lane.length;
  const gap = m.gap;

  const step = useDerivedValue(() =>
    res > 0 && len > 0 ? Math.floor(playheadTick.value / res) % len : 0,
  );

  const lightStyle = useAnimatedStyle(() => {
    const onHit = pattern[step.value] === 1;
    return {
      opacity: playheadPlaying.value && !onHit ? 1 : 0,
      transform: [{ translateX: step.value * (blockW + gap) }],
    };
  });
  const coverStyle = useAnimatedStyle(() => {
    const onHit = pattern[step.value] === 1;
    return {
      opacity: playheadPlaying.value && onHit ? 1 : 0,
      transform: [{ translateX: step.value * (blockW + gap) }],
    };
  });

  // The dark dot is 1px larger than the LED so it fully occludes it (the
  // faint white glow underneath reads as the dot's own rim light).
  const darkSize = m.led + 1;
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[styles.overlay, { width: blockW, height: m.height, paddingTop: m.ledTop }, lightStyle]}
      >
        <View style={[styles.led, { width: m.led, height: m.led }]} />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[styles.overlay, { width: blockW, height: m.height, paddingTop: m.ledTop }, coverStyle]}
      >
        <View style={[styles.darkDot, { width: darkSize, height: darkSize }]} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  row: { flexDirection: 'row' },
  fade: { position: 'absolute', top: 0, right: 0 },
  block: { alignItems: 'center' },
  led: {
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
    // Soft emissive glow (iOS): kept subtle so the playhead cover can blank it.
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.7,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 0 },
  },
  // Playhead-on-hit: the light goes dark but stays PRESENT — a black dot
  // with a faint light rim (Paper 2026-07-24 revision).
  darkDot: {
    borderRadius: 999,
    backgroundColor: '#08080a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  overlay: { position: 'absolute', top: 0, left: 0, alignItems: 'center' },
});
