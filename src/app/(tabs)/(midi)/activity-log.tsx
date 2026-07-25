/**
 * Activity Log — pushed from the MIDI tab's Diagnostics section. Shows the raw
 * inbound/outbound MIDI byte stream (hex + annotation) for debugging. High-rate
 * clock (0xF8) and active-sensing (0xFE) are filtered from the list; incoming
 * clock instead lights a "Clock" indicator in the header. A test-note button
 * lets the web tester verify the output link.
 */
import { Stack } from 'expo-router/stack';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { color, radius, space } from '@/theme/tokens';
import { GRAY } from '@/components/midi/components';
import { clearLog, sendTestNote, useMidiRuntime } from '@/components/midi/runtime';

function ClockIndicator({ active }: { active: boolean }) {
  return (
    <View style={styles.clockTag}>
      <View style={[styles.clockDot, { backgroundColor: active ? color.playhead : color.label4, opacity: active ? 1 : 0.4 }]} />
      <AppText mono style={[styles.clockText, { color: active ? color.playhead : color.label4 }]}>
        Clock
      </AppText>
    </View>
  );
}

export default function ActivityLogScreen() {
  const rt = useMidiRuntime();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Activity Log',
          headerLargeTitle: false,
          headerRight: () => <ClockIndicator active={rt.clockActive} />,
        }}
      />
      <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
        <View style={styles.actions}>
          <Pressable onPress={() => sendTestNote()} accessibilityRole="button" style={({ pressed }) => [styles.btn, pressed && styles.btnPressed]}>
            <AppText style={styles.btnText}>Send test note</AppText>
          </Pressable>
          <Pressable onPress={clearLog} accessibilityRole="button" style={({ pressed }) => [styles.btnGhost, pressed && styles.btnPressed]}>
            <AppText style={styles.btnGhostText}>Clear</AppText>
          </Pressable>
        </View>

        <View style={styles.logBox}>
          {rt.log.length === 0 ? (
            <AppText mono style={[styles.line, styles.idle]}>
              — no MIDI traffic —
            </AppText>
          ) : (
            rt.log.map((l) => (
              <AppText key={l.id} mono numberOfLines={1} style={[styles.line, l.dir === 'out' ? styles.out : styles.in]}>
                {l.dir === 'out' ? '→' : '←'} {l.hex} {l.label}
              </AppText>
            ))
          )}
        </View>

        <AppText style={styles.hint}>
          Clock (F8) and active-sensing (FE) are filtered; incoming clock lights the header indicator.
        </AppText>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.lg, gap: space.md },

  actions: { flexDirection: 'row', gap: space.sm },
  btn: { flex: 1, backgroundColor: color.surface2, borderRadius: radius.control, paddingVertical: 12, alignItems: 'center' },
  btnText: { fontSize: 15, fontWeight: '600', color: color.label },
  btnGhost: { paddingHorizontal: space.lg, borderRadius: radius.control, alignItems: 'center', justifyContent: 'center', backgroundColor: color.surface },
  btnGhostText: { fontSize: 15, fontWeight: '600', color: GRAY },
  btnPressed: { opacity: 0.6 },

  logBox: { backgroundColor: color.displayBg, borderRadius: radius.cell, padding: space.lg, gap: 3, minHeight: 220 },
  line: { fontSize: 12, lineHeight: 18 },
  out: { color: color.label },
  in: { color: color.label3 },
  idle: { color: color.label4 },

  // The header wraps this view in the iOS 26 glass pill — the horizontal
  // padding is what gives the pill its side air (without it the text hugs
  // the capsule edge).
  clockTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
    paddingHorizontal: 12,
  },
  clockDot: { width: 7, height: 7, borderRadius: radius.chip },
  clockText: { fontSize: 12, lineHeight: 16 },

  hint: { fontSize: 12, lineHeight: 16, color: color.label4, paddingHorizontal: space.xs },
});
