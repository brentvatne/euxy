/**
 * Segmented control — custom StyleSheet build (NOT @expo/ui).
 *
 * Why custom: the universal `@expo/ui` Picker only offers `menu`/`wheel`, and
 * the iOS-only SwiftUI segmented Picker renders system chrome that clashes with
 * the monochrome OP-XY aesthetic. A custom control gives pixel-level control and
 * works uniformly across platforms. Used for Lanes/Overview, resolution, op, etc.
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { color, HIT_TARGET, radius, space } from '@/theme/tokens';
import { AppText } from './text';

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Segmented<T extends string>({ options, value, onChange }: SegmentedProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <AppText variant="footnote" tone={active ? 'primary' : 'secondary'}>
              {opt.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: color.surface3,
    borderRadius: radius.control,
    padding: 2,
    gap: 2,
  },
  segment: {
    flex: 1,
    minHeight: HIT_TARGET - space.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.control - 2,
  },
  segmentActive: { backgroundColor: color.surface4 },
});
