/**
 * OTA update toast (Paper "Update · A — Transport toast"). Replaces the
 * blocking Alert that used to fire on launch: a non-modal pill that slides up
 * into the floating-action-bar slot, states the facts, and offers Reload or
 * dismiss. Nothing is blocked while it's up.
 *
 * Sits clear of BOTH the tab bar and the sequencer's 77pt transport, so it
 * never covers the play button on the one screen that has one. That costs a
 * little extra air on the tabs without a transport, which is fine for a
 * floating element.
 *
 * Motion: layout entering/exiting (same approach as ui/led.tsx) — the toast
 * springs up on mount and slides back down on unmount, so dismissing mid-
 * entrance hands off to the exit rather than snapping.
 */
import { StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';

import { AppText } from '@/components/ui';
import { Key } from '@/components/ui/key';
import { reloadUpdateAsync } from '@/lib/shims';
import { color, radius, space } from '@/theme/tokens';

const ENTER = FadeInDown.springify().damping(18).stiffness(260).reduceMotion(ReduceMotion.System);
const EXIT = FadeOutDown.duration(180).reduceMotion(ReduceMotion.System);

/** Tab bar (49) + transport (77) + the floating bar's 14pt margin. */
const TAB_BAR = 49;
const TRANSPORT = 77;
const BOTTOM_GAP = TAB_BAR + TRANSPORT + 14;

/** Dot-matrix down-arrow — "downloaded", in the app's LED vocabulary. */
function IconDownload() {
  return (
    <Svg width={11} height={15} viewBox="0 0 11 15">
      {[
        [4, 0],
        [4, 4],
        [0, 8],
        [4, 8],
        [8, 8],
        [4, 12],
      ].map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={3} height={3} rx={0.8} fill={color.label} />
      ))}
    </Svg>
  );
}

function IconDismiss() {
  return (
    <Svg width={11} height={11} viewBox="0 0 12 12">
      <Path d="M2 2 L10 10 M10 2 L2 10" fill="none" stroke={color.label2} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

export function UpdateToast({ onDismiss }: { onDismiss: () => void }) {
  const insets = useSafeAreaInsets();

  return (
    <Animated.View
      entering={ENTER}
      exiting={EXIT}
      pointerEvents="box-none"
      style={[styles.root, { bottom: insets.bottom + BOTTOM_GAP }]}
    >
      <View style={styles.toast}>
        <IconDownload />
        <View style={styles.copy}>
          <AppText style={styles.title}>Update ready</AppText>
          {/* expo-updates exposes no version for a *pending* update — only
              an id — so the facts line states what is actually known. */}
          <AppText mono style={styles.facts} numberOfLines={1}>
            downloaded · applies on reload
          </AppText>
        </View>
        <Key
          onPress={() => reloadUpdateAsync()}
          haptic="medium"
          // Vertical only: the pill is already wide enough, and expanding
          // sideways would collide with the dismiss key's own slop across
          // the 12pt gap. 32 + 6*2 = HIT_TARGET.
          hitSlop={{ top: 6, bottom: 6 }}
          style={styles.reload}
          accessibilityRole="button"
          accessibilityLabel="Reload to apply update"
        >
          <AppText style={styles.reloadLabel}>Reload</AppText>
        </Key>
        <Key
          onPress={onDismiss}
          hitSlop={8}
          style={styles.dismiss}
          accessibilityRole="button"
          accessibilityLabel="Dismiss update notice"
        >
          <IconDismiss />
        </Key>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: { position: 'absolute', left: space.lg, right: space.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: color.surface2,
    borderRadius: 16,
    paddingLeft: space.lg,
    paddingRight: space.md,
    paddingVertical: space.md,
  },
  copy: { flex: 1, gap: 2 },
  title: { fontSize: 15, lineHeight: 20, fontWeight: '600', color: color.label },
  facts: { fontSize: 11, lineHeight: 15, color: color.label4 },
  reload: {
    height: 32,
    paddingHorizontal: space.lg,
    borderRadius: radius.chip,
    backgroundColor: color.label,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reloadLabel: { fontSize: 14, lineHeight: 18, fontWeight: '600', color: color.ground },
  dismiss: {
    width: 28,
    height: 28,
    borderRadius: radius.chip,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
