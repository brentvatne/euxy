/**
 * useHoldRepeat — press-and-hold auto-repeat for a stepper's − / + button.
 *
 * A tap stays exactly one step (the handlers keep `onPress`, so a press the
 * parent scroll view steals still commits nothing). A HOLD turns into a
 * repeat that ACCELERATES: the interval starts at START_MS and decays by
 * DECAY per tick down to FLOOR_MS, so the value ramps from a countable crawl
 * to ~30 values/second and holds there. Encoder feel — the longer you lean on
 * it, the faster it spins, and it never runs away faster than you can read.
 *
 * `step()` must return whether the value actually MOVED. false ends the
 * repeat, so a hold that reaches min/max stops instead of ticking against the
 * bound (the button's own `disabled` can't be relied on to fire a press-out).
 *
 * Selection haptics belong here, not in the caller's setter: at full speed one
 * tick per value is a buzz rather than feedback, so they are thinned to at
 * most one per HAPTIC_GAP_MS. Callers must NOT fire their own.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';

import { haptics } from '@/lib/shims';

/** Quiet beat before a hold becomes a repeat — long enough that a deliberate
 * single tap never trips it. */
const HOLD_DELAY_MS = 320;
/** First gap after the hold fires, then × DECAY per tick until FLOOR_MS. */
const START_MS = 170;
const FLOOR_MS = 32;
const DECAY = 0.82;
/** Floor on the gap between selection ticks once the repeat outruns them. */
const HAPTIC_GAP_MS = 60;

export interface HoldRepeatHandlers {
  onPress: () => void;
  onLongPress: () => void;
  onPressOut: () => void;
  delayLongPress: number;
}

/**
 * Spread the result onto a Pressable: `<Pressable {...useHoldRepeat(step)} />`.
 * @param step Applies one increment. Returns false when the value is already
 * at its bound, which ends an in-flight repeat.
 */
export function useHoldRepeat(step: () => boolean): HoldRepeatHandlers {
  // The repeat re-reads the callback each tick, so a step closing over fresh
  // props stays correct across the hold.
  const stepRef = useRef(step);
  useEffect(() => {
    stepRef.current = step;
  });

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stop = useCallback(() => {
    if (timer.current != null) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  }, []);

  // A sheet dismissed under the finger must not leave a timer stepping a
  // torn-down screen.
  useEffect(() => stop, [stop]);

  return useMemo(() => {
    /** `sinceHaptic` counts ms of silence already banked when the tick lands. */
    const schedule = (interval: number, sinceHaptic: number) => {
      timer.current = setTimeout(() => {
        timer.current = null;
        if (!stepRef.current()) return; // hit the bound — nothing left to scroll
        const silent = sinceHaptic + interval;
        const ticked = silent >= HAPTIC_GAP_MS;
        if (ticked) haptics.selection();
        schedule(Math.max(FLOOR_MS, interval * DECAY), ticked ? 0 : silent);
      }, interval);
    };

    return {
      onPress: () => {
        if (stepRef.current()) haptics.selection();
      },
      onLongPress: () => {
        stop();
        if (!stepRef.current()) return;
        haptics.selection();
        schedule(START_MS, 0);
      },
      onPressOut: stop,
      delayLongPress: HOLD_DELAY_MS,
    };
  }, [stop]);
}
