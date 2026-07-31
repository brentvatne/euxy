/**
 * Lane row — the repeated unit of the Sequencer. Values pulled from Paper node
 * WV-0 (2026-07-24 "MS" revision): white accent bar + title(15 semibold)/
 * subtitle(12 medium #95959A) on the left; M/S on the right as BARE LETTERS
 * with a small light bar beneath — engaged = white letter + glowing bar,
 * matching the app-wide light language (no button chrome). Then a full-width
 * step strip (children) below. Presentational only — step sizing/playhead
 * live in the Sequencer.
 */
import { useIsFirstRender } from '@/lib/use-is-first-render';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { haptics } from '@/lib/shims';
import { color, font, HIT_TARGET, ramp, space } from '@/theme/tokens';
import { Key } from './key';
import { Led } from './led';
import { AppText } from './text';

export interface LaneRowProps {
  title: string;
  subtitle?: string;
  muted?: boolean;
  solo?: boolean;
  /** Lights the accent bar white; dimmed lanes get #606069 (Paper ZZ-0). */
  audible?: boolean;
  onToggleMute?: () => void;
  onToggleSolo?: () => void;
  onPressTitle?: () => void;
  children?: React.ReactNode;
}

export function LaneRow({
  title,
  subtitle,
  muted = false,
  solo = false,
  audible = !muted,
  onToggleMute,
  onToggleSolo,
  onPressTitle,
  children,
}: LaneRowProps) {
  // An accent lit in the row's FIRST render (an already-audible lane on boot)
  // must not bloom — only live changes ignite (see ui/led.tsx).
  const isFirstRender = useIsFirstRender();
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Pressable
          onPress={() => {
            haptics.selection();
            onPressTitle?.();
          }}
          disabled={!onPressTitle}
          style={({ pressed }) => [styles.titleGroup, pressed && styles.pressedDim]}
        >
          {/* The accent is a LIGHT, so it goes out like one: the white bar is
              an LED over the dim rail (instant on, ~300ms phosphor tail) rather
              than a backgroundColor swap. Engaging a solo re-mixes every lane
              at once, and that used to be a silent full-list colour teleport. */}
          <View style={styles.accent}>
            {audible ? (
              <Led ignite={!isFirstRender} style={[StyleSheet.absoluteFill, styles.accentLit]} />
            ) : null}
          </View>
          <View style={styles.textBlock}>
            <AppText style={styles.title}>{title}</AppText>
            {subtitle ? <AppText style={styles.subtitle}>{subtitle}</AppText> : null}
          </View>
        </Pressable>
        <View style={styles.msGroup}>
          <MSButton label="M" active={muted} onPress={onToggleMute} />
          <MSButton label="S" active={solo} onPress={onToggleSolo} />
        </View>
      </View>
      {/* The step grid is the lane's face — tapping it opens the editor too;
          pressing dims it so the whole surface reads as interactive. */}
      <Pressable
        onPress={() => {
          haptics.selection();
          onPressTitle?.();
        }}
        disabled={!onPressTitle}
        style={({ pressed }) => [styles.steps, pressed && styles.pressedDim]}
      >
        {children}
      </Pressable>
    </View>
  );
}

function MSButton({ label, active, onPress }: { label: string; active: boolean; onPress?: () => void }) {
  // A bar lit in the row's FIRST render (e.g. a muted lane on boot) must not
  // bloom — only live toggles ignite (see ui/led.tsx).
  const isFirstRender = useIsFirstRender();
  return (
    <Key
      onPress={onPress}
      disabled={!onPress}
      style={styles.ms}
      accessibilityRole="button"
      accessibilityLabel={label === 'M' ? 'Mute' : 'Solo'}
      accessibilityState={{ selected: active }}
    >
      <AppText style={[styles.msLabel, active && styles.msLabelActive]}>{label}</AppText>
      {/* Dim bar always present; the lit bar is an LED — instant on with the
          ignition bloom, phosphor decay off (mounted conditionally so the
          exiting animation runs). */}
      <View style={styles.msBar}>
        {active ? (
          <Led ignite={!isFirstRender} style={[StyleSheet.absoluteFill, styles.msBarActive]} />
        ) : null}
      </View>
    </Key>
  );
}

/** The row's vertical padding and the space between its header and its step
 * strip. Both are owned by the two PRESSABLES inside the row instead of by the
 * row itself, so no point of a lane is dead space — see the TOUCH TARGET notes
 * on `header` / `titleGroup` / `steps`. */
const ROW_PAD_V = space.md;
const HEADER_GAP = 9;

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: space.lg,
    borderTopWidth: 1,
    borderTopColor: ramp[7],
  },
  // TOUCH TARGET (TestFlight — the rows wanted more vertical hit area). The
  // padding that used to sit on the row now sits here and on `steps`, and the
  // two pressables grow to fill it: a tap in a lane's top padding, in the gap
  // above its strip, or in its bottom padding used to hit nothing at all.
  // Frames, not `hitSlop`: a hit area that only exists as slop on a
  // gesture-handler button does not extend its parent's box, so the touch is
  // still clipped at the parent's edges (same lesson as the Lane Editor's
  // `listenHit`). Geometry is unchanged — row padding 12 + header 44 + gap 9.
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: ROW_PAD_V,
  },
  // Stretched over the header's FULL frame (its padding included, via the
  // equal negative margin) and grown across the width left of M/S, so the
  // whole header line opens the editor — not just the label itself.
  titleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexShrink: 1,
    flexGrow: 1,
    alignSelf: 'stretch',
    marginTop: -ROW_PAD_V,
    paddingTop: ROW_PAD_V,
  },
  accent: { width: 4, height: 26, borderRadius: 2, backgroundColor: ramp[4] },
  accentLit: { borderRadius: 2, backgroundColor: color.label },
  textBlock: { gap: 1 },
  title: { fontFamily: font.text, fontWeight: '600', fontSize: 15, lineHeight: 18, color: color.label },
  subtitle: { fontFamily: font.text, fontWeight: '500', fontSize: 12, lineHeight: 16, color: color.label3 },
  msGroup: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  // Paper "MS": bare letter over a 14×3 light bar; the 36pt-wide pressable
  // keeps a full-height touch column without any visible chrome.
  ms: {
    width: 36,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  msLabel: { fontFamily: font.text, fontWeight: '700', fontSize: 15, lineHeight: 18, color: color.labelDisabled },
  msLabelActive: { color: '#FFFFFF' },
  msBar: { width: 14, height: 3, borderRadius: 2, backgroundColor: '#26262b' },
  msBarActive: {
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.95,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  // The strip's target reaches UP through the gap under the header and DOWN
  // through the row's bottom padding, so the band between two lanes belongs to
  // the lane above it rather than to nothing.
  steps: {
    flexDirection: 'row',
    gap: 4,
    paddingTop: HEADER_GAP,
    paddingBottom: ROW_PAD_V,
  },
  // Press-down feedback for large surfaces (concept H's "face one shade
  // darker", as dim — travel would warp wide rows).
  pressedDim: { opacity: 0.65 },
});
