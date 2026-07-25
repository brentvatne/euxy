/**
 * 01 · Sequencer — the instrument home (Paper 7A-0, with states 1OO-0 64-step,
 * 1WK-0 record, 22T-0 empty, 2CD-0 overview). Compact custom header (pattern
 * name + connection pill), mutate tools row, lane list with UI-thread
 * playheads (all steps always visible, wrapped at 16 per row), and the pinned
 * transport above the tab bar.
 */
import { useEffect, useRef } from 'react';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { engine } from '@/core/engine';
import { midiNoteName } from '@/core/note';
import { laneAudible, useActivePattern, useAnySolo, useSettings } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { reportSequencerLayout } from '@/components/boot-signal';
import { useMidiRuntime } from '@/components/midi/runtime';
import { useObserve } from '@/lib/shims';
import { color } from '@/theme/tokens';
import { LaneRow, TransportBar } from '@/components/ui';
import { chipForPattern } from '@/components/patterns/chips';
import { SequencerNav, type PatternMenuAction } from '@/components/sequencer/header';
import { EmptyState } from '@/components/sequencer/empty-state';
import { FloatingActions } from '@/components/sequencer/floating-actions';
import { StepStrip } from '@/components/sequencer/step-strip';

/** ROADMAP item 12: the strip already SHOWS the rhythm, so the subtitle is
 * just the two facts you scan for — note · Track N. Euclid params live in
 * the Lane Editor where they're editable. */
function laneSubtitle(lane: Lane): string {
  return `${midiNoteName(lane.note)} · Track ${lane.channel + 1}`;
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
  // Temp mode: the capsule's resident temp key lights while this is true.
  const snapshotActive = useStore((s) => s.snapshotActive);
  const armSnapshot = useStore((s) => s.armSnapshot);
  const revertSnapshot = useStore((s) => s.revertSnapshot);
  const keepSnapshot = useStore((s) => s.keepSnapshot);

  // Wire the engine (idempotent): store subscription + the shared MIDI port.
  useEffect(() => {
    engine.init();
  }, []);

  // Lanes mounted in the screen's FIRST render must NOT run entering
  // animations: initial-mount entering left the whole list stuck invisible on
  // cold boot (found by the wave-2 ambient agent, reproduced on the merged
  // build), and design-wise lanes should only power on when ADDED anyway.
  const initialRender = useRef(true);
  useEffect(() => {
    initialRender.current = false;
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
      case 'icon':
        router.push('/change-icon');
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
    // First onLayout tells BootSplash the sequencer has really rendered and
    // laid out beneath the boot overlay, so the native splash can drop.
    <View style={styles.root} onLayout={reportSequencerLayout}>
      <View style={{ paddingTop: insets.top }} />
      <SequencerNav
        patternName={pattern.name}
        patternChip={chipForPattern(pattern)}
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
            {lanes.map((lane, laneIndex) => (
              // Lanes power on when added and decay out when removed, with
              // siblings sliding into place — Reanimated layout animations on
              // the UI thread (LED language: quick in, phosphor-tail out).
              <Animated.View
                key={lane.id}
                entering={
                  initialRender.current
                    ? undefined
                    : FadeInDown.duration(220).reduceMotion(ReduceMotion.System)
                }
                exiting={FadeOut.duration(180).reduceMotion(ReduceMotion.System)}
                layout={LinearTransition.duration(220).reduceMotion(ReduceMotion.System)}
              >
              <LaneRow
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
                {/* Washes sweep FROM the capsule: lower lanes fire first. */}
                <StepStrip lane={lane} washDelay={(lanes.length - 1 - laneIndex) * 45} />
              </LaneRow>
              </Animated.View>
            ))}
          </ScrollView>
        )}
        {/* Hidden in the empty state — its own Add-lane CTA owns that screen. */}
        {lanes.length > 0 ? (
          <FloatingActions
            // Same cold-boot rule as the lanes above: no mount animation on
            // the screen's first render (it can stick invisible).
            animateMount={!initialRender.current}
            canMutate
            snapshotActive={snapshotActive}
            onAddLane={addAndEdit}
            onMutate={mutatePattern}
            onArm={armSnapshot}
            onRevert={revertSnapshot}
            onKeep={keepSnapshot}
          />
        ) : null}
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
