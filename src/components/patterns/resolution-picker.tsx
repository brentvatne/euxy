/**
 * ResolutionPicker — the base-resolution segmented control on the New Pattern
 * sheet. Distinct from the shared `Segmented`: per the Paper reference this one
 * uses a bright white active pill with black text (matching the OP-XY "selected"
 * treatment), so it is built locally rather than reusing the gray-active shared
 * primitive. Values are tick counts (24 PPQN).
 */
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui';
import { color, HIT_TARGET, radius, space } from '@/theme/tokens';
import { RESOLUTIONS } from './resolution';

export interface ResolutionPickerProps {
  value: number;
  onChange: (ticks: number) => void;
}

export function ResolutionPicker({ value, onChange }: ResolutionPickerProps) {
  return (
    <View style={styles.track}>
      {RESOLUTIONS.map((opt) => {
        const active = opt.ticks === value;
        return (
          <Pressable
            key={opt.ticks}
            onPress={() => onChange(opt.ticks)}
            style={[styles.segment, active && styles.segmentActive]}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <AppText
              variant="footnote"
              style={[styles.label, active ? styles.labelActive : styles.labelIdle]}
            >
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
    backgroundColor: color.surface2,
    borderRadius: radius.control - 1,
    padding: 2,
  },
  segment: {
    flex: 1,
    minHeight: HIT_TARGET - space.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control - 3,
  },
  segmentActive: { backgroundColor: color.label },
  label: { fontWeight: '600' },
  labelIdle: { color: color.label3 },
  labelActive: { color: color.ground, fontWeight: '700' },
});
