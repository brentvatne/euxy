/**
 * 01 · Sequencer — the instrument home (Paper 7A-0, with states 1OO-0 64-step,
 * 1WK-0 record, 22T-0 empty, 2CD-0 overview). Compact custom header (pattern
 * name + connection pill), mutate tools row, lane list with UI-thread
 * playheads (all steps always visible, wrapped at 16 per row), and the pinned
 * transport above the tab bar.
 */
import { useEffect, useRef, useState } from 'react';
import { useIsFirstRender } from '@/lib/use-is-first-render';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import { useRailInsets } from '@/theme/navigation';
import { themed, useStyles } from '@/theme/theme';
import Animated, {
  FadeInDown,
  FadeOut,
  LayoutAnimationConfig,
  LinearTransition,
  ReduceMotion,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { engine } from '@/core/engine';
import { midiNoteName } from '@/core/note';
import { isPresetPattern } from '@/state/presets';
import { laneAudible, useActivePattern, useAnySolo, useSettings } from '@/state/selectors';
import { selectHasLaneEdits, useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { reportFirstScreenLayout } from '@/components/boot-signal';
import { useMidiRuntime } from '@/components/midi/runtime';
import { postNotice } from '@/lib/notice';
import { haptics, logObserveEvent } from '@/lib/shims';
import { useBeatHaptics } from '@/lib/use-beat-haptics';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { LaneRow, TransportBar } from '@/components/ui';
import { useScreenFocused } from '@/components/ui/use-screen-focused';
import { chipForPattern } from '@/components/patterns/chips';
import { useRenamePrompt } from '@/components/patterns/rename-prompt';
import { SequencerNav, type PatternMenuAction } from '@/components/sequencer/header';
import { EmptyState } from '@/components/sequencer/empty-state';
import { FloatingActions } from '@/components/sequencer/floating-actions';
import { StepStrip } from '@/components/sequencer/step-strip';

/**
 * Where UIKit puts a navigation bar when the status bar is in a side rail
 * (iPhone Duo): 24pt from the top in both poses, while the safe-area top inset
 * and the status bar frame both read 0, so no API reports it (measured on iOS
 * 27.1). The Sequencer's custom header starts there too, so its title lines up
 * with the native titles of the other tabs.
 */
const NAV_BAR_TOP_IN_RAIL = 24;

/** ROADMAP item 12: the strip already SHOWS the rhythm, so the subtitle is
 * just the two facts you scan for — note · Track N. Euclid params live in
 * the Lane Editor where they're editable. */
function laneSubtitle(lane: Lane): string {
  return `${midiNoteName(lane.note)} · Track ${lane.channel + 1}`;
}

// Backstop for the boot-overlay signal itself — comfortably past BootSplash's
// own 2s failsafe plus its ~900ms power-on.

export default function SequencerScreen() {
  const styles = useStyles(stylesFor);
  const insets = useSafeAreaInsets();
  const rail = useRailInsets();
  const railPadding = { paddingLeft: rail.left, paddingRight: rail.right };
  const railMargin = { marginLeft: rail.left, marginRight: rail.right };
  const pattern = useActivePattern();
  const lanes = pattern.lanes;
  const anySolo = useAnySolo();
  const settings = useSettings();
  const midi = useMidiRuntime();
  const transport = useStore((s) => s.transport);
  const togglePlay = useStore((s) => s.togglePlay);
  const stop = useStore((s) => s.stop);
  const addLane = useStore((s) => s.addLane);
  const clearLanes = useStore((s) => s.clearLanes);
  const revertToLoaded = useStore((s) => s.revertToLoaded);
  const saveCopyAndRevert = useStore((s) => s.saveCopyAndRevert);
  // Gates the "Save copy & revert" menu item: nothing changed since load =
  // nothing to keep a copy of.
  const hasLaneEdits = useStore(selectHasLaneEdits);
  const resetPreset = useStore((s) => s.resetPreset);
  const { promptRename, renamePrompt } = useRenamePrompt();
  const setClockMode = useStore((s) => s.setClockMode);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleSolo = useStore((s) => s.toggleSolo);
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

  // Revert to loaded / Restore preset / the temp key's revert swap the WHOLE
  // lane set in one go, so the list animations fire on a change nobody asked
  // to watch: rows fade out and back in, and every surviving row slides to
  // its new position. The screen reads as jumping around rather than as the
  // pattern snapping back (TestFlight, build 75). Those actions therefore
  // apply in a QUIET commit.
  //
  // It takes frames, not one flag: Reanimated hands each row's entering /
  // exiting / layout config to the native side from componentDidUpdate, so a
  // config dropped in the SAME commit as the swap lands too late to suppress
  // that swap. So the rows go quiet first, the swap runs on the next frame,
  // and the rows re-arm on the frame after that — by then there is no pending
  // layout change left for them to animate. Same paint-boundary reasoning as
  // the capsule reveal below.
  const [quietLanes, setQuietLanes] = useState(false);
  const quietFrame = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (quietFrame.current != null) cancelAnimationFrame(quietFrame.current);
    },
    [],
  );
  const applyQuietly = (run: () => void) => {
    setQuietLanes(true);
    quietFrame.current = requestAnimationFrame(() => {
      run();
      quietFrame.current = requestAnimationFrame(() => {
        quietFrame.current = null;
        setQuietLanes(false);
      });
    });
  };


  // The playhead runs on under the Lane Editor / Tempo sheets (still this
  // tab, just covered); it stops once another tab is actually up and nobody
  // can see the strips (principle 6's spirit).
  const screenFocused = useScreenFocused();

  // Per-route TTI for EAS Observe.
  useMarkInteractive();

  // Opt-in pulse on every beat (Tempo sheet). No-op unless switched on.
  useBeatHaptics();

  const outputDevice = midi.outputs.find((d) => d.id === settings.outputId);
  const connected = midi.enabled && outputDevice != null;

  // The lane editor is the app's workhorse — EAS Observe recorded 95 opens vs
  // 9 for the next-busiest sheet — so how people get INTO it is worth knowing.
  const openEditor = (laneId: string, source: 'lane_row' | 'add_lane' = 'lane_row') => {
    logObserveEvent('lane_editor.opened', { attributes: { source } });
    router.push({ pathname: '/lane-editor/[lane]', params: { lane: laneId } });
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


  // Restores on the spot, no confirmation — the same terms as the Patterns
  // list's per-row Restore Default (patterns.tsx). Only the restore-everything
  // action there asks first, because that one reaches patterns you aren't
  // looking at.
  const restorePreset = () => {
    haptics.impact('light');
    resetPreset(pattern.id);
  };

  // The copy is saved into the Patterns library, which is another tab — so the
  // grid's revert wash is only half the story. The banner names the pattern
  // that was just written, which is also where you'd go to rename it.
  const saveCopy = () => {
    const copyId = saveCopyAndRevert();
    if (copyId == null) return;
    const copy = useStore.getState().patterns.find((p) => p.id === copyId);
    haptics.success();
    postNotice(`COPY SAVED · ${(copy?.name ?? pattern.name).toUpperCase()}`);
  };

  const onMenuAction = (action: PatternMenuAction) => {
    switch (action) {
      case 'new':
        // Tagged so useScreenFocused can tell this sheet apart from the same
        // route pushed by the Patterns tab (src/components/ui/use-screen-focused.ts).
        router.push({ pathname: '/new-pattern', params: { from: 'sequencer' } });
        break;
      case 'rename':
        promptRename(pattern);
        break;
      case 'icon':
        router.push({ pathname: '/change-icon', params: { from: 'sequencer' } });
        break;
      case 'share':
        router.push('/share-pattern');
        break;
      // Reverts the lane set too, so it snaps like the two below.
      case 'save-copy':
        applyQuietly(saveCopy);
        break;
      // Both restore a state you already know — the LED wash is the feedback,
      // the list itself just snaps (see applyQuietly).
      case 'revert':
        applyQuietly(revertToLoaded);
        break;
      case 'restore':
        applyQuietly(restorePreset);
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
      {/* On iPhone Duo the status bar sits in the side rail, so there is no
          top inset; the header starts where UIKit puts the other tabs'
          navigation bars. Phones always have a top inset. */}
      <View style={{ paddingTop: insets.top > 0 ? insets.top : NAV_BAR_TOP_IN_RAIL }} />
      {/* iPhone Duo's side rail (clock, Dynamic Island, tab bar) is a left or
          right safe-area inset. The header, lanes and capsule keep out of it;
          the screen's ground and the transport dock below still run to the
          edge, so the dock's shadow and the bar's top border have no end to
          show beside the rail; only the transport's controls move in. */}
      <View style={railPadding}>
        <SequencerNav
          patternName={pattern.name}
          patternChip={chipForPattern(pattern)}
          connected={connected}
          deviceName={outputDevice?.name ?? 'No device'}
          canSaveCopy={hasLaneEdits}
          canRestorePreset={isPresetPattern(pattern.id)}
          onMenuAction={onMenuAction}
        />
      </View>
      {/* The lane list with the floating action bar (Paper 7A-0) hovering
          above it — add lane / mutate / undo live there, not in a header row
          or at the list's end. */}
      {/* Margins, not padding: the floating capsule is absolutely positioned
          in here, and an absolute child ignores its parent's padding, so it
          would slide under the rail's tab bar. */}
      <View style={[styles.listArea, railMargin]}>
        {lanes.length === 0 ? (
          <EmptyState onAddLane={addAndEdit} />
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
            {lanes.map((lane, laneIndex) => (
              // Lanes power on when added and decay out when removed, with
              // siblings sliding into place — Reanimated layout animations on
              // the UI thread (LED language: quick in, phosphor-tail out).
              // All of it goes quiet for a revert / restore swap.
              //
              // Dropping the row's own `exiting` is not enough there: the
              // accent bar inside is a Led with its own phosphor decay, so a
              // removed lane left a lit bar hanging in empty space for ~300ms.
              // skipExiting reaches those descendants, and it is read when
              // this wrapper unmounts — the other reason the flag has to be
              // set a commit early.
              <LayoutAnimationConfig key={lane.id} skipExiting={quietLanes}>
              <Animated.View
                entering={
                  isFirstRender || quietLanes
                    ? undefined
                    : FadeInDown.duration(220).reduceMotion(ReduceMotion.System)
                }
                exiting={
                  quietLanes
                    ? undefined
                    : FadeOut.duration(180).reduceMotion(ReduceMotion.System)
                }
                layout={
                  quietLanes
                    ? undefined
                    : LinearTransition.duration(220).reduceMotion(ReduceMotion.System)
                }
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
                // Lane ids are random per install; position is what automation can name.
                titleTestID={`lane-row-title-${laneIndex}`}
              >
                {/* Washes sweep FROM the capsule: lower lanes fire first. */}
                <StepStrip
                  lane={lane}
                  washDelay={(lanes.length - 1 - laneIndex) * 45}
                  active={screenFocused}
                />
              </LaneRow>
              </Animated.View>
              </LayoutAnimationConfig>
            ))}
          </ScrollView>
        )}
        {/* Always mounted (Liquid Glass wants to be created under the boot
            overlay, see floating-actions.tsx); parked off-screen in the empty
            state, whose own Add-lane CTA owns that screen. */}
        <FloatingActions
        visible={lanes.length > 0}
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
          // Restores a state you already know, same as revert / restore
          // above — the swap snaps instead of animating.
          onRevert={() => applyQuietly(revertSnapshot)}
          onKeep={keepSnapshot}
        />
      </View>

      {/* Bottom inset includes the tab bar height inside NativeTabs — keeps
          the transport pinned above it, on the transport's own background. */}
      <View style={[styles.dock, { paddingBottom: insets.bottom }]}>
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
          edgeInsets={rail}
        />
      </View>
      {renamePrompt}
    </View>
  );
}

const stylesFor = themed(({ color }) => ({
  root: { flex: 1, backgroundColor: color.ground },
  listArea: { flex: 1 },
  scroll: { flex: 1 },
  // Extra bottom padding so the last lane can scroll clear of the floating bar.
  scrollContent: { paddingBottom: 84 },
  // Subtle upward shadow so the pinned transport reads as floating over the
  // lane list scrolling beneath it (Paper 2026-07-24 depth pass). It lives on
  // the dock, which runs to the screen's bottom edge, so the blur's downward
  // spill lands off-screen instead of under the bar, above the tab bar.
  dock: {
    backgroundColor: color.ground,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -8 },
  },
}));
