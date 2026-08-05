/**
 * StepStrip — a lane's step blocks in the full OP-XY hardware convention
 * (Paper "01 · Sequencer" gradient revision): block fills always sweep the
 * sequencer-key ramp (`stepFill`, 16 shades, one per slot in a 16-slot row)
 * like the device's key row — fills never encode the sequence. Every
 * SEQUENCED step carries a steady white LED at its top-center (the key
 * lights), and the playhead is the light travelling the grid — on an empty
 * step the light appears; where it crosses a sequenced step it becomes a
 * prominent BLACK dot. No cyan.
 *
 * ALL steps are always visible (no horizontal scrolling): like the Lane
 * Editor's combined card, a lane wraps at 16 steps per row, and every lane
 * sizes its blocks against exactly 16 slots — a short lane (8, 12) keeps the
 * same block size and leaves trailing space; a 64-step lane is 4 rows. Steps
 * are grouped in fours by a wider gap before each downbeat, so 1 / 5 / 9 / 13
 * are countable at a glance (see step-strip-layout's BEAT_GAP), and each
 * downbeat cell carries a dim inset underline at its bottom edge (V4c) so the
 * beat reads without counting groups.
 *
 * The travelling light is two UI-thread overlays sharing one derived step:
 *   • `Light` — an LED shown only while the current step is EMPTY
 *   • `Dark`  — the black dot, shown only while the current step is a HIT
 * Blocks render once; NOTHING re-renders on the tick.
 */
import { useEffect, useRef, useState } from 'react';
import { useIsFirstRender } from '@/lib/use-is-first-render';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useDerivedValue, useReducedMotion } from 'react-native-reanimated';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { patternForLane } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { stepFill } from '@/theme/tokens';
import { FlickerBloom } from '@/components/ui/flicker-bloom';
import { Led as LedBase } from '@/components/ui/led';
import { SKIA_STRIP_GLOW } from '@/lib/flags';
import {
  BLOCK_H,
  GAP,
  isDownbeat,
  LED,
  LED_TOP,
  PER_ROW,
  stepBlockWidth,
  stepGapBefore,
  stepLeft,
  stepStripHeight,
  stepTop,
  TICK_BOTTOM,
  TICK_H,
  TICK_RADIUS,
  TICK_W,
  tickOnLightFill,
} from './step-strip-layout';
import { StepStripGlow } from './step-strip-skia';

const RADIUS = 4;

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

/** Last width any strip measured. Every strip spans the same lane column, so
 * one that mounts later can paint its blocks on its FIRST frame instead of
 * waiting a layout pass — Restore preset rebuilds every lane at once, and
 * without this the whole grid blanked for ~5 frames before the blocks came
 * back. Re-measured on every onLayout, so a real width change still wins. */
let lastStripWidth = 0;

export function StepStrip({ lane, washDelay = 0, active = true }: StepStripProps) {
  const pattern = patternForLane(lane);
  const n = pattern.length;
  const [width, setWidth] = useState(lastStripWidth);
  // LAYOUT CONTRACT: reserve the lane strip's final height before onLayout
  // measures its width. Keep this derived from the same sequencer-lane
  // geometry that renders the rows and Skia overlay; otherwise the lane
  // LinearTransition can slide the next separator through these cells.
  const reservedHeight = stepStripHeight(n);

  // Concept J (mutate): steps the mutation nudged bloom IN PLACE with a
  // smooth fade, all at once — in sync with the instant pattern swap. Detected by diffing the pattern across a
  // mutateVersion bump (mutate/revert both bump it; slider edits do not).
  // Grid-wide one-shots ride the store's gridFx nonce instead: 'revert' is
  // the reverse wash over every sequenced LED (same capsule-origin stagger),
  // 'reveal' is that wash brighter (the dice charge's release pop), 'stamp' is
  // ONE synchronized soft pulse on the sequenced LEDs. All of it is triggered
  // off state changes, never the clock. Reduced Motion settles instantly.
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
  const isFirstRender = useIsFirstRender();
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
        gridFx.kind === 'stamp'
          ? {
              cells: lit.map((c) => ({ step: c.i, delay: 0 })),
              peak: 0.45,
              mode: 'pulse',
            }
          : {
              // 'revert' and the charge 'reveal' are the same sweep from the
              // capsule — one uncovers the state you came back to, the other
              // the pattern that was churning behind the hold. The reveal is
              // brighter: it lands on a grid that has been smearing for a bar
              // and has to read as the churn resolving.
              cells: lit.map((c) => ({ step: c.i, delay: washDelay + dist(c.i) * CELL_STAGGER_MS })),
              peak: gridFx.kind === 'reveal' ? 0.6 : 0.45,
              mode: 'fade',
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

  const blockW = width > 0 ? stepBlockWidth(width) : 0;

  const rows: number[][] = [];
  for (let i = 0; i < n; i += PER_ROW) {
    rows.push(Array.from({ length: Math.min(PER_ROW, n - i) }, (_, j) => i + j));
  }

  return (
    <View
      style={[styles.root, { minHeight: reservedHeight }]}
      onLayout={(e) => {
        lastStripWidth = e.nativeEvent.layout.width;
        setWidth(lastStripWidth);
      }}
    >
      {blockW > 0
        ? rows.map((row, r) => (
            <View key={r} style={styles.row}>
              {row.map((i) => (
                <View
                  key={i}
                  style={[
                    styles.block,
                    // Beat grouping lives in the gap BEFORE each block, so the
                    // row keeps its width (see step-strip-layout).
                    { width: blockW, marginLeft: stepGapBefore(i) },
                    // Fill = the OP-XY key ramp for this row slot (hardware
                    // convention: fills never encode the sequence — the LEDs
                    // do). Every 16-slot row sweeps the full ramp.
                    { backgroundColor: stepFill(i % PER_ROW) },
                  ]}
                >
                  {/* Skia path draws the steady LEDs itself (with real bloom). */}
                  {pattern[i] && !SKIA_STRIP_GLOW ? <Led ignite={!isFirstRender} /> : null}
                  {isDownbeat(i) ? (
                    <View
                      style={[
                        styles.tick,
                        tickOnLightFill(i) && styles.tickLightFill,
                        { left: (blockW - TICK_W) / 2 },
                      ]}
                    />
                  ) : null}
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
                    left: stepLeft(step, blockW),
                    top: stepTop(step),
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
      transform: [{ translateX: stepLeft(s, blockW) }, { translateY: stepTop(s) }],
    };
  });
  const darkStyle = useAnimatedStyle(() => {
    const s = step.value;
    return {
      opacity: playheadPlaying.value && pattern[s] === 1 ? 1 : 0,
      transform: [{ translateX: stepLeft(s, blockW) }, { translateY: stepTop(s) }],
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
  // No horizontal gap here: each block carries its own leading gap so the beat
  // groups can be spaced wider than the steps inside them.
  row: { flexDirection: 'row' },
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
  // Downbeat tick (V4b "lit tick"): a small LED-treated light, static, drawn
  // with the cell — never animates. Dimmer than any hit LED.
  tick: {
    position: 'absolute',
    bottom: TICK_BOTTOM,
    width: TICK_W,
    height: TICK_H,
    borderRadius: TICK_RADIUS,
    backgroundColor: 'rgba(255,255,255,0.85)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.45,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
  },
  // The four lightest ramp fills: full-white core + a 1px dark ring OUTSIDE
  // the bar (Paper V4b's spread ring) instead of flipping the tick dark.
  tickLightFill: {
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.6,
    outlineWidth: 1,
    outlineColor: 'rgba(0,0,0,0.40)',
    outlineStyle: 'solid',
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
