/**
 * NoticeBanner — the app's one transient status line, rendered as a layer over
 * the root Stack (see app/_layout.tsx). Mono, uppercase, spec-sheet: the same
 * voice as the channel-surf panel's status row, because that is what it
 * replaced for the channel link.
 *
 * pointerEvents is 'none' UNCONDITIONALLY. This is the second full-screen layer
 * in the app after BootSplash, and BootSplash is only allowed to hold touches
 * because it is opaque and self-terminating; a status line that could ever eat
 * a tap on the sequencer would be the worst kind of bug to find.
 *
 * A second notice arriving mid-flight RETARGETS the shared values rather than
 * remounting to replay — a switch that lands while the previous line is still
 * fading has to read as one continuous banner, not a cut.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppText } from '@/components/ui';
import { subscribeNotice } from '@/lib/notice';
import { color, radius, space } from '@/theme/tokens';

/** How long a line holds before it takes itself away. */
const HOLD_MS = 3200;
const IN_MS = 180;
const OUT_MS = 260;
/** Travel of the drop-in. Small: this is a readout, not an entrance. */
const LIFT = 8;

export function NoticeBanner() {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState<string | null>(null);
  const opacity = useSharedValue(0);
  const lift = useSharedValue(-LIFT);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unsubscribe = subscribeNotice((next) => {
      setText(next);
      opacity.value = withTiming(1, { duration: IN_MS, easing: Easing.out(Easing.quad) });
      lift.value = withSpring(0, {
        damping: 22,
        stiffness: 260,
        reduceMotion: ReduceMotion.System,
      });
      if (hideTimer.current != null) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => {
        lift.value = withTiming(-LIFT, { duration: OUT_MS, easing: Easing.in(Easing.quad) });
        opacity.value = withTiming(
          0,
          { duration: OUT_MS, easing: Easing.in(Easing.quad) },
          // `finished` is false when a NEW notice retargeted this fade — in
          // that case the banner must keep the new text, not clear it.
          (finished) => {
            if (finished) runOnJS(setText)(null);
          },
        );
      }, HOLD_MS);
    });
    return () => {
      unsubscribe();
      if (hideTimer.current != null) clearTimeout(hideTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animated = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: lift.value }],
  }));

  if (text == null) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.layer, { paddingTop: insets.top + space.sm }, animated]}
    >
      <View style={styles.pill}>
        <AppText mono style={styles.text}>
          {text}
        </AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    // Under BootSplash's 1000: a notice posted by a link that launched the app
    // belongs behind the power-on, and it is still there when the fade ends.
    zIndex: 900,
  },
  pill: {
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.chip,
    backgroundColor: color.surface,
  },
  text: { fontSize: 12, lineHeight: 16, color: color.label2, letterSpacing: 0.6 },
});
