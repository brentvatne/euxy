/**
 * Presentational building blocks for the MIDI tab, built to the exact values in
 * Paper nodes MC-0 / 1A8-0. StyleSheet + tokens only, monochrome. These are
 * MIDI-local (not shared primitives) because the grouped-form look — inset cells
 * with 1px separators and position-aware corner radii, a white-active compact
 * clock toggle, and a draggable latency slider — is specific to this screen.
 */
import { useRef, useState } from 'react';
import { LayoutChangeEvent, PanResponder, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';
import { IconChevronRight, IconChevronUpDown } from './icons';

/** Section-label + secondary-value gray. Exact from Paper (not a token). */
export const GRAY = '#98989F';
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

/** Uppercase grouped-list section header. */
export function SectionHeader({ children, first = false }: { children: string; first?: boolean }) {
  return (
    <View style={[styles.section, first && styles.sectionFirst]}>
      <AppText style={styles.sectionText}>{children}</AppText>
    </View>
  );
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

/** Compact white-active Jam/Record toggle (Paper MC-0 — stronger than the shared gray Segmented). */
export function ClockModeToggle({ value, onChange }: { value: 'jam' | 'record'; onChange: (v: 'jam' | 'record') => void }) {
  const opts: { v: 'jam' | 'record'; label: string }[] = [
    { v: 'jam', label: 'Jam' },
    { v: 'record', label: 'Record' },
  ];
  return (
    <View style={styles.toggle}>
      {opts.map(({ v, label }) => {
        const active = v === value;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.toggleSeg, active && styles.toggleSegActive]}
          >
            <AppText style={[styles.toggleText, active ? styles.toggleTextActive : styles.toggleTextInactive]}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Draggable latency-offset slider. PanResponder (no extra deps) → works on web + native. */
export function LatencySlider({ value, min, max, onChange }: { value: number; min: number; max: number; onChange: (v: number) => void }) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const toValue = (x: number) => {
    const w = widthRef.current || 1;
    const pct = Math.max(0, Math.min(1, x / w));
    return Math.round(min + pct * (max - min));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => onChange(toValue(e.nativeEvent.locationX)),
      onPanResponderMove: (e) => onChange(toValue(e.nativeEvent.locationX)),
    })
  ).current;

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    widthRef.current = w;
    setWidth(w);
  };

  const pct = max > min ? (value - min) / (max - min) : 0;
  const thumb = 22;
  const fillW = Math.max(0, Math.min(width, pct * width));
  const thumbX = Math.max(0, Math.min(width - thumb, pct * width - thumb / 2));

  return (
    <View style={styles.sliderHit} onLayout={onLayout} {...pan.panHandlers}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: fillW }]} />
      </View>
      {width > 0 ? <View style={[styles.sliderThumb, { left: thumbX }]} /> : null}
    </View>
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
  section: { paddingTop: 20, paddingBottom: 7, paddingLeft: space.xl + space.md, paddingRight: space.lg },
  sectionFirst: { paddingTop: space.sm },
  sectionText: { fontSize: 13, lineHeight: 16, fontWeight: '500', letterSpacing: 0.3, color: GRAY, textTransform: 'uppercase' },

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

  toggle: { flexDirection: 'row', padding: 2, borderRadius: 8, backgroundColor: color.surface2 },
  toggleSeg: { paddingVertical: 5, paddingHorizontal: 14, borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  toggleSegActive: { backgroundColor: color.label },
  toggleText: { fontSize: 13, lineHeight: 16 },
  toggleTextActive: { color: color.ground, fontWeight: '700' },
  toggleTextInactive: { color: GRAY, fontWeight: '600' },

  sliderHit: { height: 22, justifyContent: 'center' },
  sliderTrack: { height: 6, borderRadius: 3, backgroundColor: color.surface2, overflow: 'hidden' },
  sliderFill: { height: 6, borderRadius: 3, backgroundColor: color.label },
  sliderThumb: {
    position: 'absolute',
    top: 0,
    width: 22,
    height: 22,
    borderRadius: radius.chip,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },

  logLine: { fontSize: 12, lineHeight: 16 },
  logIdle: { color: color.label },
  logOut: { color: color.label },
  logIn: { color: color.label3 },
});
