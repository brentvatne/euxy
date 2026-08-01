/**
 * Tip — the app's popover: a short explainer bubble that DROPS out of the
 * control it belongs to, with a caret pointing back at that control's centre.
 * Extracted from the Lane Editor's Listen popover (Brent 2026-07-29 asked for a
 * popover instead of a strip in the group) so every explainer of this kind is
 * literally the same object; the Sequencer header's connection pill is the
 * second one.
 *
 * It floats OUT of layout (absolute at the anchor's bottom edge, pointerEvents
 * none), so showing one never reflows the screen and whatever sits underneath
 * stays tappable — which also means the tip can't be tapped to dismiss it: the
 * caller owns when it leaves.
 *
 * The anchor is whichever View the Tip is rendered into. That View is the
 * positioning context, so it needs a zIndex above the content the bubble paints
 * over, and no horizontal padding of its own (absolute insets here start at the
 * anchor's padding edge, while measured `caretLeft` values do not).
 *
 * `caretLeft` is the anchoring control's measured centre in the anchor's
 * coordinate space — measured, not derived from the label, because a control can
 * change width (the Listen key flips to "Listening…").
 */
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { color, font, radius, ramp } from '@/theme/tokens';
import { AppText } from './text';

/** Caret box (a rotated square, so its point is the diagonal). */
const TIP_CARET = 12;

/**
 * The popover DROPS out of its control: opacity leads, 6pt of travel, one soft
 * settle. Short enough to feel like the control's own response to the tap.
 */
const TIP_ENTER = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -6 }] },
    animations: {
      opacity: withTiming(1, {
        duration: 130,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      transform: [
        {
          translateY: withSpring(0, {
            duration: 320,
            dampingRatio: 0.8,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    },
  };
};
/** Leaving is faster and drops the movement — whatever it explained is over. */
const TIP_EXIT = FadeOut.duration(110).reduceMotion(ReduceMotion.System);

export function Tip({
  caretLeft,
  style,
  children,
}: {
  caretLeft: number;
  /** Layer override — e.g. an inset that lands the bubble on a screen margin. */
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}) {
  return (
    <Animated.View
      pointerEvents="none"
      entering={TIP_ENTER}
      exiting={TIP_EXIT}
      style={[styles.layer, style]}
    >
      {/* Caret first, bubble second: the bubble paints over the square's lower
          half, leaving only the point above its edge. */}
      <View style={[styles.caret, { left: caretLeft - TIP_CARET / 2 }]} />
      <View style={styles.bubble}>
        <AppText style={styles.text}>{children}</AppText>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Hangs off the bottom edge of the anchor, out of the layout.
  layer: { position: 'absolute', top: '100%', left: 0, right: 0 },
  bubble: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginRight: 8,
    maxWidth: 300,
    // surface4, the top of the ramp — NOT surface3. The fill was always fully
    // opaque, but surface3 is the level a row expands INTO (trackPanel, the pad
    // grid) and lands only ~14 of 255 above the surface2 cell this floats over,
    // so the panel read as see-through. One step up clears both the cell and
    // the disclosure level, and the rim pins the edge the soft shadow left
    // ambiguous — together they read as solid rather than as a frosted overlay.
    backgroundColor: color.surface4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ramp[3],
    borderRadius: radius.cell,
    paddingVertical: 10,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  caret: {
    position: 'absolute',
    top: 3,
    width: TIP_CARET,
    height: TIP_CARET,
    borderRadius: 2,
    // Matches the bubble it points out of — the caret is the same surface.
    backgroundColor: color.surface4,
    transform: [{ rotate: '45deg' }],
  },
  text: {
    fontFamily: font.text,
    fontSize: 13,
    lineHeight: 18,
    // label2 on the lighter panel falls to ~4.2:1; primary label holds the copy
    // legible, and the popover is only up for as long as it's needed anyway.
    color: color.label,
  },
});
