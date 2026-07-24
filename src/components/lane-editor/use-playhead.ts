/**
 * usePlayhead — the lane-local playhead step, derived from the ENGINE's global
 * tick (core/playhead Reanimated shared values), not wall-clock. The reaction
 * runs on the UI thread and only crosses to JS (a re-render) when the derived
 * step index actually changes — i.e. at step rate, not tick rate. Parks at
 * step 0 while the transport is stopped.
 */
import { useState } from 'react';
import { runOnJS, useAnimatedReaction } from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';

export function usePlayhead(length: number, resolutionTicks: number): number {
  const [step, setStep] = useState(0);
  useAnimatedReaction(
    () => {
      if (length <= 0 || resolutionTicks <= 0 || !playheadPlaying.value) return 0;
      return Math.floor(playheadTick.value / resolutionTicks) % length;
    },
    (cur, prev) => {
      if (cur !== prev) runOnJS(setStep)(cur);
    },
    [length, resolutionTicks],
  );
  return length > 0 ? step % length : 0;
}
