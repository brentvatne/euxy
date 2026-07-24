/**
 * 01 · Sequencer — the instrument home (Paper 7A-0, with states 1OO-0 64-step,
 * 1WK-0 record, 22T-0 empty, 2CD-0 overview). Compact custom header (pattern
 * name + connection pill), mutate tools row, lane list with UI-thread
 * playheads (all steps always visible, wrapped at 16 per row), and the pinned
 * transport above the tab bar.
 */
import { useEffect } from 'react';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { engine } from '@/core/engine';
import { midiNoteName } from '@/core/note';
import { laneAudible, useActivePattern, useAnySolo, useSettings } from '@/state/selectors';
import { getMutateDepth, useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { useMidiRuntime } from '@/components/midi/runtime';
import { useObserve } from '@/lib/shims';
import { color } from '@/theme/tokens';
import { LaneRow, TransportBar } from '@/components/ui';
import { SequencerNav, type PatternMenuAction } from '@/components/sequencer/header';
import { EmptyState } from '@/components/sequencer/empty-state';
import { FloatingActions } from '@/components/sequencer/floating-actions';
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
  const mutatePattern = useStore((s) => s.mutateActivePattern);
  const undoMutate = useStore((s) => s.undoMutate);
  // mutateVersion bumps on every mutate/undo, re-deriving the history depth.
  const activePatternId = useStore((s) => s.activePatternId);
  useStore((s) => s.mutateVersion);
  const canUndoMutate = getMutateDepth(activePatternId) > 0;

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
      {/* The lane list with the floating action bar (Paper 7A-0) hovering
          above it — add lane / mutate / undo live there, not in a header row
          or at the list's end. */}
      <View style={styles.listArea}>
        {lanes.length === 0 ? (
          <EmptyState onAddLane={addAndEdit} />
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {lanes.map((lane) => (
              <LaneRow
                key={lane.id}
                title={lane.name ?? midiNoteName(lane.note)}
                subtitle={laneSubtitle(lane)}
                // M reflects the EFFECTIVE mix: a solo elsewhere mutes this
                // lane just as surely as its own flag.
                muted={lane.muted || (anySolo && !lane.solo)}
                solo={lane.solo}
                audible={laneAudible(lane, anySolo)}
                onToggleMute={() => toggleMute(lane.id)}
                onToggleSolo={() => toggleSolo(lane.id)}
                onPressTitle={() => openEditor(lane.id)}
              >
                <StepStrip lane={lane} />
              </LaneRow>
            ))}
          </ScrollView>
        )}
        <FloatingActions
          canMutate={lanes.length > 0}
          canUndo={canUndoMutate}
          onAddLane={addAndEdit}
          onMutate={mutatePattern}
          onUndo={undoMutate}
        />
      </View>

      {/* Bottom inset includes the tab bar height inside NativeTabs — keeps
          the transport pinned above it, on the transport's own background. */}
      <View style={{ paddingBottom: insets.bottom, backgroundColor: '#0A0A0A' }}>
        <TransportBar
          playing={transport.playing}
          bpm={transport.bpm}
          mode={transport.clockMode}
          recordPhase={transport.recordPhase}
          countInBeat={transport.countInBeat}
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
  listArea: { flex: 1 },
  scroll: { flex: 1 },
  // Extra bottom padding so the last lane can scroll clear of the floating bar.
  scrollContent: { paddingBottom: 84 },
});
