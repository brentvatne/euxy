/**
 * Segmented control — custom StyleSheet build (NOT @expo/ui).
 *
 * Why custom: the universal `@expo/ui` Picker only offers `menu`/`wheel`, and
 * the iOS-only SwiftUI segmented Picker renders system chrome that clashes with
 * the monochrome OP-XY aesthetic. A custom control gives pixel-level control and
 * works uniformly across platforms. Used for Lanes/Overview, resolution, op, etc.
 *
 * Active segment is a WHITE pill with black text (Paper MC-0 / 2AH-0 — white is
 * the app's only "active" color). `size="compact"` is the self-sizing variant
 * used inside grouped-form cells (the Jam/Record clock toggle).
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { haptics } from '@/lib/shims';
import { color, HIT_TARGET, radius, space } from '@/theme/tokens';
import { lightDecay } from './led';
import { AppText } from './text';

export interface SegmentedOption<T extends string> {
  label: string;
  value: T;
}

export interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** `regular` fills its row (flex segments); `compact` hugs its content. */
  size?: 'regular' | 'compact';
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'regular',
}: SegmentedProps<T>) {
  const compact = size === 'compact';
  return (
    <View style={[styles.track, compact && styles.trackCompact]}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <Pressable
            key={opt.value}
            onPress={() => {
              // Tick only on an actual change — re-tapping the active
              // segment is a no-op and should feel like one.
              if (!active) haptics.selection();
              onChange(opt.value);
            }}
            style={compact ? styles.segmentCompact : styles.segment}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            {/* The inactive label is always the base layer; the ACTIVE pill —
                white fill plus its black label — is a light that mounts over it
                instantly and decays out with the app's phosphor tail when
                selection moves on. Fill and label fade as ONE layer, so the
                contrast between them is never mid-transition. */}
            <AppText variant="footnote" style={styles.textInactive}>
              {opt.label}
            </AppText>
            {active ? (
              <Animated.View
                pointerEvents="none"
                exiting={lightDecay}
                style={[
                  StyleSheet.absoluteFill,
                  styles.activePill,
                  styles.segmentActive,
                  { borderRadius: compact ? 6 : radius.control - 2 },
                ]}
              >
                <AppText variant="footnote" style={styles.textActive}>
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
    flexDirection: 'row',
    backgroundColor: color.surface3,
    borderRadius: radius.control,
    padding: 2,
    gap: 2,
  },
  trackCompact: {
    alignSelf: 'flex-start',
    backgroundColor: color.surface2,
    borderRadius: 8,
  },
  segment: {
    flex: 1,
    minHeight: HIT_TARGET - space.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
    borderRadius: radius.control - 2,
  },
  segmentCompact: {
    paddingVertical: 5,
    paddingHorizontal: 14,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  segmentActive: { backgroundColor: color.label },
  activePill: { alignItems: 'center', justifyContent: 'center' },
  textActive: { color: color.ground, fontWeight: '700' },
  textInactive: { color: color.label25, fontWeight: '600' },
});
