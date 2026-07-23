/**
 * v1 · Proof of Concept — single Euclidean lane.
 *
 * Minimal first pass: one screen, real Euclidean engine, MIDI stubbed (swap for
 * Web MIDI / CoreMIDI later — the UI only touches the MidiPort interface).
 * OP-XY monochrome palette from theme/tokens.
 *
 * NOTE (perf): the playhead here advances via a JS interval + setState. That's
 * fine for a single-lane PoC; the target build moves the tick off the render
 * path and animates the playhead on the UI thread (see docs/design/README.md).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { generator } from '@/core/euclid';
import { createStubMidiPort } from '@/midi/stub';
import { color, font, radius, space, timing } from '@/theme/tokens';

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

const RESOLUTIONS = ['1/4', '1/8', '1/8T', '1/16', '1/16T', '1/32'] as const;
type Resolution = (typeof RESOLUTIONS)[number];
const STEPS_PER_BEAT: Record<Resolution, number> = {
  '1/4': 1,
  '1/8': 2,
  '1/8T': 3,
  '1/16': 4,
  '1/16T': 6,
  '1/32': 8,
};

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const hex = (n: number) => n.toString(16).toUpperCase().padStart(2, '0');

export default function Index() {
  const insets = useSafeAreaInsets();
  const midi = useMemo(() => createStubMidiPort(), []);

  const [midiEnabled, setMidiEnabled] = useState(false);
  const [clockMode, setClockMode] = useState<'jam' | 'record'>('jam');
  const [bpm, setBpm] = useState(120);
  const [playing, setPlaying] = useState(false);

  const [note, setNote] = useState(36); // C1
  const [steps, setSteps] = useState(16);
  const [hits, setHits] = useState(4);
  const [rotation, setRotation] = useState(0);
  const [resolution, setResolution] = useState<Resolution>('1/16');
  const [velocity, setVelocity] = useState(104);
  const [gate, setGate] = useState<number>(timing.defaultGateMs);

  const [step, setStep] = useState(0);
  const [log, setLog] = useState<string[]>([]);

  const pattern = useMemo(() => generator(hits, steps, rotation), [hits, steps, rotation]);

  // Keep hits within the current step count when steps shrinks.
  useEffect(() => {
    setHits((h) => Math.min(h, steps));
  }, [steps]);

  // Live activity log fed by the stub's raw output.
  useEffect(() => {
    return midi.onRaw((bytes) => {
      const line = bytes.map(hex).join(' ');
      setLog((prev) => [line, ...prev].slice(0, 24));
    });
  }, [midi]);

  // Playhead / note scheduling (PoC-grade; see file header note).
  useEffect(() => {
    if (!playing) return;
    const intervalMs = 60000 / bpm / STEPS_PER_BEAT[resolution];
    const gateTimers: ReturnType<typeof setTimeout>[] = [];
    const id = setInterval(() => {
      setStep((s) => {
        const next = (s + 1) % steps;
        const pat = generator(hits, steps, rotation);
        if (midiEnabled && pat[next]) {
          midi.sendNoteOn(note, velocity, 0);
          gateTimers.push(setTimeout(() => midi.sendNoteOff(note, 0), gate));
        }
        return next;
      });
    }, intervalMs);
    return () => {
      clearInterval(id);
      gateTimers.forEach(clearTimeout);
    };
  }, [playing, bpm, resolution, steps, hits, rotation, note, velocity, gate, midiEnabled, midi]);

  const enableMidi = () => {
    void midi.init();
    setMidiEnabled(true);
  };

  const togglePlay = () => {
    if (playing) {
      midi.sendStop();
      midi.allNotesOff(0);
      setPlaying(false);
    } else {
      setStep(0);
      if (clockMode === 'jam') midi.sendStart();
      setPlaying(true);
    }
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.kicker}>PROOF OF CONCEPT</Text>
        <Text style={styles.title}>euxy · single lane</Text>
      </View>

      {/* MIDI */}
      {!midiEnabled ? (
        <Pressable style={styles.primaryBtn} onPress={enableMidi}>
          <Text style={styles.primaryBtnLabel}>Enable MIDI</Text>
        </Pressable>
      ) : (
        <View style={styles.group}>
          <Row label="Output" value="OP–XY" />
          <View style={styles.sep} />
          <Row label="Input" value="OP–XY" />
        </View>
      )}

      {/* Transport */}
      <View style={styles.transport}>
        <Segmented
          options={['Jam', 'Record']}
          index={clockMode === 'jam' ? 0 : 1}
          onChange={(i) => setClockMode(i === 0 ? 'jam' : 'record')}
        />
        <View style={styles.bpmBox}>
          <Text style={styles.bpmLabel}>BPM</Text>
          <Pressable hitSlop={12} onPress={() => setBpm((b) => clamp(b - 1, 40, 240))}>
            <Text style={styles.stepGlyph}>–</Text>
          </Pressable>
          <Text style={styles.bpmValue}>{bpm}</Text>
          <Pressable hitSlop={12} onPress={() => setBpm((b) => clamp(b + 1, 40, 240))}>
            <Text style={styles.stepGlyphActive}>+</Text>
          </Pressable>
        </View>
        <Pressable style={[styles.playBtn, playing && styles.playBtnActive]} onPress={togglePlay}>
          <Text style={[styles.playLabel, playing && styles.playLabelActive]}>
            {playing ? 'Stop' : 'Play'}
          </Text>
        </Pressable>
      </View>

      {/* Lane */}
      <View style={styles.laneCard}>
        <View style={styles.laneHead}>
          <Text style={styles.laneTitle}>Lane 1</Text>
          <View style={styles.noteRow}>
            <Text style={styles.noteLabel}>Note {noteName(note)}</Text>
            <Pressable style={styles.listenBtn} onPress={() => setNote((n) => clamp(n + 1, 0, 108))}>
              <Text style={styles.listenLabel}>Listen</Text>
            </Pressable>
          </View>
        </View>

        {/* Pattern dots */}
        <View style={styles.dots}>
          {pattern.map((hit, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                hit ? styles.dotHit : styles.dotEmpty,
                i === step && styles.dotPlayhead,
              ]}
            />
          ))}
        </View>

        {/* Params */}
        <View style={styles.params}>
          <Stepper label="Steps" value={steps} onDec={() => setSteps((v) => clamp(v - 1, 1, 64))} onInc={() => setSteps((v) => clamp(v + 1, 1, 64))} />
          <Stepper label="Hits" value={hits} onDec={() => setHits((v) => clamp(v - 1, 0, steps))} onInc={() => setHits((v) => clamp(v + 1, 0, steps))} />
          <Stepper label="Rotation" value={rotation} onDec={() => setRotation((v) => v - 1)} onInc={() => setRotation((v) => v + 1)} />
          <Stepper label="Velocity" value={velocity} onDec={() => setVelocity((v) => clamp(v - 4, 1, 127))} onInc={() => setVelocity((v) => clamp(v + 4, 1, 127))} />
          <Stepper label="Gate" value={`${gate} ms`} onDec={() => setGate((v) => clamp(v - 5, 5, 500))} onInc={() => setGate((v) => clamp(v + 5, 5, 500))} />
        </View>

        {/* Resolution */}
        <View style={styles.resRow}>
          {RESOLUTIONS.map((r) => (
            <Pressable
              key={r}
              style={[styles.resPill, r === resolution && styles.resPillActive]}
              onPress={() => setResolution(r)}>
              <Text style={[styles.resLabel, r === resolution && styles.resLabelActive]}>{r}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Activity log */}
      <View style={styles.log}>
        <Text style={styles.logTitle}>MIDI ACTIVITY</Text>
        {log.length === 0 ? (
          <Text style={styles.logLine}>— idle —</Text>
        ) : (
          log.map((line, i) => (
            <Text key={i} style={styles.logLine}>
              → {line}
            </Text>
          ))
        )}
      </View>
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value} ▾</Text>
    </View>
  );
}

function Stepper({
  label,
  value,
  onDec,
  onInc,
}: {
  label: string;
  value: number | string;
  onDec: () => void;
  onInc: () => void;
}) {
  return (
    <View style={styles.stepperRow}>
      <Text style={styles.stepperLabel}>{label}</Text>
      <View style={styles.stepperCtrls}>
        <Pressable hitSlop={10} onPress={onDec} style={styles.stepBtn}>
          <Text style={styles.stepGlyph}>–</Text>
        </Pressable>
        <Text style={styles.stepperValue}>{value}</Text>
        <Pressable hitSlop={10} onPress={onInc} style={styles.stepBtn}>
          <Text style={styles.stepGlyphActive}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Segmented({
  options,
  index,
  onChange,
}: {
  options: string[];
  index: number;
  onChange: (i: number) => void;
}) {
  return (
    <View style={styles.segmented}>
      {options.map((opt, i) => (
        <Pressable
          key={opt}
          style={[styles.segment, i === index && styles.segmentActive]}
          onPress={() => onChange(i)}>
          <Text style={[styles.segmentLabel, i === index && styles.segmentLabelActive]}>{opt}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { padding: space.lg, paddingBottom: 48, gap: space.lg },

  header: { gap: 2 },
  kicker: {
    fontFamily: font.text,
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 1,
    color: color.label3,
  },
  title: { fontFamily: font.display, fontSize: 24, fontWeight: '700', color: color.label },

  primaryBtn: {
    backgroundColor: color.label,
    borderRadius: radius.control,
    paddingVertical: 14,
    alignItems: 'center',
  },
  primaryBtnLabel: { fontFamily: font.text, fontSize: 16, fontWeight: '600', color: color.ground },

  group: { backgroundColor: color.surface, borderRadius: radius.cell, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: space.lg,
  },
  rowLabel: { fontFamily: font.text, fontSize: 16, color: color.label3 },
  rowValue: { fontFamily: font.text, fontSize: 16, color: color.label },
  sep: { height: 1, backgroundColor: color.ground },

  transport: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  bpmBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface,
    borderRadius: radius.control,
    paddingHorizontal: space.md,
    paddingVertical: 9,
  },
  bpmLabel: { fontFamily: font.text, fontSize: 13, color: color.label3 },
  bpmValue: { fontFamily: font.display, fontSize: 17, fontWeight: '700', color: color.label },

  playBtn: {
    backgroundColor: color.label,
    borderRadius: radius.control,
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  playBtnActive: { backgroundColor: color.surface2 },
  playLabel: { fontFamily: font.text, fontSize: 14, fontWeight: '600', color: color.ground },
  playLabelActive: { color: color.label },

  laneCard: { backgroundColor: color.surface, borderRadius: radius.cell, padding: space.lg, gap: space.md },
  laneHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  laneTitle: { fontFamily: font.text, fontSize: 15, fontWeight: '600', color: color.label },
  noteRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  noteLabel: { fontFamily: font.text, fontSize: 14, color: color.label3 },
  listenBtn: {
    backgroundColor: color.label,
    borderRadius: 6,
    paddingHorizontal: 11,
    paddingVertical: 5,
  },
  listenLabel: { fontFamily: font.text, fontSize: 13, fontWeight: '700', color: color.ground },

  dots: { flexDirection: 'row', gap: 4 },
  dot: { flex: 1, height: 22, borderRadius: radius.step },
  dotHit: { backgroundColor: color.stepHit },
  dotEmpty: { backgroundColor: color.stepEmpty },
  dotPlayhead: { borderWidth: 1.5, borderColor: color.playhead },

  params: { gap: 9 },
  stepperRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stepperLabel: { fontFamily: font.text, fontSize: 14, color: color.label3 },
  stepperCtrls: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: { minWidth: 20, alignItems: 'center' },
  stepperValue: {
    fontFamily: font.text,
    fontSize: 15,
    fontWeight: '600',
    color: color.label,
    minWidth: 44,
    textAlign: 'center',
  },
  stepGlyph: { fontFamily: font.text, fontSize: 20, color: color.label3 },
  stepGlyphActive: { fontFamily: font.text, fontSize: 20, color: color.label },

  resRow: { flexDirection: 'row', gap: 6 },
  resPill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 7,
    borderRadius: 7,
    backgroundColor: color.surface2,
  },
  resPillActive: { backgroundColor: color.label },
  resLabel: { fontFamily: font.text, fontSize: 12, fontWeight: '600', color: color.label3 },
  resLabelActive: { color: color.ground },

  segmented: { flexDirection: 'row', padding: 2, backgroundColor: color.surface, borderRadius: 8 },
  segment: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 6 },
  segmentActive: { backgroundColor: color.label },
  segmentLabel: { fontFamily: font.text, fontSize: 13, fontWeight: '600', color: color.label3 },
  segmentLabelActive: { color: color.ground },

  log: {
    backgroundColor: color.displayBg,
    borderRadius: radius.cell,
    padding: space.lg,
    gap: 4,
  },
  logTitle: { fontFamily: font.mono, fontSize: 11, color: color.label4 },
  logLine: { fontFamily: font.mono, fontSize: 11, color: color.label3 },
});
