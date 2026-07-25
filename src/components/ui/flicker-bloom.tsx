/**
 * FlickerBloom — a one-shot lit film over a cell (LED-motion spec, concept
 * J). Three shapes, picked per event:
 *
 *   • 'flicker' — instant attack to `peak`, a quick dip-and-rebloom sparkle,
 *     then the ~300ms phosphor decay (slot-machine texture; the lane-editor
 *     reroll wash uses this under its curtain).
 *   • 'pulse'   — instant attack, straight decay (the keep "stamp").
 *   • 'fade'    — fast smooth rise to `peak` (~80ms), then a longer
 *     ease-out. No hard frames — Brent's pick for the sequencer's
 *     changed-step highlight (the flicker there read as jitter, and a slow
 *     rise lagged the pattern swap, 2026-07-25).
 *
 * Two mounting patterns:
 *   • One-shot: mount fresh per event (key on a nonce) — plays once.
 *   • Retriggerable: keep it MOUNTED under a stable key and bump `trigger`
 *     per event. The sequence re-fires FROM THE CURRENT VALUE (Reanimated
 *     retargets in-flight), so rapid re-presses redirect a mid-fade film
 *     with no cut — this is how the step-strip stays interruptible under
 *     dice mashing.
 *
 * Triggered by state, never the clock — the whole sequence is precomputed,
 * so nothing runs per frame on the JS side. Callers gate mounting on
 * `useReducedMotion()` (settled frames instead).
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
  mode = 'flicker',
  trigger = 0,
  style,
}: {
  /** ms before the bloom fires (wash cells stagger by column). */
  delay?: number;
  /** Peak opacity of the lit film (grey palette — keep it a wash, not white-out). */
  peak?: number;
  /** Animation shape — see the header comment. */
  mode?: 'flicker' | 'pulse' | 'fade';
  /** Bump to re-fire the sequence on a mounted film (see header). Leave
   * constant for one-shot-per-mount usage. */
  trigger?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const v = useSharedValue(0);
  useEffect(() => {
    const decay = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
    v.value = withDelay(
      delay,
      mode === 'flicker'
        ? withSequence(
            withTiming(peak, { duration: 0 }), // LEDs attack instantly
            withTiming(peak * 0.3, { duration: 40 }),
            withTiming(peak * 0.85, { duration: 40 }),
            decay,
          )
        : mode === 'fade'
          ? withSequence(
              // Fast rise, smooth landing — long enough to never read as a
              // hard frame, short enough to feel simultaneous with the
              // pattern swap it highlights. On a retrigger this starts from
              // the film's current opacity, not zero.
              withTiming(peak, { duration: 80, easing: Easing.out(Easing.quad) }),
              withTiming(0, { duration: 380, easing: Easing.out(Easing.quad) }),
            )
          : withSequence(withTiming(peak, { duration: 0 }), decay),
    );
    // Fires on mount and again on every `trigger` bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const a = useAnimatedStyle(() => ({ opacity: v.value }));
  return <Animated.View pointerEvents="none" style={[style, a]} />;
}
