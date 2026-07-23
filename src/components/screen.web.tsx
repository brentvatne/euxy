/**
 * WEB — bare-minimum MIDI connection tester.
 *
 * Web is not the product (iOS is); this screen exists only to verify the MIDI
 * link to the OP-XY over USB-C in a Chromium/Firefox desktop browser: enable
 * Web MIDI, pick the output, send notes, and watch traffic both directions.
 */
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { generator } from '@/core/euclid';
import { createMidiPort } from '@/midi/port';
import type { InboundEvent, MidiDevice } from '@/midi/types';
import { color, font, radius, space } from '@/theme/tokens';

const describe = (e: InboundEvent) =>
  e.type === 'noteon'
    ? `note on ${e.note} v${e.velocity} ch${e.channel + 1}`
    : e.type === 'noteoff'
      ? `note off ${e.note} ch${e.channel + 1}`
      : e.type === 'songpos'
        ? `songpos ${e.position}`
        : e.type;

const PATTERN = generator(4, 16, 0);

export default function ScreenWeb() {
  const midi = useMemo(() => createMidiPort(), []);
  const supported = useMemo(() => midi.isSupported(), [midi]);

  const [enabled, setEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outputs, setOutputs] = useState<MidiDevice[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const push = (line: string) => setLog((prev) => [line, ...prev].slice(0, 40));

  const refresh = () => {
    const outs = midi.listOutputs();
    setOutputs(outs);
    setSelected((cur) => cur ?? outs[0]?.id ?? null);
  };

  const enable = async () => {
    try {
      await midi.init();
      setEnabled(true);
      setError(null);
      refresh();
      midi.onStateChange(refresh);
      midi.onInbound((e) => push(`← ${describe(e)}`));
    } catch (err: any) {
      setError(err?.message ?? 'MIDI permission denied');
    }
  };

  const pick = (id: string) => {
    midi.selectOutput(id);
    setSelected(id);
  };

  const sendTest = () => {
    midi.sendNoteOn(36, 100, 0);
    push('→ note on 36 v100 ch1');
    setTimeout(() => {
      midi.sendNoteOff(36, 0);
      push('→ note off 36 ch1');
    }, 160);
  };

  useEffect(() => {
    if (!playing) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let i = 0;
    const id = setInterval(() => {
      const step = i % 16;
      i += 1;
      if (PATTERN[step]) {
        midi.sendNoteOn(36, 100, 0);
        push(`→ note on 36 (step ${step + 1})`);
        timers.push(setTimeout(() => midi.sendNoteOff(36, 0), 120));
      }
    }, 60000 / 120 / 4); // 120 BPM, 1/16
    return () => {
      clearInterval(id);
      timers.forEach(clearTimeout);
    };
  }, [playing, midi]);

  const togglePlay = () => {
    if (playing) {
      midi.allNotesOff(0);
      push('→ all notes off');
      setPlaying(false);
    } else {
      setPlaying(true);
    }
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.kicker}>WEB · CONNECTION CHECK</Text>
        <Text style={styles.title}>euxy · MIDI test</Text>
      </View>

      {!supported ? (
        <View style={styles.warn}>
          <Text style={styles.warnText}>
            Web MIDI isn’t available in this browser. Use Chrome, Edge, or Brave on desktop over
            http(s)://localhost. (Safari and iOS don’t support Web MIDI.)
          </Text>
        </View>
      ) : !enabled ? (
        <View style={{ gap: space.sm }}>
          <Pressable style={styles.primaryBtn} onPress={enable}>
            <Text style={styles.primaryBtnLabel}>Enable MIDI</Text>
          </Pressable>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      ) : (
        <>
          {/* Status */}
          <View style={styles.statusRow}>
            <View style={[styles.dot, { backgroundColor: color.connected }]} />
            <Text style={styles.statusText}>
              MIDI enabled · {outputs.length} output{outputs.length === 1 ? '' : 's'}
            </Text>
          </View>

          {/* Output picker */}
          <View style={styles.group}>
            <Text style={styles.groupLabel}>OUTPUT</Text>
            {outputs.length === 0 ? (
              <Text style={styles.muted}>No outputs found — connect the OP–XY over USB-C.</Text>
            ) : (
              outputs.map((o) => (
                <Pressable key={o.id} style={styles.deviceRow} onPress={() => pick(o.id)}>
                  <Text style={styles.deviceName}>{o.name}</Text>
                  {o.id === selected ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              ))
            )}
          </View>

          {/* Actions */}
          <View style={styles.actions}>
            <Pressable style={styles.secondaryBtn} onPress={sendTest}>
              <Text style={styles.secondaryLabel}>Send test note</Text>
            </Pressable>
            <Pressable
              style={[styles.secondaryBtn, playing && styles.activeBtn]}
              onPress={togglePlay}>
              <Text style={[styles.secondaryLabel, playing && styles.activeLabel]}>
                {playing ? 'Stop' : 'Play E(4,16)'}
              </Text>
            </Pressable>
          </View>

          {/* Log */}
          <View style={styles.logBox}>
            <Text style={styles.logTitle}>MIDI ACTIVITY</Text>
            {log.length === 0 ? (
              <Text style={styles.logLine}>— idle · send a note or press play —</Text>
            ) : (
              log.map((line, idx) => (
                <Text key={idx} style={styles.logLine}>
                  {line}
                </Text>
              ))
            )}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.lg, gap: space.lg, maxWidth: 520, width: '100%', alignSelf: 'center' },
  header: { gap: 2, paddingTop: space.xl },
  kicker: { fontFamily: font.text, fontSize: 12, fontWeight: '600', letterSpacing: 1, color: color.label3 },
  title: { fontFamily: font.display, fontSize: 24, fontWeight: '700', color: color.label },

  warn: { backgroundColor: color.surface, borderRadius: radius.cell, padding: space.lg },
  warnText: { fontFamily: font.text, fontSize: 14, lineHeight: 20, color: color.label2 },
  errorText: { fontFamily: font.text, fontSize: 13, color: color.danger },

  primaryBtn: { backgroundColor: color.label, borderRadius: radius.control, paddingVertical: 14, alignItems: 'center' },
  primaryBtnLabel: { fontFamily: font.text, fontSize: 16, fontWeight: '600', color: color.ground },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 999 },
  statusText: { fontFamily: font.text, fontSize: 14, color: color.label2 },

  group: { backgroundColor: color.surface, borderRadius: radius.cell, padding: space.md, gap: 4 },
  groupLabel: { fontFamily: font.text, fontSize: 11, fontWeight: '700', letterSpacing: 0.5, color: color.label4, marginBottom: 4 },
  deviceRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 11, paddingHorizontal: 8, borderRadius: 8 },
  deviceName: { fontFamily: font.text, fontSize: 16, color: color.label },
  check: { fontFamily: font.text, fontSize: 16, color: color.label },
  muted: { fontFamily: font.text, fontSize: 14, color: color.label3, padding: 8 },

  actions: { flexDirection: 'row', gap: space.sm },
  secondaryBtn: { flex: 1, backgroundColor: color.surface2, borderRadius: radius.control, paddingVertical: 13, alignItems: 'center' },
  secondaryLabel: { fontFamily: font.text, fontSize: 15, fontWeight: '600', color: color.label },
  activeBtn: { backgroundColor: color.label },
  activeLabel: { color: color.ground },

  logBox: { backgroundColor: color.displayBg, borderRadius: radius.cell, padding: space.lg, gap: 4, minHeight: 160 },
  logTitle: { fontFamily: font.mono, fontSize: 11, color: color.label4 },
  logLine: { fontFamily: font.mono, fontSize: 12, color: color.label3 },
});
