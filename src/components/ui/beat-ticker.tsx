/**
 * BeatTicker — transport LED beat strip (LED-motion spec, concept E): four
 * cells under the BPM readout walk the current beat 1-2-3-4 while the
 * transport runs. Everything rhythmic derives from the shared playhead
 * (`playheadTick` @ 24 PPQN) quantized FIRST to an integer beat, so styles
 * re-run per musical event — never per frame. Attack is instant, the
 * previous cell decays on a ~320ms phosphor tail (principle 1), and only
 * opacity animates over a stacked pre-lit layer (grey palette: rest
 * #2C2C2E · lit #AFAFB3).
 *
 * Record mode: during the device count-in the clock is HELD at tick 0, so
 * the walk runs off `transport.countInBeat` (JS state mirrored into a shared
 * value) — the ticker moves before any sound starts. Once recording, the
 * active cell blinks 8th notes read straight off the tick. Stopped =
 * settled: every cell decays to rest.
 */
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { timing } from '@/theme/tokens';

const PPQN = timing.ppqn; // 24 ticks per beat; 12 per 8th

/** Phosphor tail for the cell the beat just left (principle 1: 250–400ms). */
const DECAY = {
  duration: 320,
  easing: Easing.out(Easing.quad),
  reduceMotion: ReduceMotion.System,
} as const;

/** LED-motion grey palette (locked): rest / lit. */
const REST = '#2C2C2E';
const LIT = '#AFAFB3';

export interface BeatTickerProps {
  /** 1-based count-in beat while the record count-in runs; 0 otherwise.
   * Overrides the tick-derived beat (the clock is held at 0 during it). */
  countInBeat?: number;
  /** While recording, the active cell blinks 8th notes off the tick. */
  recording?: boolean;
}

export function BeatTicker({ countInBeat = 0, recording = false }: BeatTickerProps) {
  // JS transport state mirrored into shared values so the beat derivation
  // stays a pure UI-thread worklet.
  const countInSV = useSharedValue(countInBeat);
  const recordingSV = useSharedValue(recording ? 1 : 0);
  useEffect(() => {
    countInSV.value = countInBeat;
    recordingSV.value = recording ? 1 : 0;
  }, [countInBeat, recording, countInSV, recordingSV]);

  // Quantize FIRST: one integer beat per musical event (-1 = settled).
  const beat = useDerivedValue(() => {
    if (countInSV.value > 0) return (countInSV.value - 1) % 4;
    if (playheadPlaying.value) return Math.floor(playheadTick.value / PPQN) % 4;
    return -1;
  });

  // Per-cell brightness: instant attack on arrival, timed decay on departure.
  const g0 = useSharedValue(0);
  const g1 = useSharedValue(0);
  const g2 = useSharedValue(0);
  const g3 = useSharedValue(0);
  const glows = [g0, g1, g2, g3];

  useAnimatedReaction(
    () => beat.value,
    // Writes below are Reanimated SharedValue assignments running on the UI
    // thread inside a worklet, never during render. The React Compiler rules
    // model a SharedValue as frozen and flag the whole callback; false positive.
    // eslint-disable-next-line react-hooks/immutability
    (cur, prev) => {
      if (cur === prev) return;
      if (cur === -1) {
        // Transport stopped — everything settles on the phosphor tail.
        for (const g of glows) g.value = withTiming(0, DECAY);
        return;
      }
      if (prev != null && prev >= 0) glows[prev].value = withTiming(0, DECAY);
      glows[cur].value = 1; // instant attack — never fade in
    },
  );

  // Recording blink: gate the ACTIVE cell at 8th notes (12 ticks), read off
  // the same quantized clock. 1 elsewhere so jam playback stays steady.
  const blink = useDerivedValue<number>(() => {
    if (recordingSV.value === 1 && playheadPlaying.value) {
      return Math.floor(playheadTick.value / (PPQN / 2)) % 2 === 0 ? 1 : 0.2;
    }
    return 1;
  });

  return (
    <View style={styles.strip} pointerEvents="none" accessible={false}>
      {glows.map((glow, i) => (
        <Cell key={i} index={i} beat={beat} glow={glow} blink={blink} />
      ))}
    </View>
  );
}

function Cell({
  index,
  beat,
  glow,
  blink,
}: {
  index: number;
  beat: SharedValue<number>;
  glow: SharedValue<number>;
  blink: SharedValue<number>;
}) {
  // Stacked pre-lit layer: the rest cell is always painted; only the lit
  // overlay's opacity animates (no color animation, no layout).
  const litStyle = useAnimatedStyle(() => ({
    opacity: glow.value * (beat.value === index ? blink.value : 1),
  }));
  return (
    <View style={styles.cell}>
      <Animated.View style={[styles.lit, litStyle]} />
    </View>
  );
}

const styles = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 4, marginTop: 4 },
  cell: {
    width: 8,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: REST,
    overflow: 'hidden',
  },
  lit: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 1.5,
    backgroundColor: LIT,
  },
});
