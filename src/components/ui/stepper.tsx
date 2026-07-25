/**
 * Stepper — a value with − / + buttons. Used for steps, pulses, rotation, tempo.
 * Both buttons meet the 44pt hit target; the glyph area may look smaller.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/shims';
import { color, HIT_TARGET, radius, space } from '@/theme/tokens';
import { AppText } from './text';
import { SFSymbol } from './symbol';

export interface StepperProps {
  label?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Formats the displayed value (e.g. append a unit). */
  format?: (value: number) => string;
}

export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  format,
}: StepperProps) {
  const clamp = (n: number) => Math.max(min, Math.min(max, n));
  const set = (n: number) => {
    const next = clamp(n);
    if (next !== value) {
      haptics.selection();
      onChange(next);
    }
  };
  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="micro" tone="tertiary" uppercase style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <Pressable
          onPress={() => set(value - step)}
          disabled={value <= min}
          style={[styles.btn, value <= min && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          hitSlop={space.sm}
        >
          <SFSymbol name="minus" size={16} tint={value <= min ? color.labelDisabled : color.label} />
        </Pressable>
        <View style={styles.valueBox}>
          <AppText variant="headline" mono>
            {format ? format(value) : String(value)}
          </AppText>
        </View>
        <Pressable
          onPress={() => set(value + step)}
          disabled={value >= max}
          style={[styles.btn, value >= max && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Increase"
          hitSlop={space.sm}
        >
          <SFSymbol name="plus" size={16} tint={value >= max ? color.labelDisabled : color.label} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: space.xs },
  label: { marginLeft: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  btn: {
    width: HIT_TARGET,
    height: HIT_TARGET,
    borderRadius: radius.control,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDisabled: { opacity: 0.5 },
  valueBox: { minWidth: 56, alignItems: 'center' },
});
