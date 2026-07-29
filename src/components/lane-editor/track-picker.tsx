/**
 * TrackPicker — the OP-XY's 8 tracks as one row of taps, replacing the Track ·
 * Channel cell's tap-to-cycle handler. Cycling only ever moved in ONE
 * direction and wrapped at 8, so stepping *down* a track (3 → 2) cost seven
 * taps and a full lap past every other track; picking the track directly is one
 * tap in either direction, and the row doubles as a readout of where the lane
 * sits among the eight.
 *
 * Visual language is the local `PickerBar`'s (solid white selected pill, black
 * label, phosphor `lightDecay` hand-off as the selection moves) — the OP row
 * two sections up looks the same, so the sheet reads as one control family.
 * Eight segments across the sheet are ~40pt wide, so segments carry the full
 * HIT_TARGET height rather than PickerBar's compact 30pt.
 *
 * A channel outside 0–7 (inbound Listen capture can set 8–15) selects nothing
 * here and stays visible in the cell's own readout — the next tap lands on a
 * real track instead of folding around.
 */
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { color, font, HIT_TARGET } from '@/theme/tokens';
import { AppText } from '@/components/ui';
import { lightDecay } from '@/components/ui/led';

/** OP-XY audio tracks. MIDI channel n drives track n + 1. */
export const TRACK_COUNT = 8;

export interface TrackPickerProps {
  /** 0-based MIDI channel of the lane. */
  channel: number;
  onChange: (channel: number) => void;
}

export function TrackPicker({ channel, onChange }: TrackPickerProps) {
  return (
    <View style={styles.track}>
      {Array.from({ length: TRACK_COUNT }, (_, i) => {
        const active = i === channel;
        return (
          <Pressable
            key={i}
            onPress={() => {
              if (active) return;
              onChange(i);
            }}
            style={styles.segment}
            accessibilityRole="button"
            accessibilityLabel={`Track ${i + 1}`}
            accessibilityState={{ selected: active }}
          >
            <AppText style={[styles.label, styles.labelInactive]}>{i + 1}</AppText>
            {active ? (
              <Animated.View
                pointerEvents="none"
                exiting={lightDecay}
                style={[StyleSheet.absoluteFill, styles.activePill]}
              >
                <AppText style={[styles.label, styles.labelActive]}>{i + 1}</AppText>
              </Animated.View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // surface4 (not PickerBar's surface2): this row lives INSIDE the disclosure
  // panel a grouped cell expands into, which is already surface3 — the
  // segmented track has to sit one step above its panel.
  track: {
    flexDirection: 'row',
    backgroundColor: color.surface4,
    borderRadius: 9,
    padding: 2,
  },
  segment: {
    flex: 1,
    height: HIT_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
  },
  activePill: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 7,
    backgroundColor: color.label,
  },
  label: { fontFamily: font.text, fontSize: 15, lineHeight: 20, textAlign: 'center' },
  labelActive: { color: color.ground, fontWeight: '700' },
  labelInactive: { color: color.label25, fontWeight: '600' },
});
