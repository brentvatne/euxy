/**
 * SliderRow — label + value readout over a real native slider (Paper nodes
 * 12E-0 / DR-0: Velocity, Gate). Uses @expo/ui's community Slider drop-in
 * (SwiftUI-backed): a native control needs no gesture arbitration against the
 * parent scroll view, and the monochrome look comes from tint props — no
 * hand-rolled PanResponder/track math.
 */
import { Slider } from '@expo/ui/community/slider';
import { StyleSheet, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';
import { AppText } from '@/components/ui';

export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the trailing value readout (defaults to the raw number). */
  formatValue?: (value: number) => string;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
}: SliderRowProps) {
  // SwiftUI's Slider asserts on an EMPTY range (min == max) — at Steps = 1
  // the rotate sliders got 0…0 and crash-looped the sheet (TestFlight 1.2.0
  // (6)). Give the native control a non-empty range and disable it instead.
  const empty = max <= min;
  const safeMax = empty ? min + step : max;
  return (
    <View style={[styles.row, empty && styles.rowDisabled]}>
      <View style={styles.head}>
        <AppText style={styles.label}>{label}</AppText>
        <AppText style={styles.value}>{formatValue ? formatValue(value) : String(value)}</AppText>
      </View>
      <Slider
        value={value}
        minimumValue={min}
        maximumValue={safeMax}
        step={step}
        disabled={empty}
        minimumTrackTintColor="#EBEBEB"
        maximumTrackTintColor={color.surface2}
        thumbTintColor={color.label}
        onValueChange={(v) => onChange(Math.round(v / step) * step)}
        style={styles.slider}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs },
  rowDisabled: { opacity: 0.4 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: font.text, fontWeight: '500', fontSize: 14, lineHeight: 18, color: color.label25 },
  value: { fontFamily: font.text, fontWeight: '600', fontSize: 14, lineHeight: 18, color: color.label },
  slider: { height: 28 },
});
