/**
 * StepStripGlow — the Skia rendering path for the step strip's light layer
 * (ROADMAP "Animation tech notes" → Skia shaders prototype, behind
 * `SKIA_STRIP_GLOW`).
 *
 * The block fills stay plain Views (they render once and never animate);
 * this overlay replaces ONLY the light layer — steady sequenced-step LEDs
 * and the travelling playhead — with a single Canvas per lane strip:
 *
 *   • steady LEDs get real emissive bloom (BlurMask halo under a hot core)
 *     instead of the iOS-only shadowRadius approximation;
 *   • the playhead light gets a phosphor trail — the previous steps hold a
 *     decaying ember that fades over the step interval;
 *   • on a HIT step the head still goes dark (the black dot), same as the
 *     plain path.
 *
 * Quantize-first architecture (unchanged): ONE derived integer step from
 * `playheadTick` drives every position/opacity; Skia binds Reanimated shared
 * values directly, so nothing re-renders on the tick and the whole strip is
 * one native view instead of ~2 overlays + N LED views.
 *
 * Grey palette only — the glow is white light at varying brightness.
 */
import { BlurMask, Canvas, Circle } from '@shopify/react-native-skia';
import { StyleSheet } from 'react-native';
import {
  Easing,
  useAnimatedReaction,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import type { Lane } from '@/state/types';

// Geometry — MUST stay in sync with step-strip.tsx (kept separate so the
// plain path never imports Skia; unify if the flag graduates).
const PER_ROW = 16;
const GAP = 4;
const BLOCK_H = 22;
const LED = 5;
const LED_TOP = 3;

/** Canvas bleed so the bloom never clips at the strip edges. */
const PAD = 12;

/** LED center within its block. */
const CY = LED_TOP + LED / 2;

/** Phosphor trail: ember opacity per step behind the head. */
const TRAIL = [0.4, 0.22, 0.1];

export function StepStripGlow({
  lane,
  pattern,
  blockW,
  width,
}: {
  lane: Lane;
  pattern: number[];
  blockW: number;
  width: number;
}) {
  const res = lane.resolutionTicks;
  const len = lane.length;
  const n = pattern.length;
  const rows = Math.ceil(n / PER_ROW);
  const gridH = rows * BLOCK_H + (rows - 1) * GAP;

  const step = useDerivedValue(() =>
    res > 0 && len > 0 ? Math.floor(playheadTick.value / res) % len : 0,
  );

  // Phosphor phase: restarts 0 → 1 on every step so the embers decay
  // CONTINUOUSLY between musical events (attack instant, decay ~250ms —
  // LED-motion principle 1), still zero JS round-trips.
  const phase = useSharedValue(1);
  useAnimatedReaction(
    () => step.value,
    (s, prev) => {
      if (prev !== null && s !== prev) {
        phase.value = 0;
        phase.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
      }
    },
  );

  const cxAt = (s: number) => {
    'worklet';
    return PAD + (s % PER_ROW) * (blockW + GAP) + blockW / 2;
  };
  const cyAt = (s: number) => {
    'worklet';
    return PAD + Math.floor(s / PER_ROW) * (BLOCK_H + GAP) + CY;
  };

  // Head (light on empty steps / dark dot on hits).
  const headCx = useDerivedValue(() => cxAt(step.value));
  const headCy = useDerivedValue(() => cyAt(step.value));
  const headLightOpacity = useDerivedValue(() =>
    playheadPlaying.value && pattern[step.value] !== 1 ? 1 : 0,
  );
  const headDarkOpacity = useDerivedValue(() =>
    playheadPlaying.value && pattern[step.value] === 1 ? 1 : 0,
  );

  // Trail embers — one per slot, positions wrap with the lane.
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
    <Canvas
      pointerEvents="none"
      style={[styles.canvas, { width: width + PAD * 2, height: gridH + PAD * 2 }]}
    >
      {/* Steady sequenced-step LEDs — real emissive bloom (static; render once). */}
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

      {/* Phosphor trail behind the head (drawn under the head light). */}
      {trail.map(({ k, cx, cy, opacity }) => (
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
