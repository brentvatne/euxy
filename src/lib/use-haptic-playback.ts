/**
 * EXPERIMENTAL — play the active pattern through the vibration motor, so the
 * rhythm can be felt with no OP-XY attached. Armed by a long-press on the
 * header's "No device" pill (components/sequencer/header.tsx); the compile
 * lives in core/haptic-pattern.ts, which documents what a haptic rendering can
 * and cannot carry.
 *
 * Two things make this cheap rather than a second scheduler:
 *
 *  1. ONE loop is compiled and handed to the haptic engine, which schedules
 *     every hit inside it natively. Nothing ticks per onset.
 *  2. The re-arm rides the PLAYHEAD, not a timer: a `useAnimatedReaction` over
 *     `floor(playheadTick / loopTicks)` fires `play()` from the UI thread at
 *     each loop boundary, so the haptic loop stays phase-locked to the same
 *     clock the grid draws from. `play` is a worklet precisely so this works.
 *
 * This is why it does not break the "never clock-synced" rule in ROADMAP
 * §"Haptic language" the way a per-beat one-shot ladder would: our clock
 * triggers a loop, not individual hits, and the mode only exists for the case
 * where there IS no music to fight — nothing connected to play it.
 *
 * Edits are adopted AT THE LOOP BOUNDARY while playing (see `pendingSV`), for
 * two reasons: handing the native engine a new pattern costs a parse, and a
 * dice charge changes the rhythm several times a second; and adopting mid-loop
 * restarts the haptic loop out of phase with the bar you are hearing in your
 * head. Stopped, edits are adopted immediately — there is nothing to knock out
 * of phase and the feedback should be instant.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import {
  compilePatternToHaptics,
  rhythmSignature,
  type CompiledHaptics,
} from '@/core/haptic-pattern';
import { playheadTick } from '@/core/playhead';
import { hapticRampAvailable, useHapticPatternPlayer } from '@/lib/shims';
import { useActivePattern } from '@/state/selectors';
import { useStore } from '@/state/store';

export interface HapticPlaybackStatus {
  /** The experimental flag itself — on even on a build that cannot honour it,
   * so the UI can say WHY nothing happens rather than swallowing the gesture. */
  on: boolean;
  /** Whether this build ships the native module at all. */
  available: boolean;
  /** Events in the compiled loop — 0 when nothing sounds. */
  events: number;
  /** Onsets one actuator could not play separately (see core/haptic-pattern). */
  merged: number;
}

export function useHapticPlayback(connected: boolean): HapticPlaybackStatus {
  const on = useStore((s) => s.hapticPlayback);
  const setHapticPlayback = useStore((s) => s.setHapticPlayback);
  const playing = useStore((s) => s.transport.playing);
  const pattern = useActivePattern();
  const bpm = useStore((s) => s.transport.bpm);

  // A device arriving retires the mode. The switch lives on the "No device"
  // pill, and a connected pill is a readout with no long-press — leaving the
  // flag set would strand it somewhere the user cannot reach to turn off.
  useEffect(() => {
    if (connected && on) setHapticPlayback(false);
  }, [connected, on, setHapticPlayback]);

  const enabled = on && !connected && hapticRampAvailable;
  const signature = enabled ? rhythmSignature(pattern, bpm) : '';
  const compiled = useMemo(
    () => (signature === '' ? null : compilePatternToHaptics(pattern, bpm)),
    // `signature` subsumes pattern + bpm: it is exactly the fields the compile
    // reads, and keying on the objects would recompile on every unrelated edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature],
  );

  // What the native engine currently holds, which lags `compiled` while
  // playing. The compile itself is pure JS and cheap; the parse behind
  // `adopted` is the native cost this defers.
  const [adopted, setAdopted] = useState<CompiledHaptics | null>(compiled);
  // Kept current in an effect, not during render (same idiom as
  // components/ui/use-hold-repeat.ts): the boundary callback below fires long
  // after any render and must see the newest compile without being rebuilt.
  const latest = useRef(compiled);
  useEffect(() => {
    latest.current = compiled;
  });
  const adopt = useCallback(() => setAdopted(latest.current), []);

  // Stopped, or switching the mode OFF: adopt at once. Off must be instant —
  // waiting for a boundary would keep a native player alive for no reason.
  // Adjusted during RENDER rather than in an effect: this is derived from the
  // props/state above, not a synchronisation with an outside system, and React
  // re-runs the render before committing so it costs no extra frame.
  if (adopted !== compiled && (!playing || compiled === null)) {
    setAdopted(compiled);
  }

  const events = adopted?.pattern.discretePattern.length ?? 0;
  const loopTicks = adopted?.loopTicks ?? 0;
  // Passed as the ARGUMENT, never parsed imperatively — see useHapticPatternPlayer.
  const { play, stop } = useHapticPatternPlayer(events > 0 ? adopted?.pattern : undefined);

  // The run gate is a SHARED VALUE, not a captured boolean, so the reaction's
  // mapper is subscribed to it and start/stop cannot depend on when the mapper
  // happens to be registered. Same idiom as the transport bar's `recordingSV`.
  //
  // And NOT `playheadPlaying`: despite the name that value means "the playhead
  // is VISIBLE" — engine.pause() sets it from `currentTick > 0`, so it stays 1
  // after a mid-pattern pause and the loop would keep re-arming.
  const runningSV = useSharedValue(0);
  const pendingSV = useSharedValue(0);
  const running = playing && events > 0 && loopTicks > 0;
  useEffect(() => {
    runningSV.value = running ? 1 : 0;
  }, [running, runningSV]);
  useEffect(() => {
    pendingSV.value = compiled !== adopted ? 1 : 0;
  }, [compiled, adopted, pendingSV]);

  useAnimatedReaction(
    () => (runningSV.value === 1 ? Math.floor(playheadTick.value / loopTicks) : -1),
    (loop, prev) => {
      if (loop === prev) return;
      // -1 is "not running". Reaching it stops a loop mid-flight; leaving it is
      // what STARTS playback — a bare change in the loop index could not
      // express that, since a run begins at index 0 from a standstill.
      if (loop < 0) {
        stop();
        return;
      }
      // A boundary is the only safe moment to take an edit. The parse lands
      // after this loop has already been armed, so a change is felt from the
      // NEXT loop — one loop of lag, in exchange for never re-parsing mid-bar.
      if (pendingSV.value === 1) scheduleOnRN(adopt);
      play();
    },
  );

  return {
    on,
    available: hapticRampAvailable,
    // Report the LATEST compile, not the adopted one: the popover is answering
    // "what will this play", and a boundary away is close enough to now.
    events: compiled?.pattern.discretePattern.length ?? 0,
    merged: compiled?.merged ?? 0,
  };
}
