/**
 * Presentational building blocks for the MIDI tab, built to the exact values in
 * Paper nodes MC-0 / 1A8-0. StyleSheet + tokens only, monochrome. These are
 * MIDI-local (not shared primitives) because the grouped-form look — inset cells
 * with 1px separators and position-aware corner radii, a white-active compact
 * clock toggle, and a draggable latency slider — is specific to this screen.
 */
import { Slider } from '@expo/ui/community/slider';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Segmented } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';
import { IconChevronRight, IconChevronUpDown } from './icons';

/** Section-label + secondary-value gray (token `label25`, exact from Paper). */
export const GRAY = color.label25;
const OUTER = radius.cell; // 12
const INNER = 2;

export type CellPos = 'single' | 'first' | 'middle' | 'last';

function cornerStyle(pos: CellPos) {
  switch (pos) {
    case 'first':
      return { borderTopLeftRadius: OUTER, borderTopRightRadius: OUTER, borderBottomLeftRadius: INNER, borderBottomRightRadius: INNER };
    case 'last':
      return { borderTopLeftRadius: INNER, borderTopRightRadius: INNER, borderBottomLeftRadius: OUTER, borderBottomRightRadius: OUTER };
    case 'middle':
      return { borderRadius: INNER };
    default:
      return { borderRadius: OUTER };
  }
}

/**
 * Grouped-list section header, current-iOS style (Settings "My Devices"):
 * title case, ~20pt semibold, secondary gray, sitting close above its group —
 * NOT the legacy small-caps letterspaced header. `onLongPress` is for hidden
 * debug entries (no visual affordance by design).
 */
export function SectionHeader({
  children,
  first = false,
  onLongPress,
}: {
  children: string;
  first?: boolean;
  onLongPress?: () => void;
}) {
  const wrapStyle = [styles.section, first && styles.sectionFirst];
  const text = <AppText style={styles.sectionText}>{children}</AppText>;
  if (onLongPress) {
    return (
      <Pressable onLongPress={onLongPress} delayLongPress={600} style={wrapStyle}>
        {text}
      </Pressable>
    );
  }
  return <View style={wrapStyle}>{text}</View>;
}

/** Inset group container (16px side padding, 1px separators via gap). */
export function Group({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

/** A grouped-list cell. `pos` drives corner radii; `onPress` makes it a row button. */
export function Cell({
  pos,
  onPress,
  children,
  style,
  contentStyle,
}: {
  pos: CellPos;
  onPress?: () => void;
  children: React.ReactNode;
  style?: object;
  contentStyle?: object;
}) {
  const inner = <View style={[styles.cellContent, contentStyle]}>{children}</View>;
  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        style={({ pressed }) => [styles.cell, cornerStyle(pos), pressed && styles.cellPressed, style]}
      >
        {inner}
      </Pressable>
    );
  }
  return <View style={[styles.cell, cornerStyle(pos), style]}>{inner}</View>;
}

/** CONNECTED (green) / OFFLINE (gray) status pill. */
export function ConnectionBadge({ connected }: { connected: boolean }) {
  return (
    <View style={[styles.badge, { backgroundColor: connected ? 'rgba(48,209,88,0.16)' : 'rgba(121,121,130,0.18)' }]}>
      <View style={[styles.badgeDot, { backgroundColor: connected ? color.connected : color.label4 }]} />
      <AppText style={[styles.badgeText, { color: connected ? color.connected : color.label3 }]}>
        {connected ? 'CONNECTED' : 'OFFLINE'}
      </AppText>
    </View>
  );
}

/** Left label + right value with a chevron-up/down (opens a picker). */
export function ValueRow({ pos, label, value, onPress }: { pos: CellPos; label: string; value: string; onPress?: () => void }) {
  return (
    <Cell pos={pos} onPress={onPress}>
      <AppText style={styles.rowLabel}>{label}</AppText>
      <View style={styles.rowRight}>
        <AppText style={styles.rowValue}>{value}</AppText>
        <IconChevronUpDown />
      </View>
    </Cell>
  );
}

/** Left label + right chevron (pushes a screen). */
export function PushRow({ pos, label, onPress }: { pos: CellPos; label: string; onPress?: () => void }) {
  return (
    <Cell pos={pos} onPress={onPress}>
      <AppText style={styles.rowLabel}>{label}</AppText>
      <IconChevronRight />
    </Cell>
  );
}

/** Compact white-active Jam/Record toggle (Paper MC-0) — the shared Segmented, compact size. */
export function ClockModeToggle({ value, onChange }: { value: 'jam' | 'record'; onChange: (v: 'jam' | 'record') => void }) {
  return (
    <Segmented<'jam' | 'record'>
      size="compact"
      options={[
        { label: 'Jam', value: 'jam' },
        { label: 'Record', value: 'record' },
      ]}
      value={value}
      onChange={onChange}
    />
  );
}

/** Latency-offset slider — @expo/ui's native Slider drop-in (see SliderRow). */
export function LatencySlider({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <Slider
      value={value}
      minimumValue={min}
      maximumValue={max}
      step={1}
      minimumTrackTintColor={color.label}
      maximumTrackTintColor={color.surface2}
      thumbTintColor="#FFFFFF"
      onValueChange={(v) => onChange(Math.round(v))}
      style={styles.slider}
    />
  );
}

/** Monospace activity-log preview (last few lines) shown inside a Diagnostics cell. */
export function LogPreview({ lines }: { lines: { id: number; dir: 'in' | 'out'; hex: string; label: string }[] }) {
  if (lines.length === 0) {
    return <AppText style={[styles.logLine, styles.logIdle]} mono>— waiting for MIDI device —</AppText>;
  }
  return (
    <>
      {lines.map((l) => (
        <AppText key={l.id} mono numberOfLines={1} style={[styles.logLine, l.dir === 'out' ? styles.logOut : styles.logIn]}>
          {l.dir === 'out' ? '→' : '←'} {l.hex} {l.label}
        </AppText>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  // iOS Settings-style header: aligned with the group's edge, body-size semibold.
  section: { paddingTop: 24, paddingBottom: 8, paddingHorizontal: space.lg },
  sectionFirst: { paddingTop: space.sm },
  sectionText: { fontSize: 17, lineHeight: 22, fontWeight: '600', color: color.label3 },

  group: { paddingHorizontal: space.lg, gap: 1 },
  cell: { backgroundColor: color.surface },
  cellPressed: { opacity: 0.6 },
  cellContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: space.lg, minHeight: 24 },

  rowLabel: { fontSize: 16, lineHeight: 20, color: color.label },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: space.sm - 2 },
  rowValue: { fontSize: 16, lineHeight: 20, fontWeight: '500', color: GRAY },

  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: radius.chip },
  badgeDot: { width: 7, height: 7, borderRadius: radius.chip },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 0.3 },

  slider: { height: 28 },

  logLine: { fontSize: 12, lineHeight: 16 },
  logIdle: { color: color.label },
  logOut: { color: color.label },
  logIn: { color: color.label3 },
});
