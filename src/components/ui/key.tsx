/**
 * Key — the app-wide pressable (LED-motion spec, concept H): every button is
 * a hardware key. Press-in: 80ms travel to scale 0.94; release: a 300ms
 * spring back with slight overshoot, plus an optional one-shot "LED ack" —
 * a thin light ring that blooms out and fades. Pure Reanimated on the UI
 * thread; a drop-in Pressable replacement (no PanResponder anywhere).
 */
import { StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { Pressable, type PressableProps } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { haptics } from '@/lib/shims';

const TRAVEL = { duration: 80, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System };
const SPRING = { damping: 14, stiffness: 320, reduceMotion: ReduceMotion.System };

export interface KeyProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** One-shot light ring on release (transport-grade keys). */
  ack?: boolean;
  /** Press-in feedback weight; 'none' for keys that provide their own. */
  haptic?: 'light' | 'medium' | 'none';
  /**
   * 0…1 — how much of the press travel to GIVE BACK while the finger is still
   * down, for a press that has become a gesture of its own (the dice charge).
   * The travel is a 6% scale, and a scale is resampling: held for the seconds a
   * charge lasts it leaves the key's glyph off the device-pixel grid, which
   * reads as the glyph going blurry (Brent, on the dice hold). A tap is far too
   * short to see it, so only a key that owns a long hold passes this.
   */
  travelRelease?: SharedValue<number>;
  children?: React.ReactNode;
}

export function Key({ style, ack = false, haptic = 'light', travelRelease, onPressIn, onPressOut, children, ...rest }: KeyProps) {
  const down = useSharedValue(0);
  const ring = useSharedValue(0);

  const travelStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - 0.06 * down.value * (1 - (travelRelease?.value ?? 0)) }],
  }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.8 * ring.value,
    transform: [{ scale: 1 + 0.3 * (1 - ring.value) }],
  }));

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        down.value = withTiming(1, TRAVEL);
        // Feel the key travel, not the release — hardware keys click on the
        // way down.
        if (haptic !== 'none') haptics.impact(haptic);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        down.value = withSpring(0, SPRING);
        if (ack) {
          // 1 → 0 drives both fade-out and bloom-out in one value.
          ring.value = withSequence(
            withTiming(1, { duration: 0 }),
            withTiming(0, { duration: 250, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System }),
          );
        }
        onPressOut?.(e);
      }}
    >
      <Animated.View style={[style, travelStyle]}>
        {children}
        {ack ? <Animated.View pointerEvents="none" style={[styles.ring, ringStyle]} /> : null}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#F6F4F4',
    // The ring blooms via transform: scale. Clipping flips RN onto the
    // CALayer border path (vector, scales crisp); unclipped borders are
    // rasterized with a nearest-neighbor magnification filter and alias
    // as they grow. No children, so the clip costs nothing.
    overflow: 'hidden',
  },
});
