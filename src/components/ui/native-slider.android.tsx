/* eslint-disable react-hooks/immutability -- the `.value` writes below
   are to Reanimated shared values from gesture worklets and effects, which the
   compiler's immutability rule cannot see through (same as floating-actions). */
/**
 * Android slider — a hand-rolled monochrome control instead of the Material 3
 * Compose slider. M3's expressive thumb (a 4×44 bar with a gap cut out of the
 * track on either side, plus a stop-indicator dot at the far end) is the
 * loudest thing on the lane editor and nothing like the iOS UISlider the rest
 * of the design is drawn against. This keeps the UISlider silhouette — 4pt
 * track, round thumb — so Velocity / Gate / Pulses read the same on both
 * platforms.
 *
 * Gesture arbitration: the Pan only activates after a horizontal move and
 * FAILS on a vertical one, so the parent scroll view still owns vertical
 * drags that happen to start on a slider. The value is only committed from an
 * activated gesture (never from touch-down) so a scroll that starts on a
 * slider cannot nudge it.
 *
 * Same prop surface as the SwiftUI-backed `native-slider.tsx` — callers do not
 * know which one they got.
 */
import type { SliderProps as NativeSliderProps } from '@expo/ui/community/slider';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

export type { NativeSliderProps };

const THUMB = 22;
const TRACK = 4;
/** Vertical room around the thumb so the touch target clears 44pt. */
const HEIGHT = 44;

function quantize(raw: number, min: number, max: number, step: number | undefined) {
  'worklet';
  let v = raw;
  if (step && step > 0) v = min + Math.round((raw - min) / step) * step;
  return Math.min(max, Math.max(min, v));
}

export function NativeSlider({
  value,
  minimumValue,
  maximumValue,
  lowerLimit,
  upperLimit,
  step,
  disabled,
  inverted,
  minimumTrackTintColor = '#EBEBEB',
  maximumTrackTintColor = '#2C2C2E',
  thumbTintColor = '#F6F4F4',
  onValueChange,
  style,
}: NativeSliderProps) {
  const min = minimumValue ?? 0;
  const max = Math.max(min + Number.EPSILON, maximumValue ?? 1);
  const lo = lowerLimit ?? min;
  const hi = upperLimit ?? max;
  const span = max - min;
  const current = value ?? min;

  const width = useSharedValue(0);
  const progress = useSharedValue((current - min) / span);
  const dragging = useSharedValue(false);
  const lastEmitted = useSharedValue(current);

  // Controlled: follow the prop whenever a finger is not on the thumb (a
  // revert, a preset restore, a dice roll all land here).
  useEffect(() => {
    if (dragging.value) return;
    lastEmitted.value = current;
    progress.value = (current - min) / span;
  }, [current, min, span, dragging, lastEmitted, progress]);

  const emit = (next: number) => onValueChange?.(next);

  const setFromX = (x: number) => {
    'worklet';
    const w = width.value;
    if (w <= 0) return;
    let ratio = Math.min(1, Math.max(0, x / w));
    if (inverted) ratio = 1 - ratio;
    const next = quantize(min + ratio * span, Math.max(min, lo), Math.min(max, hi), step);
    progress.value = (next - min) / span;
    if (next !== lastEmitted.value) {
      lastEmitted.value = next;
      scheduleOnRN(emit, next);
    }
  };

  const pan = Gesture.Pan()
    .enabled(!disabled)
    .hitSlop({ vertical: 6, horizontal: 10 })
    .activeOffsetX([-3, 3])
    .failOffsetY([-10, 10])
    .onStart((e) => {
      dragging.value = true;
      setFromX(e.x);
    })
    .onUpdate((e) => setFromX(e.x))
    .onFinalize(() => {
      dragging.value = false;
    });

  const fillStyle = useAnimatedStyle(() => {
    const p = inverted ? 1 - progress.value : progress.value;
    return { width: p * width.value };
  });
  const thumbStyle = useAnimatedStyle(() => {
    const p = inverted ? 1 - progress.value : progress.value;
    const travel = Math.max(0, width.value - THUMB);
    return {
      transform: [
        { translateX: p * travel },
        { scale: withTiming(dragging.value ? 1.12 : 1, { duration: 120 }) },
      ],
    };
  });

  return (
    <GestureDetector gesture={pan}>
      <View
        style={[styles.root, disabled && styles.disabled, style]}
        onLayout={(e) => {
          width.value = e.nativeEvent.layout.width;
        }}
        accessible
        accessibilityRole="adjustable"
        accessibilityValue={{ min, max, now: current }}
      >
        <View style={[styles.track, { backgroundColor: maximumTrackTintColor }]} />
        <Animated.View
          style={[styles.track, styles.fill, { backgroundColor: minimumTrackTintColor }, fillStyle]}
        />
        <Animated.View style={[styles.thumb, { backgroundColor: thumbTintColor }, thumbStyle]} />
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { height: HEIGHT, justifyContent: 'center' },
  disabled: { opacity: 0.4 },
  track: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: TRACK,
    borderRadius: TRACK / 2,
  },
  fill: { right: undefined },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    // UISlider's thumb shadow — lifts the white disc off the white fill.
    elevation: 2,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
});
