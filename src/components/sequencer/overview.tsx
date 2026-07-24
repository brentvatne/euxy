/**
 * Overview (Paper 2CD-0) — the polymeter at a glance: "N lanes" + the LCM of
 * all lane lengths (where they re-align), then one compact fit-to-width strip
 * per lane. Rows never scroll — blocks just shrink (even at 32+ steps).
 */
import { StyleSheet, View } from 'react-native';

import { midiNoteName } from '@/core/note';
import type { Lane } from '@/state/types';
import { color, font, ramp } from '@/theme/tokens';
import { AppText } from '@/components/ui';
import { StepStrip } from './step-strip';

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
const lcm = (a: number, b: number) => (a === 0 || b === 0 ? 0 : (a * b) / gcd(a, b));

export function Overview({ lanes }: { lanes: Lane[] }) {
  const alignAt = lanes.reduce((acc, l) => lcm(acc, l.length), 1);
  return (
    <View>
      <View style={styles.head}>
        <AppText style={styles.headCount}>
          {lanes.length} lane{lanes.length === 1 ? '' : 's'}
        </AppText>
        <AppText style={styles.headLcm} mono>
          LCM {alignAt}
        </AppText>
      </View>
      {lanes.map((lane) => (
        <View key={lane.id} style={styles.row}>
          <View style={styles.nameCol}>
            <AppText style={styles.name} numberOfLines={1}>
              {lane.name ?? midiNoteName(lane.note)}
            </AppText>
            <AppText style={styles.sub} numberOfLines={1}>
              {midiNoteName(lane.note)} · {lane.length}
            </AppText>
          </View>
          <StepStrip lane={lane} variant="overview" />
        </View>
      ))}
    </View>
  );
}

// Exact values from Paper 2CD-0: head pt 10 / pb 12 / px 16; rows py 9 / px 16 /
// gap 12, name col 72 wide, top border #16161D.
const styles = StyleSheet.create({
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  headCount: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: color.label },
  headLcm: { fontSize: 12, lineHeight: 16, color: color.label3 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: ramp[7],
  },
  nameCol: { width: 72, flexShrink: 0, gap: 1 },
  name: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: color.label },
  sub: { fontFamily: font.text, fontWeight: '500', fontSize: 10, lineHeight: 12, color: color.label3 },
});
