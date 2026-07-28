/**
 * MIDI tab (Paper MC-0 connected / 1A8-0 disconnected). Large-title grouped
 * form: Connection · Timing · Diagnostics · Routing · Panic. This screen is
 * also the entire web experience — it drives the platform `MidiPort` via the
 * shared runtime, so on web it doubles as the minimal MIDI connection tester
 * (enable → pick output/input → watch traffic → panic; send a test note from
 * the Activity-log screen).
 */
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AppText, Segmented } from '@/components/ui';
import { IconPanic } from '@/components/ui/icons';
import { reportFirstScreenLayout } from '@/components/boot-signal';
import { haptics } from '@/lib/shims';
import { useActivePattern, useSettings, useTransport } from '@/state/selectors';
import { useStore } from '@/state/store';
import { color, space } from '@/theme/tokens';
import { Cell, ClockModeToggle, ConnectionBadge, GRAY, Group, LatencySlider, LogPreview, PushRow, SectionHeader, ValueRow } from './components';
import { enableMidi, panic, refreshDevices, setLatency, useMidiRuntime } from './runtime';

const LATENCY_MIN = -120;
const LATENCY_MAX = 120;
const fmtLatency = (ms: number) => `${ms > 0 ? '+' : ''}${ms} ms`;

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
// Same octave convention as core/note.ts (Paper: 36 → C1).
const noteName = (n: number) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 2}`;

export default function MidiScreen() {
  const rt = useMidiRuntime();

  // Re-enumerate whenever the tab gains focus — a device plugged in while
  // the user was on another screen shows up without an OS state event.
  useFocusEffect(
    useCallback(() => {
      refreshDevices();
    }, []),
  );

  // Per-route TTI for EAS Observe is marked once at the route boundary in
  // `src/app/(tabs)/(midi)/midi.tsx` — don't mark it again here.
  const settings = useSettings();
  const transport = useTransport();
  const setClockMode = useStore((s) => s.setClockMode);
  const setCountInBeats = useStore((s) => s.setCountInBeats);
  // Routing is scoped to the active pattern, so the section needs its name
  // as well as its lanes.
  const activePattern = useActivePattern();
  const lanes = activePattern.lanes;

  // Native/stub can enable without a gesture; web requires the Enable-MIDI tap.
  useEffect(() => {
    if (Platform.OS !== 'web' && !rt.enabled) void enableMidi();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const outName = rt.outputs.find((d) => d.id === settings.outputId)?.name ?? null;
  const inName = rt.inputs.find((d) => d.id === settings.inputId)?.name ?? null;
  const connected = rt.enabled && !!outName;

  const openChannelSurf = () => {
    haptics.impact('medium');
    router.push('/channel-surf');
  };
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
      // Boot layout gate: this tab can be the LAUNCH route (Observe saw 13 of
      // 80 startups land here), and NativeTabs won't have mounted the
      // sequencer in that case — so this root has to be able to release the
      // boot on its own. First reporter wins; later calls are no-ops.
      onLayout={reportFirstScreenLayout}
    >
      {/* CONNECTION */}
      <SectionHeader first>Connection</SectionHeader>
      <Group>
        <Cell pos="first" onPress={onConnectionPress}>
          <View style={styles.connLeft}>
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
        <Cell pos="middle">
          <AppText style={[styles.rowLabel, transport.clockMode === 'jam' && styles.rowLabelDisabled]}>Count-in</AppText>
          <Segmented<'0' | '4'>
            size="compact"
            options={[
              { label: 'Off', value: '0' },
              { label: '1 bar', value: '4' },
            ]}
            value={settings.countInBeats > 0 ? '4' : '0'}
            onChange={(v) => setCountInBeats(v === '4' ? 4 : 0)}
            disabled={transport.clockMode === 'jam'}
          />
        </Cell>
        <Cell pos="last" contentStyle={styles.latencyCell}>
          <View style={styles.latencyHead}>
            <AppText style={styles.rowLabel}>Latency offset</AppText>
            <AppText style={styles.latencyValue}>{fmtLatency(settings.latencyOffsetMs)}</AppText>
          </View>
          <LatencySlider value={settings.latencyOffsetMs} min={LATENCY_MIN} max={LATENCY_MAX} onChange={setLatency} />
        </Cell>
      </Group>
      {/* Mode explainer — what the selected clock mode means and how to use
          the app + device together in it. */}
      <AppText style={styles.sectionFooter}>
        {transport.clockMode === 'jam'
          ? 'Jam — euxy is the clock master. Press Play in the Sequencer and euxy drives the OP‑XY over MIDI clock while you tweak lanes live.'
          : 'Record — the OP‑XY is the clock master and euxy follows its clock, so the Sequencer has no Play button. Hold Record and press Play on the OP‑XY: euxy waits out the count‑in, then plays its lanes in sync while the device captures them into its own sequencer.'}
      </AppText>

      {/* DIAGNOSTICS — long-press the header for the hidden channel-surf
          sheet (runtime EAS Update channel switching). */}
      <SectionHeader onLongPress={openChannelSurf}>Diagnostics</SectionHeader>
      <Group>
        <PushRow pos="first" label="Activity log" onPress={() => router.push('/activity-log')} />
        <Cell pos="last" contentStyle={styles.logCell}>
          <LogPreview lines={rt.log.slice(0, 4)} />
        </Cell>
      </Group>

      {/* ROUTING — lane → channel map for the ACTIVE pattern. Read-only:
          the channel is edited by tap-cycling in the lane editor. */}
      <SectionHeader>Routing</SectionHeader>
      <Group>
        {lanes.length === 0 ? (
          <Cell pos="single">
            <AppText style={styles.emptyRouting}>No lanes yet</AppText>
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
      {/* Names the pattern — this section is the only per-pattern thing on an
          otherwise app-wide screen — and says where the channel is editable. */}
      <AppText style={styles.sectionFooter}>
        Where each lane in {activePattern.name} sends. Set a lane&apos;s channel in the lane editor.
      </AppText>

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
  rowLabelDisabled: { color: GRAY },
  rowValue: { fontSize: 16, lineHeight: 20, fontWeight: '500', color: GRAY },

  latencyCell: { flexDirection: 'column', alignItems: 'stretch', gap: 10, paddingVertical: 14 },
  latencyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionFooter: {
    fontSize: 13,
    lineHeight: 18,
    color: GRAY,
    paddingHorizontal: space.xl + space.md,
    paddingTop: 8,
  },
  latencyValue: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: GRAY },

  logCell: { flexDirection: 'column', alignItems: 'stretch', gap: 3, paddingVertical: 12 },
  emptyRouting: { fontSize: 16, lineHeight: 20, color: GRAY },

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
