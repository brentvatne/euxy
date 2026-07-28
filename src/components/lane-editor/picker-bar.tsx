/**
 * PickerBar — segmented control with the *solid white* selected style used by
 * the OP (OR/AND/XOR/A>B) and RESOLUTION rows in Paper nodes 12E-0 / DR-0
 * (active segment = #F6F4F4 fill + black label). Local to the Lane Editor: the
 * shared `Segmented` primitive uses a gray (#48484A) selected fill, which is the
 * Steps|Graph toggle style, not this one.
 */
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';
import { lightDecay } from '@/components/ui/led';

export interface PickerBarOption<T extends string> {
  label: string;
  value: T;
}

export interface PickerBarProps<T extends string> {
  options: PickerBarOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Label font size (12 for OP, 13 for Resolution). */
  size?: number;
}

export function PickerBar<T extends string>({
  options,
  value,
  onChange,
  size = 13,
}: PickerBarProps<T>) {
  return (
    <View style={styles.track}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => onChange(opt.value)}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {/* Same light hand-off as the shared Segmented: the white pill and
                its black label are one layer that decays when selection moves. */}
            <AppText style={[styles.label, { fontSize: size }, styles.labelInactive]}>
              {opt.label}
            </AppText>
            {active ? (
              <Animated.View
                pointerEvents="none"
                exiting={lightDecay}
                style={[StyleSheet.absoluteFill, styles.activePill, styles.segmentActive]}
              >
                <AppText style={[styles.label, { fontSize: size }, styles.labelActive]}>
                  {opt.label}
                </AppText>
              </Animated.View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: color.surface2,
    borderRadius: 9,
    padding: 2,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 7,
  },
  segmentActive: { backgroundColor: color.label },
  activePill: { alignItems: 'center', justifyContent: 'center', borderRadius: 7 },
  label: { fontFamily: font.text, lineHeight: 16, textAlign: 'center' },
  labelActive: { color: color.ground, fontWeight: '700' },
  labelInactive: { color: color.label25, fontWeight: '600' },
});
