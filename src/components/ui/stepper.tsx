/**
 * Stepper — a value with − / + buttons. Used for steps, pulses, rotation, tempo.
 * The chips are 44pt; HIT_SLOP grows what each one actually presses well past
 * that, because the glyph is a lot smaller than the area a thumb aims at.
 * Either button also HOLDS to scroll the value at an accelerating rate — see
 * use-hold-repeat (which owns the selection haptic for both paths).
 */
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { color, HIT_SLOP, HIT_TARGET, radius, space } from '@/theme/tokens';
import { AppText } from './text';
import { SFSymbol } from './symbol';
import { useHoldRepeat } from './use-hold-repeat';

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
  /** Reports whether the value moved — a hold ends when it stops moving. */
  const set = (n: number) => {
    const next = clamp(n);
    if (next === value) return false;
    onChange(next);
    return true;
  };
  const dec = useHoldRepeat(() => set(value - step));
  const inc = useHoldRepeat(() => set(value + step));
  return (
    <View style={styles.container}>
      {label ? (
        <AppText variant="micro" tone="tertiary" uppercase style={styles.label}>
          {label}
        </AppText>
      ) : null}
      <View style={styles.row}>
        <Pressable
          {...dec}
          disabled={value <= min}
          style={[styles.btn, value <= min && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Decrease"
          hitSlop={HIT_SLOP}
        >
          <SFSymbol name="minus" size={16} tint={value <= min ? color.labelDisabled : color.label} />
        </Pressable>
        <View style={styles.valueBox}>
          <AppText variant="headline" mono>
            {format ? format(value) : String(value)}
          </AppText>
        </View>
        <Pressable
          {...inc}
          disabled={value >= max}
          style={[styles.btn, value >= max && styles.btnDisabled]}
          accessibilityRole="button"
          accessibilityLabel="Increase"
          hitSlop={HIT_SLOP}
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
