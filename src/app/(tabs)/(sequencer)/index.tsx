/**
 * 01 · Sequencer — the instrument home (Paper 7A-0, with states 1OO-0 64-step,
 * 1WK-0 record, 22T-0 empty, 2CD-0 overview). Compact custom header (pattern
 * name + connection pill), Lanes | Overview toggle, lane list with UI-thread
 * playheads, and the pinned transport above the tab bar.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { engine } from '@/core/engine';
import { midiNoteName } from '@/core/note';
import { laneAudible, useActivePattern, useAnySolo, useSettings } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { useMidiRuntime } from '@/components/midi/runtime';
import { useObserve } from '@/lib/shims';
import { color, font, ramp } from '@/theme/tokens';
import { AppText, LaneRow, TransportBar } from '@/components/ui';
import {
  LanesOverviewToggle,
  SequencerNav,
  type PatternMenuAction,
  type SequencerView,
} from '@/components/sequencer/header';
import { EmptyState } from '@/components/sequencer/empty-state';
import { Overview } from '@/components/sequencer/overview';
import { StepStrip } from '@/components/sequencer/step-strip';

function laneSubtitle(lane: Lane): string {
  const gens =
    lane.genB.pulses > 0
      ? `E(${lane.genA.pulses},${lane.length})+E(${lane.genB.pulses},${lane.length})`
      : `E(${lane.genA.pulses},${lane.length})`;
  const steps = lane.length > 16 ? ` · ${lane.length} steps` : '';
  return `${midiNoteName(lane.note)} · ${gens} ⟳${lane.trackRot}${steps}`;
}

export default function SequencerScreen() {
  const insets = useSafeAreaInsets();
  const pattern = useActivePattern();
  const lanes = pattern.lanes;
  const anySolo = useAnySolo();
  const settings = useSettings();
  const midi = useMidiRuntime();
  const transport = useStore((s) => s.transport);
  const togglePlay = useStore((s) => s.togglePlay);
  const stop = useStore((s) => s.stop);
  const addLane = useStore((s) => s.addLane);
  const renameActivePattern = useStore((s) => s.renameActivePattern);
  const clearLanes = useStore((s) => s.clearLanes);
  const resetLanes = useStore((s) => s.resetLanes);
  const setClockMode = useStore((s) => s.setClockMode);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleSolo = useStore((s) => s.toggleSolo);
  const selectLane = useStore((s) => s.selectLane);
  const [view, setView] = useState<SequencerView>('lanes');

  // Wire the engine (idempotent): store subscription + the shared MIDI port.
  useEffect(() => {
    engine.init();
  }, []);

  // Per-route TTI for EAS Observe.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);

  const outputDevice = midi.outputs.find((d) => d.id === settings.outputId);
  const connected = midi.enabled && outputDevice != null;

  const openEditor = (laneId: string) => {
    selectLane(laneId);
    router.push('/lane-editor');
  };

  // A fresh lane goes straight into the editor to be named and dialed in.
  const addAndEdit = () => openEditor(addLane());

  const renamePattern = () => {
    Alert.prompt(
      'Rename pattern',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rename', onPress: (name?: string) => name?.trim() && renameActivePattern(name) },
      ],
      'plain-text',
      pattern.name,
    );
  };

  const onMenuAction = (action: PatternMenuAction) => {
    switch (action) {
      case 'new':
        router.push('/new-pattern');
        break;
      case 'rename':
        renamePattern();
        break;
      case 'reset':
        resetLanes();
        break;
      case 'clear':
        clearLanes();
        break;
    }
  };

  return (
    <View style={styles.root}>
      <View style={{ paddingTop: insets.top }} />
      <SequencerNav
        patternName={pattern.name}
        connected={connected}
        deviceName={outputDevice?.name ?? 'No device'}
        onMenuAction={onMenuAction}
      />
      <LanesOverviewToggle value={view} onChange={setView} />

      {lanes.length === 0 ? (
        <EmptyState onAddLane={addAndEdit} />
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          {view === 'lanes' ? (
            <>
              {lanes.map((lane) => (
                <LaneRow
                  key={lane.id}
                  title={lane.name ?? midiNoteName(lane.note)}
                  subtitle={laneSubtitle(lane)}
                  muted={lane.muted}
                  solo={lane.solo}
                  audible={laneAudible(lane, anySolo)}
                  onToggleMute={() => toggleMute(lane.id)}
                  onToggleSolo={() => toggleSolo(lane.id)}
                  onPressTitle={() => openEditor(lane.id)}
                >
                  <StepStrip lane={lane} />
                </LaneRow>
              ))}
              <Pressable onPress={addAndEdit} style={styles.addLane} accessibilityRole="button">
                <Svg width={17} height={17} viewBox="0 0 24 24">
                  <Path
                    d="M12 5v14M5 12h14"
                    fill="none"
                    stroke={color.label}
                    strokeWidth={2.4}
                    strokeLinecap="round"
                  />
                </Svg>
                <AppText style={styles.addLaneLabel}>Add lane</AppText>
              </Pressable>
            </>
          ) : (
            <Overview lanes={lanes} />
          )}
        </ScrollView>
      )}

      {/* Bottom inset includes the tab bar height inside NativeTabs — keeps
          the transport pinned above it, on the transport's own background. */}
      <View style={{ paddingBottom: insets.bottom, backgroundColor: '#0A0A0A' }}>
        <TransportBar
          playing={transport.playing}
          bpm={transport.bpm}
          mode={transport.clockMode}
          playDisabled={lanes.length === 0}
          onTogglePlay={togglePlay}
          onStop={() => {
            stop();
            engine.resetToStart();
          }}
          onSkipToStart={() => engine.resetToStart()}
          onToggleMode={() =>
            setClockMode(transport.clockMode === 'jam' ? 'record' : 'jam')
          }
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 8 },
  // Paper 112-0: p 16, top border, centered plus + label.
  addLane: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: ramp[7],
  },
  addLaneLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 15, lineHeight: 18, color: color.label },
});
