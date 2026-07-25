/**
 * Led — an LED that behaves like hardware (LED-motion spec, principle 1):
 * attacks INSTANTLY when it appears (no fade-in) and decays slowly when it
 * goes out (~300ms ease-out phosphor tail). Render it conditionally —
 * `{lit ? <Led style={...}/> : null}` — and Reanimated's exiting animation
 * carries the decay on the UI thread. Reduced Motion snaps it off.
 *
 * `ignite` adds the turn-ON micro-animation (roadmap "Light on/off"): the
 * dot is at full brightness from the first frame, and a pre-scaled halo
 * overlay flashes and fades over ~150ms — the glow-radius overshoot.
 *
 * PERF RULE (this file exists to enforce it): every animated property here
 * is OPACITY-ONLY. Opacity composites on the GPU without touching the
 * layer's raster; animating transform/size on a shadowed view re-renders
 * the shadow offscreen EVERY FRAME, which visibly drops frames once a
 * slider drag or dice press blooms many LEDs at once (Brent, 2026-07-25).
 * The halo's 1.6× scale is STATIC — rendered once at mount, then only its
 * alpha moves.
 *
 * Callers MUST keep ignite false for LEDs mounted in a screen's initial
 * render (gate on a first-render ref): a whole grid blooming on mount is
 * noise, and initial-mount entering animations have raced cold boot before
 * (the wave-2 invisible-lane-list bug).
 */
import { useRef } from 'react';
import { StyleSheet } from 'react-native';
import Animated, { Easing, ReduceMotion, makeMutable, withTiming } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * While 1, LED exit decays are skipped (lights vanish with their cell).
 * The phosphor tail is for a light going out on a cell that STAYS — when the
 * grid itself shrinks (Steps slider), the removed cells unmount instantly
 * and a decaying ghost floats in empty space (Brent 2026-07-25). Length
 * changers arm this around the commit (see lane-editor setLength).
 */
export const ledExitSuppressed = makeMutable(0);

const decay = () => {
  'worklet';
  if (ledExitSuppressed.value === 1) {
    return {
      initialValues: { opacity: 0 },
      animations: { opacity: withTiming(0, { duration: 0 }) },
    };
  }
  return {
    initialValues: { opacity: 1 },
    animations: {
      opacity: withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
    },
  };
};

const haloFlash = () => {
  'worklet';
  return {
    initialValues: { opacity: 0.85 },
    animations: {
      opacity: withTiming(0, {
        duration: 150,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
    },
  };
};

export function Led({ style, ignite = false }: { style?: StyleProp<ViewStyle>; ignite?: boolean }) {
  // Ignite is a MOUNT-TIME fact: call sites flip their first-render ref
  // right after mounting, and a later re-render must not retroactively
  // mount the halo — its entering would flash every already-lit LED.
  const igniteAtMount = useRef(ignite).current;
  return (
    <Animated.View pointerEvents="none" exiting={decay} style={style}>
      {igniteAtMount ? (
        <Animated.View pointerEvents="none" entering={haloFlash} style={styles.halo} />
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // The bloom halo: the dot's own footprint pre-scaled 1.6× (static — see
  // the perf rule above). Soft white, no shadow of its own: at 60% alpha
  // over the glowing dot it reads as the light flaring, not a second dot.
  halo: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    transform: [{ scale: 1.6 }],
    // Resting alpha is ZERO — the entering flash animates 0.85 → 0, so
    // whether the final animated value or the style wins after completion
    // (and under Reduced Motion), the halo ends invisible either way.
    opacity: 0,
  },
});
