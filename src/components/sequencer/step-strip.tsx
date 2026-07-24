/**
 * StepStrip — a lane's step blocks + the UI-thread playhead overlay.
 * Exact values from Paper WV-0 / ZZ-0 (lane, 22px) and 2CD-0 (overview, 12px):
 * hit #AFAFB3, empty #2F2F36, gap 4 (2 in overview), radius 4 (2 in overview).
 * The playhead is an Animated overlay (2px / 1.5px white outline over a
 * darkening fill) driven straight off `core/playhead` shared values — the
 * blocks render once and NOTHING re-renders on the tick.
 *
 * Sizing redline: blocks are fit-to-width down to MIN_BLOCK (15px, from the
 * 64-step node 1OO-0); past that the lane scrolls horizontally with fixed-width
 * blocks, an auto-following playhead, and a right edge fade (ZZ-0). The
 * overview variant always fits (blocks just shrink).
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
  lane: { height: 22, gap: 4, radius: 4, outline: 2 },
  overview: { height: 12, gap: 2, radius: 2, outline: 1.5 },
} as const;

export function StepStrip({ lane, variant = 'lane' }: StepStripProps) {
  const m = METRICS[variant];
  const pattern = patternForLane(lane);
  const n = pattern.length;
  const [width, setWidth] = useState(0);

  const fitBlockW = width > 0 && n > 0 ? (width - m.gap * (n - 1)) / n : 0;
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
              <View
                key={i}
                style={{
                  flex: 1,
                  height: m.height,
                  borderRadius: m.radius,
                  backgroundColor: hit ? color.stepHit : color.stepEmpty,
                }}
              />
            ))}
          </View>
          {blockW > 0 ? <PlayheadOverlay lane={lane} m={m} blockW={blockW} /> : null}
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
  m: (typeof METRICS)['lane' | 'overview'];
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
            <View
              key={i}
              style={{
                width: blockW,
                height: m.height,
                borderRadius: m.radius,
                backgroundColor: hit ? color.stepHit : color.stepEmpty,
              }}
            />
          ))}
        </View>
        <PlayheadOverlay lane={lane} m={m} blockW={blockW} />
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
 * White-outline playhead block. Paper darkens the block under the playhead
 * (empty → #16161D, hit → #606069); a translucent dark fill over the existing
 * block approximates both from one overlay.
 */
function PlayheadOverlay({
  lane,
  m,
  blockW,
}: {
  lane: Lane;
  m: (typeof METRICS)['lane' | 'overview'];
  blockW: number;
}) {
  const res = lane.resolutionTicks;
  const len = lane.length;
  const gap = m.gap;
  const style = useAnimatedStyle(() => {
    const step = res > 0 && len > 0 ? Math.floor(playheadTick.value / res) % len : 0;
    return {
      opacity: playheadPlaying.value,
      transform: [{ translateX: step * (blockW + gap) }],
    };
  });
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.playhead,
        {
          width: blockW,
          height: m.height,
          borderRadius: m.radius,
          borderWidth: m.outline,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative' },
  row: { flexDirection: 'row' },
  fade: { position: 'absolute', top: 0, right: 0 },
  playhead: {
    position: 'absolute',
    top: 0,
    left: 0,
    borderColor: color.label,
    backgroundColor: 'rgba(8,8,10,0.55)',
  },
});
