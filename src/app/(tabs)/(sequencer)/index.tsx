/**
 * 01 · Sequencer — the instrument home (Paper 7A-0, with states 1OO-0 64-step,
 * 1WK-0 record, 22T-0 empty, 2CD-0 overview). Compact custom header (pattern
 * name + connection pill), mutate tools row, lane list with UI-thread
 * playheads (all steps always visible, wrapped at 16 per row), and the pinned
 * transport above the tab bar.
 */
import { useEffect, useState } from 'react';
import { useIsFirstRender } from '@/lib/use-is-first-render';
import { router } from 'expo-router';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOut, LinearTransition, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { engine } from '@/core/engine';
import { midiNoteName } from '@/core/note';
import { laneAudible, useActivePattern, useAnySolo, useSettings } from '@/state/selectors';
import { isPresetPattern } from '@/state/presets';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { onBootOverlayGone, reportFirstScreenLayout } from '@/components/boot-signal';
import { useMidiRuntime } from '@/components/midi/runtime';
import { logObserveEvent } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { color } from '@/theme/tokens';
import { LaneRow, TransportBar } from '@/components/ui';
import { useScreenFocused } from '@/components/ui/use-screen-focused';
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

// Backstop for the boot-overlay signal itself — comfortably past BootSplash's
// own 2s failsafe plus its ~900ms power-on.
const CAPSULE_FAILSAFE_MS = 4000;

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
  const revertToLoaded = useStore((s) => s.revertToLoaded);
  const resetPreset = useStore((s) => s.resetPreset);
  const setClockMode = useStore((s) => s.setClockMode);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleSolo = useStore((s) => s.toggleSolo);
  const selectLane = useStore((s) => s.selectLane);
  const mutatePattern = useStore((s) => s.mutateActivePattern);
  // Dice HOLD: a charged roll (one preview roll per schedule tick, escalating
  // in scope) that commits whatever it reached on release.
  const rollPattern = useStore((s) => s.rollActivePattern);
  const commitChargeRoll = useStore((s) => s.commitChargeRoll);
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
  const isFirstRender = useIsFirstRender();

  // The capsule is the ONE thing that animates in on app open, and the whole
  // app renders behind the opaque boot overlay for ~900ms (components/
  // boot-splash.tsx) — so it holds its mount until that overlay is gone and
  // then powers on where it can be seen. Gating on the screen's first render
  // instead (the old `animateMount`) could never work: lanes exist in the very
  // first render (hydration is synchronous), so the capsule always mounted in
  // the initial commit with no entrance at all.
  const [capsuleReady, setCapsuleReady] = useState(false);
  useEffect(() => {
    let revealFrame: number | null = null;
    let revealed = false;
    const reveal = () => {
      if (revealed) return;
      revealed = true;
      setCapsuleReady(true);
    };
    const unsubscribe = onBootOverlayGone(() => {
      // Cross a paint boundary instead of guessing at a delay. The overlay's
      // removal is committed before this signal; mounting on the next frame
      // keeps its teardown and the capsule entrance out of the same frame.
      revealFrame = requestAnimationFrame(reveal);
    });
    // Same never-deadlock rule as the boot gates themselves: if the signal is
    // ever missed, show the capsule anyway — no entrance beats no capsule.
    const failsafe = setTimeout(reveal, CAPSULE_FAILSAFE_MS);
    return () => {
      unsubscribe();
      clearTimeout(failsafe);
      if (revealFrame != null) cancelAnimationFrame(revealFrame);
    };
  }, []);

  // The playhead runs on under the Lane Editor / Tempo sheets (still this
  // tab, just covered); it stops once another tab is actually up and nobody
  // can see the strips (principle 6's spirit).
  const screenFocused = useScreenFocused();

  // Per-route TTI for EAS Observe.
  useMarkInteractive();

  const outputDevice = midi.outputs.find((d) => d.id === settings.outputId);
  const connected = midi.enabled && outputDevice != null;

  // The lane editor is the app's workhorse — EAS Observe recorded 95 opens vs
  // 9 for the next-busiest sheet — so how people get INTO it is worth knowing.
  const openEditor = (laneId: string, source: 'lane_row' | 'add_lane' = 'lane_row') => {
    logObserveEvent('lane_editor.opened', { attributes: { source } });
    selectLane(laneId);
    router.push('/lane-editor');
  };

  // A fresh lane goes straight into the editor to be named and dialed in.
  const addAndEdit = () => openEditor(addLane(), 'add_lane');

  // The product question Observe could not answer: does anyone actually press
  // play? Logged on the stopped→playing edge only, so stopping is not an event
  // and holding down transport can't spam the stream.
  const onTogglePlay = () => {
    if (!transport.playing) {
      logObserveEvent('transport.play', {
        attributes: {
          mode: transport.clockMode,
          lanes: lanes.length,
          bpm: Math.round(transport.bpm),
          connected,
        },
      });
    }
    togglePlay();
  };

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
        // Tagged so useScreenFocused can tell this sheet apart from the same
        // route pushed by the Patterns tab (src/components/ui/use-screen-focused.ts).
        router.push({ pathname: '/new-pattern', params: { from: 'sequencer' } });
        break;
      case 'rename':
        renamePattern();
        break;
      case 'icon':
        router.push({ pathname: '/change-icon', params: { from: 'sequencer' } });
        break;
      case 'share':
        router.push('/share-pattern');
        break;
      case 'revert':
        revertToLoaded();
        break;
      // Factory restore of the preset you're playing: lanes and tempo go back
      // to the shipped version in place (same pattern id), so the sequencer
      // keeps showing this pattern. Immediate, like the other menu actions —
      // and "Revert to loaded" still holds this session's starting lanes.
      case 'restore':
        resetPreset(pattern.id);
        break;
      case 'clear':
        clearLanes();
        break;
    }
  };

  return (
    // First onLayout tells BootSplash a real screen has rendered and laid out
    // beneath the boot overlay, so the native splash can drop. Every tab root
    // reports — the gate must not depend on this route being the one that
    // mounted (see boot-signal.ts).
    <View style={styles.root} onLayout={reportFirstScreenLayout}>
      <View style={{ paddingTop: insets.top }} />
      <SequencerNav
        patternName={pattern.name}
        patternChip={chipForPattern(pattern)}
        connected={connected}
        deviceName={outputDevice?.name ?? 'No device'}
        isPreset={isPresetPattern(pattern.id)}
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
                  isFirstRender
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
                <StepStrip
                  lane={lane}
                  washDelay={(lanes.length - 1 - laneIndex) * 45}
                  active={screenFocused}
                />
              </LaneRow>
              </Animated.View>
            ))}
          </ScrollView>
        )}
        {/* Hidden in the empty state — its own Add-lane CTA owns that screen.
            Held back until the boot overlay is gone so its entrance plays on a
            visible frame (see capsuleReady above). */}
        {lanes.length > 0 && capsuleReady ? (
          <FloatingActions
            canMutate
            snapshotActive={snapshotActive}
            onAddLane={addAndEdit}
            onMutate={() => {
              logObserveEvent('pattern.mutated', { attributes: { lanes: lanes.length } });
              mutatePattern();
            }}
            onRoll={rollPattern}
            // Logged on the COMMIT, once per hold — the preview rolls inside a
            // hold are one gesture, and how far people actually charge is the
            // question worth answering.
            onChargeCommit={(tier) => {
              logObserveEvent('pattern.charged', { attributes: { tier, lanes: lanes.length } });
              commitChargeRoll();
            }}
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
          onTogglePlay={onTogglePlay}
          onStop={() => {
            stop();
            engine.resetToStart();
          }}
          onSkipToStart={() => engine.resetToStart()}
          onToggleMode={() =>
            setClockMode(transport.clockMode === 'jam' ? 'record' : 'jam')
          }
          // §10: the BPM readout opens the Tempo sheet (edits apply live).
          onPressBpm={() => router.push('/tempo')}
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
