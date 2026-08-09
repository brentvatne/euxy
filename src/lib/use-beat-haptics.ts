/**
 * Beat haptics — a pulse on every beat while the transport runs, downbeat
 * accented. Opt-in from the Tempo sheet; off by default.
 *
 * This is a deliberate, user-asked-for exception to ROADMAP §"Haptic language",
 * which rules that haptics are NEVER clock-synced because a per-beat pulse
 * fights the music. It stays an exception on two conditions:
 *
 *  1. It is off unless someone switches it on, and the sheet says what it does.
 *  2. The rule's other half — "timers on the JS thread compete with the MIDI
 *     scheduler" — is honoured properly. Nothing here schedules anything. A
 *     `useAnimatedReaction` watches the beat index derived from the SAME
 *     playhead the grid draws from, so the pulse rides the engine's clock
 *     rather than racing it.
 *
 * The hit itself goes through `scheduleOnRN` and expo-haptics, NOT Pulsar's
 * worklet-callable `playDiscrete`, even though that would keep the whole thing
 * on the UI thread. Two reasons, in order:
 *
 *  - It works on every build already installed. Pulsar is a native dep, so a
 *    Pulsar-based pulse would do nothing until the next build ships.
 *  - Build 78 crashed in the Hermes GC while popping the dice, and it is the
 *    first build carrying Pulsar. The identified defect was in
 *    `usePatternComposer` (see the note in ROADMAP §"Haptic language") and does
 *    not touch this path — but calling a TurboModule from the UI thread is
 *    unproven on device, and a per-beat pulse is not worth being the second
 *    place we find out.
 *
 * Note what the hop does NOT move: the UI thread still decides WHEN. JS only
 * plays the hit, it never times it.
 *
 * Downbeat accent assumes 4/4, matching the transport's own BeatTicker, which
 * walks 1-2-3-4. euxy has no time signature to consult.
 *
 * STARTING the transport is the one case where two haptics want the same
 * moment: the play key clicks on press-IN (medium impact), and the run's first
 * pulse lands about a frame after the release. Fired as two events they read as
 * one mushy double hit rather than as a click and a downbeat. So the play key
 * CLAIMS the pulse it is about to start (`claimStartPulse`) and that pulse is
 * DROPPED, never delayed — the press keeps its immediate click, and nothing is
 * lost, because a transport press and a downbeat are the SAME medium impact:
 * the click IS the downbeat.
 *
 * Only the pulse a run starts on is claimable, which is why this is a one-shot
 * claim and not a rolling rate limit over all haptics. A limiter wide enough to
 * cover a press (press-in to release is easily 100ms+) would start eating real
 * beats — at 300bpm, euxy's ceiling, beats are only 200ms apart.
 */
import { useCallback, useEffect } from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { playheadTick } from '@/core/playhead';
import { haptics } from '@/lib/shims';
import { useStore } from '@/state/store';
import { timing } from '@/theme/tokens';

const PPQN = timing.ppqn; // 24 ticks per beat
const BEATS_PER_BAR = 4;

/**
 * How long a claim stands before it expires unused. A tap's press-in-to-release
 * is well inside this and the pulse follows the release by a frame, so a real
 * play press always lands its claim. Anything slower is a finger RESTING on the
 * key, and by the time it lifts the click is long over — there is no double hit
 * left to merge, so the claim must lapse rather than swallow a beat.
 */
const CLAIM_MS = 700;

/** When the transport's play key last claimed a start pulse; 0 = no claim. */
let startClaimedAt = 0;

/**
 * Called by the play key on press-IN, and ONLY when the press will START the
 * clock — the key's own click stands in for the pulse that follows it. Cheap
 * and stateless enough to call whether or not the metronome is on: an
 * unconsumed claim just expires.
 *
 * Module state, not a store field, deliberately: it is a one-frame handoff
 * between two haptics that nothing renders, and putting it in the store would
 * re-render the sequencer on every play press.
 */
export function claimStartPulse(): void {
  startClaimedAt = Date.now();
}

/** Takes the claim (one pulse only) and reports whether it was still live. */
function consumeStartPulse(): boolean {
  if (startClaimedAt === 0) return false;
  const live = Date.now() - startClaimedAt < CLAIM_MS;
  startClaimedAt = 0;
  return live;
}

export function useBeatHaptics(): void {
  const enabled = useStore((s) => s.settings.beatHaptics);
  const playing = useStore((s) => s.transport.playing);

  // A shared value, not a captured boolean, so the mapper is subscribed to the
  // run state and cannot depend on when Reanimated registers it.
  const runningSV = useSharedValue(0);
  const running = enabled && playing;
  useEffect(() => {
    runningSV.value = running ? 1 : 0;
  }, [running, runningSV]);

  /**
   * This MUST be declared above the reaction that captures it, and must be in
   * scope here rather than at module level.
   *
   * A worklet captures each free identifier's VALUE when the worklet object is
   * built, and the plugin builds it before a module-level `const` below it has
   * initialised — so the closure captures `undefined` permanently. Handing that
   * to `scheduleOnRN` is not a JS error you can debug: it is an unguarded
   * property read in the worklets runtime, i.e. a native segfault the first
   * time a beat lands. That is exactly how build 79 crashed
   * (`toOptimizedObject` → `jsi::Object::getProperty` on garbage), and the same
   * trap is documented on the charge reaction in
   * components/sequencer/floating-actions.tsx.
   *
   * useCallback so the reference is stable and the reaction is not rebuilt on
   * every render.
   */
  const firePulse = useCallback((downbeat: boolean, start: boolean) => {
    // Dropped: the play key's click already served as this pulse.
    if (start && consumeStartPulse()) return;
    // Downbeat lands heavier — the first of four has to be tellable from the
    // other three without looking.
    if (downbeat) haptics.impact('medium');
    else haptics.selection();
  }, []);

  useAnimatedReaction(
    () => (runningSV.value === 1 ? Math.floor(playheadTick.value / PPQN) : -1),
    (beat, prev) => {
      // Only a CHANGE between two running beats fires. Starting the transport
      // moves -1 → 0, which is a real downbeat and should be felt; stopping
      // moves n → -1, which must not.
      if (beat < 0 || beat === prev) return;
      // `prev` is null on the mapper's first run and -1 for as long as the
      // transport is stopped, so either one means this is the pulse a run
      // STARTS on — the only pulse the play key can have claimed. Resuming from
      // a paused playhead counts: that is a start too, and it is the same
      // press. Whether it is claimed is a JS-side question (Date.now, module
      // state), so the worklet only reports WHICH pulse this is.
      scheduleOnRN(firePulse, beat % BEATS_PER_BAR === 0, prev == null || prev < 0);
    },
  );
}
