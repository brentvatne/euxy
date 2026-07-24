/**
 * MIDI tab (Paper MC-0 connected / 1A8-0 disconnected). Large-title grouped
 * form: Connection · Timing · Diagnostics · Defaults · Panic. This screen is
 * also the entire web experience — it drives the platform `MidiPort` via the
 * shared runtime, so on web it doubles as the minimal MIDI connection tester
 * (enable → pick output/input → watch traffic → panic; send a test note from
 * the Activity-log screen).
 */
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui';
import { IconPanic } from '@/components/ui/icons';
import { useSettings, useTransport } from '@/state/selectors';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';
import { Cell, ClockModeToggle, ConnectionBadge, GRAY, Group, LatencySlider, LogPreview, PushRow, SectionHeader, ValueRow } from './components';
import { IconDevice } from './icons';
import { enableMidi, panic, setLatency, useMidiRuntime } from './runtime';

const LATENCY_MIN = -120;
const LATENCY_MAX = 120;
const fmtLatency = (ms: number) => `${ms > 0 ? '+' : ''}${ms} ms`;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;

export default function MidiScreen() {
  const rt = useMidiRuntime();
  const settings = useSettings();
  const transport = useTransport();
  const setClockMode = useStore((s) => s.setClockMode);
  const lanes = useStore((s) => (s.patterns.find((p) => p.id === s.activePatternId) ?? s.patterns[0]).lanes);

  // Native/stub can enable without a gesture; web requires the Enable-MIDI tap.
  useEffect(() => {
    if (Platform.OS !== 'web' && !rt.enabled) void enableMidi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outName = rt.outputs.find((d) => d.id === settings.outputId)?.name ?? null;
  const inName = rt.inputs.find((d) => d.id === settings.inputId)?.name ?? null;
  const connected = rt.enabled && !!outName;

  const openOutput = () => router.push('/device-picker?kind=output');
  const openInput = () => router.push('/device-picker?kind=input');
  const onConnectionPress = () => {
    if (rt.supported && !rt.enabled) router.push('/enable-midi');
    else openOutput();
  };

  return (
    <ScrollView
      style={styles.root}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
    >
      {/* CONNECTION */}
      <SectionHeader first>Connection</SectionHeader>
      <Group>
        <Cell pos="first" onPress={onConnectionPress}>
          <View style={styles.connLeft}>
            <IconDevice color={color.label} />
            <AppText style={styles.connName}>{connected ? outName : 'No device'}</AppText>
          </View>
          <ConnectionBadge connected={connected} />
        </Cell>
        <ValueRow pos="middle" label="Output" value={connected ? (outName ?? 'None') : 'None'} onPress={openOutput} />
        <ValueRow pos="last" label="Input" value={inName ?? 'None'} onPress={openInput} />
      </Group>

      {/* TIMING */}
      <SectionHeader>Timing</SectionHeader>
      <Group>
        <Cell pos="first">
          <AppText style={styles.rowLabel}>Clock mode</AppText>
          <ClockModeToggle value={transport.clockMode} onChange={setClockMode} />
        </Cell>
        <Cell pos="last" contentStyle={styles.latencyCell}>
          <View style={styles.latencyHead}>
            <AppText style={styles.rowLabel}>Latency offset</AppText>
            <AppText style={styles.latencyValue}>{fmtLatency(settings.latencyOffsetMs)}</AppText>
          </View>
          <LatencySlider value={settings.latencyOffsetMs} min={LATENCY_MIN} max={LATENCY_MAX} onChange={setLatency} />
        </Cell>
      </Group>

      {/* DIAGNOSTICS */}
      <SectionHeader>Diagnostics</SectionHeader>
      <Group>
        <PushRow pos="first" label="Activity log" onPress={() => router.push('/activity-log')} />
        <Cell pos="last" contentStyle={styles.logCell}>
          <LogPreview lines={rt.log.slice(0, 4)} />
        </Cell>
      </Group>

      {/* DEFAULTS — track → channel map */}
      <SectionHeader>Defaults</SectionHeader>
      <Group>
        {lanes.length === 0 ? (
          <Cell pos="single">
            <AppText style={styles.emptyDefaults}>No lanes yet</AppText>
          </Cell>
        ) : (
          lanes.map((l, i) => (
            <Cell key={l.id} pos={lanes.length === 1 ? 'single' : i === 0 ? 'first' : i === lanes.length - 1 ? 'last' : 'middle'}>
              <AppText style={styles.rowLabel}>{l.name ?? noteName(l.note)}</AppText>
              <AppText style={styles.rowValue}>Channel {l.channel + 1}</AppText>
            </Cell>
          ))
        )}
      </Group>

      {/* PANIC — the one red destructive control */}
      <View style={styles.panicWrap}>
        <Pressable
          onPress={panic}
          disabled={!connected}
          accessibilityRole="button"
          accessibilityLabel="Panic — all notes off"
          style={({ pressed }) => [styles.panic, !connected && styles.panicDisabled, pressed && styles.panicPressed]}
        >
          <IconPanic size={20} />
          <AppText style={styles.panicText}>Panic · All Notes Off</AppText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { paddingBottom: 40 },

  connLeft: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  connName: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.label },

  rowLabel: { fontSize: 16, lineHeight: 20, color: color.label },
  rowValue: { fontSize: 16, lineHeight: 20, fontWeight: '500', color: GRAY },

  latencyCell: { flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingVertical: 14 },
  latencyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  latencyValue: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: GRAY },

  logCell: { flexDirection: 'column', alignItems: 'stretch', gap: 3, paddingVertical: 12 },
  emptyDefaults: { fontSize: 16, lineHeight: 20, color: GRAY },

  panicWrap: { paddingTop: 22, paddingBottom: 8, paddingHorizontal: space.lg },
  panic: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
    paddingVertical: 15,
    borderRadius: 13,
    backgroundColor: 'rgba(255,69,58,0.14)',
  },
  panicDisabled: { opacity: 0.4 },
  panicPressed: { opacity: 0.7 },
  panicText: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.danger },
});
