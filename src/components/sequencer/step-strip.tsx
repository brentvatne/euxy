/**
 * StepStrip — a lane's step blocks in the full OP-XY hardware convention
 * (Paper "01 · Sequencer" gradient revision): block fills always sweep the
 * sequencer-key ramp (`keyRamp`, 8 shades × 2 slots per 16-slot row) exactly
 * like the device's key row — fills never encode the sequence. Every
 * SEQUENCED step carries a steady white LED at its top-center (the key
 * lights), and the playhead is the light travelling the grid — on an empty
 * step the light appears; where it crosses a sequenced step it becomes a
 * prominent BLACK dot. No cyan.
 *
 * ALL steps are always visible (no horizontal scrolling): like the Lane
 * Editor's combined card, a lane wraps at 16 steps per row, and every lane
 * sizes its blocks against exactly 16 slots — a short lane (8, 12) keeps the
 * same block size and leaves trailing space; a 64-step lane is 4 rows.
 *
 * The travelling light is two UI-thread overlays sharing one derived step:
 *   • `Light` — an LED shown only while the current step is EMPTY
 *   • `Dark`  — the black dot, shown only while the current step is a HIT
 * Blocks render once; NOTHING re-renders on the tick.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion } from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { patternForLane } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { keyRamp } from '@/theme/tokens';
import { FlickerBloom } from '@/components/ui/flicker-bloom';
import { Led as LedBase } from '@/components/ui/led';
import { SKIA_STRIP_GLOW } from '@/lib/flags';
import { StepStripGlow } from './step-strip-skia';

const PER_ROW = 16;
const GAP = 4;
const BLOCK_H = 22;
const RADIUS = 4;
const LED = 5;
const LED_TOP = 3;

export interface StepStripProps {
  lane: Lane;
  /** Base ms added to this strip's wash blooms — the sequencer screen passes
   * each lane's distance from the capsule so washes sweep the grid FROM the
   * capsule (bottom lane first), not per-strip in isolation. */
  washDelay?: number;
  /** False while the host screen is blurred: the playhead layer stops painting
   * (see ui/use-screen-focused). */
  active?: boolean;
}

/** Per-cell stagger (ms) by Manhattan distance from a strip's bottom-right
 * cell — the corner nearest the capsule. */
const CELL_STAGGER_MS = 12;

/** One per-step lit film (see the `films` state in StepStrip). */
type Film = {
  /** Bumped per change event — retriggers the mounted film's sequence. */
  trigger: number;
  delay: number;
  peak: number;
  mode: 'fade' | 'pulse';
  /** JS timestamp of the film's last trigger, for idle pruning. */
  at: number;
};
/** Horizon after which a film's sequence (delay excluded) is safely over:
 * fade = 80 + 380, pulse = 300 — 600ms clears both with margin. */
const FILM_MS = 600;

/** Steady sequenced-step light (Paper: 5px white, dark ring, soft glow).
 * Instant on with a scale bloom, ~300ms phosphor decay off (LED-motion
 * principle 1 + the on/off micro-animation). */
function Led({ ignite }: { ignite: boolean }) {
  return <LedBase ignite={ignite} style={styles.led} />;
}

export function StepStrip({ lane, washDelay = 0, active = true }: StepStripProps) {
  const pattern = patternForLane(lane);
  const n = pattern.length;
  const [width, setWidth] = useState(0);

  // Concept J (mutate): steps the mutation nudged bloom IN PLACE with a
  // smooth fade, all at once — in sync with the instant pattern swap. Detected by diffing the pattern across a
  // mutateVersion bump (mutate/revert both bump it; slider edits do not).
  // Grid-wide one-shots ride the store's gridFx nonce instead: 'revert' is
  // the reverse wash over every sequenced LED (same capsule-origin stagger),
  // 'stamp' is ONE synchronized soft pulse on the sequenced LEDs. All of it
  // is triggered off state changes, never the clock. Reduced Motion settles
  // instantly.
  const mutateVersion = useStore((s) => s.mutateVersion);
  const gridFx = useStore((s) => s.gridFx);
  const reducedMotion = useReducedMotion();
  const prevRef = useRef({ version: mutateVersion, pattern, fxNonce: gridFx?.nonce ?? 0 });
  // Films: ONE mounted FlickerBloom per recently-changed step, keyed by the
  // STEP (stable) — never remounted while animating. Each event bumps the
  // film's `trigger`, and the sequence redirects from its current opacity
  // (Reanimated retargets in-flight), so dice-mashing is fully interruptible:
  // no stacked films, no one-frame cut. Films unmount only once idle.
  const [films, setFilms] = useState<Record<string, Film>>({});
  const triggerRef = useRef(0);
  // LEDs mounted in this strip's FIRST render must not run the ignition
  // bloom — only lights added by later edits ignite (see ui/led.tsx).
  const initialRender = useRef(true);
  useEffect(() => {
    initialRender.current = false;
  }, []);
  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { version: mutateVersion, pattern, fxNonce: gridFx?.nonce ?? 0 };
    if (reducedMotion) return;
    // Distance from the bottom-right cell — the corner nearest the capsule.
    const rows = Math.ceil(pattern.length / PER_ROW);
    const dist = (i: number) =>
      rows - 1 - Math.floor(i / PER_ROW) + (PER_ROW - 1 - (i % PER_ROW));
    const fxChanged = gridFx != null && gridFx.nonce !== prev.fxNonce;
    let next: { cells: { step: number; delay: number }[]; peak: number; mode: Film['mode'] } | null =
      null;
    if (fxChanged) {
      const lit = pattern.map((v, i) => ({ v, i })).filter((c) => c.v === 1);
      next =
        gridFx.kind === 'revert'
          ? {
              cells: lit.map((c) => ({ step: c.i, delay: washDelay + dist(c.i) * CELL_STAGGER_MS })),
              peak: 0.45,
              mode: 'fade',
            }
          : {
              cells: lit.map((c) => ({ step: c.i, delay: 0 })),
              peak: 0.45,
              mode: 'pulse',
            };
    } else if (mutateVersion !== prev.version) {
      const changed: { step: number; delay: number }[] = [];
      const len = Math.min(prev.pattern.length, pattern.length);
      for (let i = 0; i < len; i++) {
        if (prev.pattern[i] !== pattern[i]) {
          // NO stagger here: the pattern itself swaps instantly, so a delayed
          // highlight reads as a glitch arriving after the fact (Brent
          // 2026-07-25). The capsule-origin sweep lives on in the revert wash.
          changed.push({ step: i, delay: 0 });
        }
      }
      if (changed.length > 0) {
        // Smooth fade, not the flicker — the per-step sparkle read as jitter
        // on a real dice press (Brent 2026-07-25).
        next = { cells: changed, peak: 0.5, mode: 'fade' };
      }
    }
    if (!next) return;
    const { cells, peak, mode } = next;
    const trigger = ++triggerRef.current;
    const now = Date.now();
    setFilms((prev) => {
      const merged: Record<string, Film> = {};
      for (const [k, f] of Object.entries(prev)) {
        // Films still animating stay mounted UNTOUCHED (they finish their
        // own decay); only the long-finished are dropped here.
        if (now - f.at < f.delay + FILM_MS) merged[k] = f;
      }
      for (const c of cells) {
        merged[c.step] = { trigger, delay: c.delay, peak, mode, at: now };
      }
      return merged;
    });
    // Idle sweep: once presses stop, empty the map so idle strips carry zero
    // extra views. Any newer event re-arms this via the effect cleanup, and
    // by the time the LAST event's timer fires every earlier film is done.
    const maxDelay = cells.reduce((m, c) => Math.max(m, c.delay), 0);
    const t = setTimeout(() => setFilms({}), maxDelay + FILM_MS + 100);
    return () => clearTimeout(t);
    // `pattern` is recomputed per render; the version/nonce gates do the diff.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutateVersion, gridFx, reducedMotion]);

  const blockW = width > 0 ? (width - GAP * (PER_ROW - 1)) / PER_ROW : 0;

  const rows: number[][] = [];
  for (let i = 0; i < n; i += PER_ROW) {
    rows.push(Array.from({ length: Math.min(PER_ROW, n - i) }, (_, j) => i + j));
  }

  return (
    <View style={styles.root} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {blockW > 0
        ? rows.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((i) => (
                <View
                  key={i}
                  style={[
                    styles.block,
                    { width: blockW },
                    // Fill = the OP-XY key ramp for this row slot (hardware
                    // convention: fills never encode the sequence — the LEDs
                    // do). Every 16-slot row sweeps the full ramp.
                    { backgroundColor: keyRamp[Math.floor((i % PER_ROW) / 2)] },
                  ]}
                >
                  {/* Skia path draws the steady LEDs itself (with real bloom). */}
                  {pattern[i] && !SKIA_STRIP_GLOW ? <Led ignite={!initialRender.current} /> : null}
                </View>
              ))}
            </View>
          ))
        : null}
      {blockW > 0 ? (
        SKIA_STRIP_GLOW ? (
          <StepStripGlow
            lane={lane}
            pattern={pattern}
            blockW={blockW}
            width={width}
            active={active}
          />
        ) : active ? (
          <TravellingLight lane={lane} pattern={pattern} blockW={blockW} />
        ) : null
      ) : null}
      {blockW > 0
        ? Object.entries(films).map(([key, f]) => {
            const step = Number(key);
            // Length can shrink under a decaying film — never draw past the grid.
            if (step >= pattern.length) return null;
            return (
              <FlickerBloom
                key={key}
                trigger={f.trigger}
                delay={f.delay}
                peak={f.peak}
                mode={f.mode}
                style={[
                  styles.bloom,
                  {
                    left: (step % PER_ROW) * (blockW + GAP),
                    top: Math.floor(step / PER_ROW) * (BLOCK_H + GAP),
                    width: blockW,
                  },
                ]}
              />
            );
          })
        : null}
    </View>
  );
}

/**
 * The playhead: one derived step position drives two overlays — the light
 * (visible on empty steps) and the black dot on hit steps. Position wraps
 * with the grid (x = step % 16, y = row).
 */
function TravellingLight({
  lane,
  pattern,
  blockW,
}: {
  lane: Lane;
  pattern: number[];
  blockW: number;
}) {
  const res = lane.resolutionTicks;
  const len = lane.length;

  const step = useDerivedValue(() =>
    res > 0 && len > 0 ? Math.floor(playheadTick.value / res) % len : 0,
  );

  const lightStyle = useAnimatedStyle(() => {
    const s = step.value;
    return {
      opacity: playheadPlaying.value && pattern[s] !== 1 ? 1 : 0,
      transform: [
        { translateX: (s % PER_ROW) * (blockW + GAP) },
        { translateY: Math.floor(s / PER_ROW) * (BLOCK_H + GAP) },
      ],
    };
  });
  const darkStyle = useAnimatedStyle(() => {
    const s = step.value;
    return {
      opacity: playheadPlaying.value && pattern[s] === 1 ? 1 : 0,
      transform: [
        { translateX: (s % PER_ROW) * (blockW + GAP) },
        { translateY: Math.floor(s / PER_ROW) * (BLOCK_H + GAP) },
      ],
    };
  });

  return (
    <>
      <Animated.View pointerEvents="none" style={[styles.overlay, { width: blockW }, lightStyle]}>
        <View style={styles.led} />
      </Animated.View>
      <Animated.View pointerEvents="none" style={[styles.overlay, { width: blockW }, darkStyle]}>
        <View style={styles.darkDot} />
      </Animated.View>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, position: 'relative', gap: GAP },
  row: { flexDirection: 'row', gap: GAP },
  block: {
    height: BLOCK_H,
    borderRadius: RADIUS,
    alignItems: 'center',
    paddingTop: LED_TOP,
  },
  led: {
    width: LED,
    height: LED,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
    // Soft emissive glow (iOS).
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.7,
    shadowRadius: 2.5,
    shadowOffset: { width: 0, height: 0 },
  },
  // Playhead-on-hit: the light goes dark but stays PRESENT — a black dot
  // with a faint light rim (Paper 2026-07-24 revision).
  darkDot: {
    width: LED + 1,
    height: LED + 1,
    borderRadius: 999,
    backgroundColor: '#08080a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  // Concept J: lit film over a nudged step (grey `lit`, opacity-only).
  bloom: {
    position: 'absolute',
    height: BLOCK_H,
    borderRadius: RADIUS,
    backgroundColor: '#AFAFB3',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    height: BLOCK_H,
    alignItems: 'center',
    paddingTop: LED_TOP,
  },
});
