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
 */
import { useEffect } from 'react';
import { useAnimatedReaction, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import { playheadTick } from '@/core/playhead';
import { haptics } from '@/lib/shims';
import { useStore } from '@/state/store';
import { timing } from '@/theme/tokens';

const PPQN = timing.ppqn; // 24 ticks per beat
const BEATS_PER_BAR = 4;

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

  useAnimatedReaction(
    () => (runningSV.value === 1 ? Math.floor(playheadTick.value / PPQN) : -1),
    (beat, prev) => {
      // Only a CHANGE between two running beats fires. Starting the transport
      // moves -1 → 0, which is a real downbeat and should be felt; stopping
      // moves n → -1, which must not.
      if (beat < 0 || beat === prev) return;
      // Downbeat lands heavier — the first of four has to be tellable from the
      // other three without looking.
      scheduleOnRN(beat % BEATS_PER_BAR === 0 ? fireDownbeat : fireOffbeat);
    },
  );
}

// Module-level so the worklet captures a stable reference rather than a new
// closure on every render.
const fireDownbeat = () => haptics.impact('medium');
const fireOffbeat = () => haptics.selection();
