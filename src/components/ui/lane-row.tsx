/**
 * Lane row — the repeated unit of the Sequencer. Values pulled from Paper node
 * WV-0: white accent bar + title(15 semibold)/subtitle(12 medium #95959A) on the
 * left, M/S (44×44, radius 10, bg #16161D; active = white fill) on the right,
 * then a full-width step strip (children) below. Presentational only — step
 * sizing/playhead live in the Sequencer.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { color, font, HIT_TARGET, radius, ramp, space } from '@/theme/tokens';
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
  return (
    <View style={styles.row}>
      <View style={styles.header}>
        <Pressable onPress={onPressTitle} disabled={!onPressTitle} style={styles.titleGroup}>
          <View style={[styles.accent, { backgroundColor: audible ? color.label : ramp[4] }]} />
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
      <View style={styles.steps}>{children}</View>
    </View>
  );
}

function MSButton({ label, active, onPress }: { label: string; active: boolean; onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={[styles.ms, active && styles.msActive]}
      accessibilityRole="button"
      accessibilityLabel={label === 'M' ? 'Mute' : 'Solo'}
      accessibilityState={{ selected: active }}
    >
      <AppText style={[styles.msLabel, active && styles.msLabelActive]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    gap: 9,
    borderTopWidth: 1,
    borderTopColor: ramp[7],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  titleGroup: { flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 },
  accent: { width: 4, height: 26, borderRadius: 2 },
  textBlock: { gap: 1 },
  title: { fontFamily: font.text, fontWeight: '600', fontSize: 15, lineHeight: 18, color: color.label },
  subtitle: { fontFamily: font.text, fontWeight: '500', fontSize: 12, lineHeight: 16, color: color.label3 },
  msGroup: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  ms: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: 10,
    backgroundColor: ramp[7],
    alignItems: 'center',
    justifyContent: 'center',
  },
  msActive: { backgroundColor: color.label },
  msLabel: { fontFamily: font.text, fontWeight: '700', fontSize: 13, lineHeight: 16, color: color.label3 },
  msLabelActive: { color: color.ground },
  steps: { flexDirection: 'row', gap: 4 },
});
