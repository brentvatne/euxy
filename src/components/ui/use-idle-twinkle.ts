/**
 * useIdleTwinkle — drives an LedGrid `pulse` progress for LED-motion concept D
 * (empty-state idle twinkle): a slow 0→1 loop so ONE random cell at a time
 * breathes a step brighter and eases back. Idle motion only — the loop is
 * PAUSED (frozen to the settled frame, progress 0) while the transport is
 * playing, while the screen is blurred, and under Reduced Motion.
 */
import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import {
  cancelAnimation,
  Easing,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { useStore } from '@/state/store';

/** Extra silence before the first twinkle so it never reads as a reaction to navigation. */
const LEAD_IN_MS = 2000;

export function useIdleTwinkle(loopMs: number, enabled = true): SharedValue<number> {
  const progress = useSharedValue(0);
  const playing = useStore((s) => s.transport.playing);
  const reduceMotion = useReducedMotion();
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const run = enabled && focused && !playing && !reduceMotion;
  useEffect(() => {
    if (run) {
      progress.value = 0;
      progress.value = withRepeat(
        withDelay(LEAD_IN_MS, withTiming(1, { duration: loopMs, easing: Easing.linear })),
        -1,
        false,
      );
    } else {
      cancelAnimation(progress);
      progress.value = 0;
    }
    return () => cancelAnimation(progress);
  }, [run, loopMs, progress]);

  return progress;
}
