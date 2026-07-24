/**
 * PillStepper — a labeled inline stepper rendered as a rounded pill:
 *   [ Label            −  value  + ]
 * Matches Paper nodes 12E-0 / DR-0 (the G1/G2 Pulses/Rotate pills and the Len
 * pill). Local to the Lane Editor; the shared `Stepper` primitive stacks its
 * label above and uses full 44pt button tiles, a different shape than this.
 * The −/+ glyphs are 16px but carry a 44pt hit area via hitSlop.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { color, font } from '@/theme/tokens';
import { AppText, SFSymbol } from '@/components/ui';

export interface PillStepperProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formats the displayed value (e.g. append a glyph). */
  format?: (value: number) => string;
  /** Compact variant (Len pill): tighter padding, smaller value. */
  compact?: boolean;
}

export function PillStepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format,
  compact = false,
}: PillStepperProps) {
  const atMin = value <= min;
  const atMax = value >= max;
  const set = (n: number) => {
    const next = Math.max(min, Math.min(max, n));
    if (next !== value) onChange(next);
  };
  return (
    <View style={[styles.pill, compact ? styles.pillCompact : styles.pillGrow]}>
      <AppText style={styles.label}>{label}</AppText>
      <View style={[styles.controls, compact && styles.controlsCompact]}>
        <Pressable
          onPress={() => set(value - step)}
          disabled={atMin}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={`Decrease ${label}`}
        >
          <SFSymbol name="minus" size={16} tint={atMin ? color.labelDisabled : color.label} />
        </Pressable>
        <AppText style={[styles.value, compact && styles.valueCompact]}>
          {format ? format(value) : String(value)}
        </AppText>
        <Pressable
          onPress={() => set(value + step)}
          disabled={atMax}
          hitSlop={16}
          accessibilityRole="button"
          accessibilityLabel={`Increase ${label}`}
        >
          <SFSymbol name="plus" size={16} tint={atMax ? color.labelDisabled : color.label} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Paper fix (2026-07-23): px 12 + controls gap 8 so the label never
  // crowds the − glyph (was px 14 / gap 12 → 1px of air at 143pt wide).
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: color.surface2,
    borderRadius: 11,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  pillGrow: { flex: 1 },
  pillCompact: { flexShrink: 0, gap: 10, paddingVertical: 9, paddingHorizontal: 12 },
  label: {
    fontFamily: font.text,
    fontWeight: '500',
    fontSize: 13,
    lineHeight: 16,
    color: color.label25,
  },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  controlsCompact: { gap: 8 },
  value: {
    fontFamily: font.display,
    fontWeight: '700',
    fontSize: 19,
    lineHeight: 24,
    color: color.label,
    minWidth: 18,
    textAlign: 'center',
  },
  valueCompact: { fontSize: 17, lineHeight: 22, minWidth: 22 },
});
