/**
 * The IDAM connection steps — Paper board "Web · Connect diagram —
 * concepts", concept B (numbered LED step rail; Brent's pick 2026-07-25).
 */
import { StyleSheet, Text, View } from 'react-native';
import { color } from '@/theme/tokens';
import { MONO, SANS } from './ui';

const STEPS = [
  'Plug the iPhone into the Mac with USB',
  'Audio MIDI Setup → select the iPhone → Enable',
  'In euxy: MIDI tab → output → “IDAM MIDI Host”',
  'Play — this page is the speaker',
];

export function ConnectSteps() {
  return (
    <View style={styles.card}>
      {STEPS.map((step, i) => {
        const last = i === STEPS.length - 1;
        return (
          <View key={i} style={styles.step}>
            <View style={[styles.digit, last && styles.digitLit]}>
              <Text style={[styles.digitLabel, last && styles.digitLabelLit]}>{i + 1}</Text>
            </View>
            <Text style={[styles.stepLabel, last && styles.stepLabelLit]}>{step}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.displayBg,
    borderRadius: 12,
    padding: 22,
    gap: 10,
  },
  step: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  digit: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  digitLit: { backgroundColor: color.label },
  digitLabel: { fontFamily: MONO, fontSize: 14, fontWeight: '700', color: color.label },
  digitLabelLit: { color: '#101014' },
  stepLabel: { fontFamily: SANS, fontSize: 16, lineHeight: 23, color: color.label2, flexShrink: 1 },
  stepLabelLit: { color: color.label },
});
