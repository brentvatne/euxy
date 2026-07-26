/**
 * ValueFilm — a brightness blip behind a numeric readout when its value
 * changes. On a hardware instrument a value that commits is acknowledged by
 * light; ours committed with a haptic and nothing to see (audit 2026-07-25).
 *
 * Deliberately scoped to DISCRETE, user-initiated commits (a ± press): a film
 * behind a value that changes continuously — a slider drag, or record mode's
 * ~2/s device tempo — would be constant flicker, which the frequency rule
 * (no decoration on constantly-changing surfaces) forbids outright.
 *
 * Stays mounted once armed and retriggers per change (principle 7), so
 * key-repeat retargets a mid-decay film instead of remounting it. Reduced
 * Motion renders nothing at all: the value itself is the settled frame, and
 * the haptic already carries the commit.
 */
import { useEffect, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { FlickerBloom } from './flicker-bloom';

export function ValueFilm({
  value,
  peak = 0.22,
  style,
}: {
  /** The committed value — a change (not the initial render) fires the blip. */
  value: number | string;
  /** Peak opacity of the film. Keep it a wash: this sits under text. */
  peak?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const [trigger, setTrigger] = useState(0);
  const prev = useRef(value);
  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setTrigger((t) => t + 1);
  }, [value]);
  // Nothing rendered until the first real change, so opening a sheet never
  // blips the value it merely displays.
  if (reduceMotion || trigger === 0) return null;
  return <FlickerBloom mode="pulse" trigger={trigger} peak={peak} style={style} />;
}
