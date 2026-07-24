/**
 * ViewToggle — the Steps | Graph switch at the top of the Lane Editor (Paper
 * node 19E-0). Distinct from the shared white-active `Segmented`: this one uses
 * the muted gray active fill (#48484A on #2C2C2E) and each segment carries a
 * 15px icon (step bars / pixel-ring) beside its label. Exact values from Paper.
 */
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';

import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';

export type EditorView = 'steps' | 'graph';

function IconSteps({ tint }: { tint: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Rect x={3} y={9} width={3.5} height={6} rx={1} fill={tint} />
      <Rect x={8.5} y={9} width={3.5} height={6} rx={1} fill={tint} />
      <Rect x={14} y={9} width={3.5} height={6} rx={1} fill={tint} />
      <Rect x={19.5} y={9} width={1.5} height={6} rx={0.7} fill={tint} />
    </Svg>
  );
}

function IconGraph({ tint }: { tint: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24">
      <Circle cx={12} cy={12} r={9} fill="none" stroke={tint} strokeWidth={2} />
      <Circle cx={12} cy={3.5} r={2} fill={tint} />
      <Circle cx={20.5} cy={12} r={2} fill={tint} />
    </Svg>
  );
}

export function ViewToggle({ value, onChange }: { value: EditorView; onChange: (v: EditorView) => void }) {
  const segs: { v: EditorView; label: string; Icon: typeof IconSteps }[] = [
    { v: 'steps', label: 'Steps', Icon: IconSteps },
    { v: 'graph', label: 'Graph', Icon: IconGraph },
  ];
  return (
    <View style={styles.track}>
      {segs.map(({ v, label, Icon }) => {
        const active = v === value;
        const tint = active ? '#FFFFFF' : color.label25;
        return (
          <Pressable
            key={v}
            onPress={() => onChange(v)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Icon tint={tint} />
            <AppText style={[styles.label, { color: tint }]}>{label}</AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: color.surface2 },
  segment: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    borderRadius: 7,
  },
  segmentActive: { backgroundColor: color.surface4 },
  label: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16 },
});
