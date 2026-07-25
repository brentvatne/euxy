/**
 * FlickerBloom — a one-shot LED flicker over a cell (LED-motion spec,
 * concept J): instant attack to `peak`, a quick dip-and-rebloom sparkle,
 * then the standard ~300ms phosphor decay to nothing. Mounted fresh per
 * event (key it on a nonce) and triggered by state, never the clock — the
 * whole sequence is precomputed, so nothing runs per frame on the JS side.
 * Callers gate mounting on `useReducedMotion()` (settled frames instead).
 */
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

export function FlickerBloom({
  delay = 0,
  peak = 0.55,
  style,
}: {
  /** ms before the flicker fires (wash cells stagger by column). */
  delay?: number;
  /** Peak opacity of the lit film (grey palette — keep it a wash, not white-out). */
  peak?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    v.value = withDelay(
      delay,
      withSequence(
        withTiming(peak, { duration: 0 }), // LEDs attack instantly
        withTiming(peak * 0.3, { duration: 40 }),
        withTiming(peak * 0.85, { duration: 40 }),
        withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) }),
      ),
    );
    // One-shot on mount by design.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View pointerEvents="none" style={[style, a]} />;
}
