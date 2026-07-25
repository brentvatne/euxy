/**
 * Led — an LED that behaves like hardware (LED-motion spec, principle 1):
 * attacks INSTANTLY when it appears (no fade-in) and decays slowly when it
 * goes out (~300ms ease-out phosphor tail). Render it conditionally —
 * `{lit ? <Led style={...}/> : null}` — and Reanimated's exiting animation
 * carries the decay on the UI thread. Reduced Motion snaps it off.
 */
import Animated, { Easing, ReduceMotion, withTiming } from 'react-native-reanimated';
import type { StyleProp, ViewStyle } from 'react-native';

const decay = () => {
  'worklet';
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

export function Led({ style }: { style?: StyleProp<ViewStyle> }) {
  return <Animated.View pointerEvents="none" exiting={decay} style={style} />;
}
