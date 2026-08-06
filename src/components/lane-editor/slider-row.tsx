/**
 * SliderRow — label + value readout over a real native slider (Paper nodes
 * 12E-0 / DR-0: Velocity, Gate). Uses @expo/ui's community Slider drop-in
 * (SwiftUI-backed): a native control needs no gesture arbitration against the
 * parent scroll view, and the monochrome look comes from tint props — no
 * hand-rolled PanResponder/track math.
 *
 * The store commit is THROTTLED; the readout is not. SwiftUI fires one event
 * per step crossed, so a fast sweep of Velocity (1…127, step 1) used to push
 * ~126 `updateLane` calls a second through the store, each cloning the active
 * pattern and re-rendering the sequencer underneath the sheet. The engine is a
 * JS-thread lookahead scheduler with only 100ms of buffer in CoreMIDI
 * (theme/tokens `timing`), so that stalled playback while you dragged — Brent,
 * 2026-08-06. `local` keeps the number under the finger honest at frame rate
 * while the store hears from us at most every COMMIT_MS.
 */
import { Slider } from '@expo/ui/community/slider';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { haptics } from '@/lib/shims';
import { color, font, space } from '@/theme/tokens';
import { AppText } from '@/components/ui';

export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the trailing value readout (defaults to the raw number). */
  formatValue?: (value: number) => string;
  /** Landmark values that get a harder, detent-like haptic while dragging
   * (e.g. 16/32/48/64 on Steps) — every other step ticks like an encoder. */
  accentValues?: readonly number[];
}

/** Longest the store may lag the finger. ~8× fewer commits on a fast sweep,
 * still well inside the frame budget for hearing a velocity change live. */
const COMMIT_MS = 60;

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
  accentValues,
}: SliderRowProps) {
  // Encoder feel: one selection tick per stepped value crossed, a rigid
  // detent on landmarks. The ref gates repeat events at the same step.
  const lastTicked = useRef(value);

  // The value under the finger, ahead of what the store has caught up to.
  // Cleared once they agree, so the row goes back to reading straight from the
  // lane (a revert, a preset restore, a dice roll all still land here).
  const [local, setLocal] = useState<number | null>(null);
  const shown = local ?? value;
  // Track what is DISPLAYED, not what the store holds: mid-drag those differ,
  // and seeding the detent gate from the lagging store value would swallow the
  // tick (and the commit) for a finger that moved back onto it.
  useEffect(() => {
    lastTicked.current = shown;
  }, [shown]);

  // Kept in a ref so the throttle's trailing timer always commits through the
  // CURRENT handler — `onChange` is an inline closure over the lane.
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const lastCommitAt = useRef(0);
  const trailing = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queued = useRef<number | null>(null);

  const commit = (next: number) => {
    lastCommitAt.current = Date.now();
    queued.current = null;
    onChangeRef.current(next);
    // The store now HOLDS this number (Zustand's set is synchronous), so hand
    // the readout back to the lane. Clearing here rather than from an effect
    // keeps `local` a strictly-ahead-of-store value with no window in which a
    // dice roll or a preset restore could be masked by a stale drag position.
    setLocal(null);
  };

  /** Leading + trailing: the first move of a drag lands immediately, and the
   * value the finger stopped on always lands too. */
  const commitThrottled = (next: number) => {
    queued.current = next;
    const since = Date.now() - lastCommitAt.current;
    if (since >= COMMIT_MS) {
      if (trailing.current != null) {
        clearTimeout(trailing.current);
        trailing.current = null;
      }
      commit(next);
      return;
    }
    if (trailing.current != null) return;
    trailing.current = setTimeout(() => {
      trailing.current = null;
      if (queued.current != null) commit(queued.current);
    }, COMMIT_MS - since);
  };

  // Closing the sheet mid-drag must not silently drop the last value.
  useEffect(
    () => () => {
      if (trailing.current != null) clearTimeout(trailing.current);
      if (queued.current != null) onChangeRef.current(queued.current);
    },
    [],
  );
  // SwiftUI's Slider asserts on an EMPTY range (min == max) — at Steps = 1
  // the rotate sliders got 0…0 and crash-looped the sheet (TestFlight 1.2.0
  // (6)). Give the native control a non-empty range and disable it instead.
  const empty = max <= min;
  const safeMax = empty ? min + step : max;
  return (
    <View style={[styles.row, empty && styles.rowDisabled]}>
      <View style={styles.head}>
        <AppText style={styles.label}>{label}</AppText>
        <AppText style={styles.value}>{formatValue ? formatValue(shown) : String(shown)}</AppText>
      </View>
      <Slider
        value={shown}
        minimumValue={min}
        maximumValue={safeMax}
        step={step}
        disabled={empty}
        minimumTrackTintColor="#EBEBEB"
        maximumTrackTintColor={color.surface2}
        thumbTintColor={color.label}
        onValueChange={(v) => {
          const next = Math.round(v / step) * step;
          if (next === lastTicked.current) return;
          lastTicked.current = next;
          if (accentValues?.includes(next)) haptics.impact('rigid');
          else haptics.selection();
          setLocal(next);
          commitThrottled(next);
        }}
        style={styles.slider}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.xs },
  rowDisabled: { opacity: 0.4 },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: font.text, fontWeight: '500', fontSize: 14, lineHeight: 18, color: color.label25 },
  value: { fontFamily: font.text, fontWeight: '600', fontSize: 14, lineHeight: 18, color: color.label },
  slider: { height: 28 },
});
