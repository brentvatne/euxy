/**
 * StepStripGlow — the Skia rendering path for the step strip's light layer
 * (ROADMAP "Animation tech notes", behind `SKIA_STRIP_GLOW`).
 *
 * The block fills stay plain Views (they render once and never animate);
 * this overlay replaces ONLY the light layer — steady sequenced-step LEDs
 * and the travelling playhead — with Skia:
 *
 *   • steady LEDs get real emissive bloom (BlurMask halo under a hot core)
 *     instead of the iOS-only shadowRadius approximation;
 *   • the playhead light gets a phosphor trail — the previous steps hold a
 *     decaying ember that fades over the step interval;
 *   • on a HIT step the head still goes dark (the black dot), same as the
 *     plain path.
 *
 * TWO CANVASES, deliberately (perf, audit 2026-07-25): a Skia canvas
 * re-rasterizes ENTIRELY whenever any value bound into it changes. The trail
 * decays continuously between steps, so a single canvas meant the static
 * sequenced-step layer — 3 circles per hit, one of them blurred — was being
 * re-rasterized at display rate, per lane, for content that only changes when
 * the pattern does. The steady LEDs now live in their own canvas with NO
 * animated values bound (it renders once and stays put) and only the small
 * head+trail canvas repaints.
 *
 * The head+trail canvas also UNMOUNTS while the screen is blurred (`active`):
 * the playhead keeps running under a full-detent sheet or another tab, and an
 * invisible canvas painting at 60fps is the same waste principle 6 forbids
 * when stopped.
 *
 * Quantize-first architecture (unchanged): ONE derived integer step from
 * `playheadTick` drives every position/opacity; Skia binds Reanimated shared
 * values directly, so nothing re-renders on the tick.
 *
 * Grey palette only — the glow is white light at varying brightness.
 */
import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import {
  Easing,
  ReduceMotion,
  useAnimatedReaction,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { timing } from '@/theme/tokens';
import {
  LED,
  LED_TOP,
  stepLeft,
  stepStripHeight,
  stepTop,
} from './step-strip-layout';

/** Canvas bleed so the bloom never clips at the strip edges. */
const PAD = 12;

/** LED center within its block. */
const CY = LED_TOP + LED / 2;

/** Phosphor trail: ember opacity per step behind the head. */
const TRAIL = [0.4, 0.22, 0.1];

/** Trail decay bounds — a very slow tempo shouldn't smear embers forever, a
 * very fast one shouldn't strobe them. */
const TRAIL_MIN_MS = 60;
const TRAIL_MAX_MS = 250;

export function StepStripGlow({
  lane,
  pattern,
  blockW,
  width,
  active = true,
}: {
  lane: Lane;
  pattern: number[];
  blockW: number;
  width: number;
  /** False while the host screen is blurred (covered by a sheet, another tab):
   * the animated canvas unmounts instead of painting where nobody looks. */
  active?: boolean;
}) {
  const n = pattern.length;
  const gridH = stepStripHeight(n);
  const canvasSize = { width: width + PAD * 2, height: gridH + PAD * 2 };

  const cxAt = (s: number) => PAD + stepLeft(s, blockW) + blockW / 2;
  const cyAt = (s: number) => PAD + stepTop(s) + CY;

  return (
    <>
      {/* Steady sequenced-step LEDs — real emissive bloom. Nothing animated is
          bound here, so this canvas rasterizes once and holds. */}
      <Canvas pointerEvents="none" style={[styles.canvas, canvasSize]}>
        {pattern.map((hit, i) =>
          hit ? (
            <Circle key={`glow-${i}`} cx={cxAt(i)} cy={cyAt(i)} r={4.5} color="#FFFFFF" opacity={0.55}>
              <BlurMask blur={4} style="normal" />
            </Circle>
          ) : null,
        )}
        {pattern.map((hit, i) =>
          hit ? (
            <Circle key={`core-${i}`} cx={cxAt(i)} cy={cyAt(i)} r={LED / 2} color="#FFFFFF" />
          ) : null,
        )}
        {pattern.map((hit, i) =>
          hit ? (
            <Circle
              key={`ring-${i}`}
              cx={cxAt(i)}
              cy={cyAt(i)}
              r={LED / 2 + 0.5}
              color="rgba(0,0,0,0.45)"
              style="stroke"
              strokeWidth={1}
            />
          ) : null,
        )}
      </Canvas>

      {active ? (
        <PlayheadLayer
          lane={lane}
          pattern={pattern}
          blockW={blockW}
          canvasSize={canvasSize}
        />
      ) : null}
    </>
  );
}

/**
 * The travelling light: head (light on empty steps / black dot on hits) plus
 * the phosphor trail behind it. The only canvas that repaints on the tick.
 */
function PlayheadLayer({
  lane,
  pattern,
  blockW,
  canvasSize,
}: {
  lane: Lane;
  pattern: number[];
  blockW: number;
  canvasSize: { width: number; height: number };
}) {
  const res = lane.resolutionTicks;
  const len = lane.length;
  const reducedMotion = useReducedMotion();

  // Trail length rides the STEP INTERVAL, not wall time (principle 2): a fixed
  // 250ms decay smeared embers into each other at fast tempos and died before
  // the next step at slow ones. Bucketed to 5 BPM so record mode's ~2/s device
  // tempo updates can't re-render every strip — the trail-length difference
  // inside a bucket is invisible.
  const bpmBucket = useStore((s) => Math.round(s.transport.bpm / 5) * 5);
  const trailMs = Math.min(
    TRAIL_MAX_MS,
    Math.max(TRAIL_MIN_MS, (60000 / (Math.max(20, bpmBucket) * timing.ppqn)) * res),
  );

  const step = useDerivedValue(() =>
    res > 0 && len > 0 ? Math.floor(playheadTick.value / res) % len : 0,
  );

  const cxAt = (s: number) => {
    'worklet';
    return PAD + stepLeft(s, blockW) + blockW / 2;
  };
  const cyAt = (s: number) => {
    'worklet';
    return PAD + stepTop(s) + CY;
  };

  // Phosphor phase: restarts 0 → 1 on every step so the embers decay
  // CONTINUOUSLY between musical events (attack instant, decay over the step —
  // LED-motion principle 1), still zero JS round-trips. Restarting per step is
  // by design: each 16th is a fresh musical event, not a re-press.
  const phase = useSharedValue(1);
  useAnimatedReaction(
    () => step.value,
    (s, prev) => {
      if (prev !== null && s !== prev) {
        phase.value = 0;
        phase.value = withTiming(1, {
          duration: trailMs,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        });
      }
    },
  );

  const headCx = useDerivedValue(() => cxAt(step.value));
  const headCy = useDerivedValue(() => cyAt(step.value));
  const headLightOpacity = useDerivedValue(() =>
    playheadPlaying.value && pattern[step.value] !== 1 ? 1 : 0,
  );
  const headDarkOpacity = useDerivedValue(() =>
    playheadPlaying.value && pattern[step.value] === 1 ? 1 : 0,
  );

  // Trail embers — one per slot, positions wrap with the lane. Reduced Motion
  // keeps the head (it's the load-bearing "where am I" light) and drops the
  // decorative trail entirely.
  const trail = TRAIL.map((base, idx) => {
    const k = idx + 1;
    /* eslint-disable react-hooks/rules-of-hooks -- TRAIL is constant */
    const cx = useDerivedValue(() => cxAt((((step.value - k) % len) + len) % len));
    const cy = useDerivedValue(() => cyAt((((step.value - k) % len) + len) % len));
    const opacity = useDerivedValue(() =>
      playheadPlaying.value && len > k ? base * (1 - 0.55 * phase.value) : 0,
    );
    /* eslint-enable react-hooks/rules-of-hooks */
    return { k, cx, cy, opacity };
  });

  return (
    <Canvas pointerEvents="none" style={[styles.canvas, canvasSize]}>
      {/* Phosphor trail behind the head (drawn under the head light). */}
      {reducedMotion
        ? null
        : trail.map(({ k, cx, cy, opacity }) => (
            <Circle key={`trail-${k}`} cx={cx} cy={cy} r={3.5} color="#F6F4F4" opacity={opacity}>
              <BlurMask blur={3.5} style="normal" />
            </Circle>
          ))}

      {/* Head on an EMPTY step: hot core + wide bloom. */}
      <Circle cx={headCx} cy={headCy} r={6} color="#FFFFFF" opacity={headLightOpacity}>
        <BlurMask blur={6} style="normal" />
      </Circle>
      <Circle cx={headCx} cy={headCy} r={2.8} color="#FFFFFF" opacity={headLightOpacity} />

      {/* Head on a HIT step: the black dot with a faint light rim (the LED
          goes dark but stays present — Paper 2026-07-24 revision). */}
      <Circle cx={headCx} cy={headCy} r={3} color="#08080A" opacity={headDarkOpacity} />
      <Circle
        cx={headCx}
        cy={headCy}
        r={3.5}
        color="rgba(255,255,255,0.35)"
        style="stroke"
        strokeWidth={1}
        opacity={headDarkOpacity}
      />
    </Canvas>
  );
}

const styles = StyleSheet.create({
  canvas: { position: 'absolute', top: -PAD, left: -PAD },
});
