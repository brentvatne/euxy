/**
 * CombinedCard — the Lane Editor's pinned pattern readout (Paper "02 · Lane
 * Editor", gradient revision). Cells sweep the OP-XY sequencer-key ramp
 * exactly like the sequencer strips (fills never encode anything), a
 * prominent top-centered light marks the steps the COMBINED pattern actually
 * plays, and a thin attribution row under each grid row shows which generator
 * pulses on each step — G1 as the brighter left dot, G2 as the dimmer right
 * dot (with XOR you can see a both-dot step stay lightless). Steps wrap at 16
 * per row and never shrink; the editor never shows a playhead here.
 *
 * Columns are grouped in fours — a wider gap before every downbeat — exactly as
 * the sequencer strips group them, so 1 / 5 / 9 / 13 land in the same places in
 * both grids, and every downbeat cell carries the same dim inset underline
 * (V4c) the strips draw.
 */
import { useEffect, useState } from 'react';
import { useIsFirstRender } from '@/lib/use-is-first-render';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { generator, withRotation } from '@/core/euclid';
import { patternForLane } from '@/state/selectors';
import type { Lane } from '@/state/types';
import { color, stepFill } from '@/theme/tokens';
import { FlickerBloom } from '@/components/ui/flicker-bloom';
import { Led } from '@/components/ui/led';
// The card's columns ARE the sequencer strip's columns (same 16 slots, same
// uniform 4px step gap, same lit downbeat tick) — one source of geometry so
// the two grids stay countable in the same places.
import {
  isDownbeat,
  PER_ROW,
  stepBlockWidth,
  stepGapBefore,
  stepLeft,
  TICK_BOTTOM,
  TICK_H,
  TICK_RADIUS,
  TICK_W,
  tickOnLightFill,
} from '@/components/sequencer/step-strip-layout';

const CELL_H = 30;
const CARD_PAD = 10;
const GRID_GAP = 12;
/** Row pitch: cells (30) + rowPair gap (5) + attribution row (4) + grid gap (12). */
const ROW_PITCH = CELL_H + 5 + 4 + GRID_GAP;

/**
 * The card's height for a lane length, from the same constants the grid
 * renders with. The lane editor sizes its scroll spacer with this in the SAME
 * React commit that adds/removes a grid row, so the native offset
 * compensation (maintainVisibleContentPosition) lands in one transaction —
 * measuring via onLayout would lag a frame and double-jump the form.
 */
export function combinedCardHeight(steps: number): number {
  const rows = Math.max(1, Math.ceil(steps / PER_ROW));
  return CARD_PAD * 2 + rows * ROW_PITCH - GRID_GAP;
}
/** Curtain sweep across all 16 columns (concept J, ~350ms). */
const SWEEP_MS = 350;

/** Attribution dots (Paper 02x concept C): G1 bright, G2 dim. */
const G1_DOT = '#98989F';
const G2_DOT = '#5B5D63';

export function CombinedCard({
  lane,
  washNonce = 0,
  washDirection = 'ltr',
}: {
  lane: Lane;
  /** Bump to sweep the reroll wash across the card (concept J) — triggered
   * by the Randomize press (JS state), never the clock. */
  washNonce?: number;
  /** 'rtl' replays the wash right-to-left (undo). */
  washDirection?: 'ltr' | 'rtl';
}) {
  const n = lane.length;
  const combined = patternForLane(lane);
  // Generator sources are whole-track rotated like the combined row, so each
  // step's attribution matches the pattern actually shown.
  const aRot = withRotation(generator(lane.genA.pulses, n, lane.genA.rotation), lane.trackRot);
  const bRot =
    lane.genB.pulses > 0
      ? withRotation(generator(lane.genB.pulses, n, lane.genB.rotation), lane.trackRot)
      : (new Array(n).fill(0) as number[]);
  const [width, setWidth] = useState(0);
  const cellW = width > 0 ? stepBlockWidth(width) : 0;

  // LEDs in the card's FIRST render must not run the ignition bloom — only
  // lights added by live edits (slider drags) ignite (see ui/led.tsx).
  const isFirstRender = useIsFirstRender();

  // Reroll wash (concept J): every animation in it is precomputed per trigger
  // (withDelay/withSequence), so nothing runs per frame in JS. Reduced Motion
  // skips straight to the settled new pattern.
  //
  // The wash stays MOUNTED across presses (principle 7). It used to be keyed on
  // the nonce, which meant mashing Randomize destroyed the in-flight curtain
  // and every cell film and remounted them at their initial values: the curtain
  // teleported back to the entry edge mid-sweep. A bump now RETARGETS the
  // curtain and retriggers the films instead; the whole layer unmounts only
  // after it has been idle long enough to be finished, so nothing gets cut.
  const reducedMotion = useReducedMotion();
  const [washActive, setWashActive] = useState(false);
  useEffect(() => {
    if (washNonce === 0 || reducedMotion) return;
    // Intentional: mounting the wash layer IS this effect's job — it is a
    // timed animation window driven by a press, not derived state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWashActive(true);
    const t = setTimeout(() => setWashActive(false), SWEEP_MS + 450);
    return () => clearTimeout(t);
  }, [washNonce, reducedMotion]);

  const rows: number[][] = [];
  for (let i = 0; i < n; i += PER_ROW) {
    rows.push(Array.from({ length: Math.min(PER_ROW, n - i) }, (_, j) => i + j));
  }

  return (
    <View style={styles.card}>
      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {cellW > 0
          ? rows.map((row, r) => (
              <View key={r} style={styles.rowPair}>
                <View style={styles.gridRow}>
                  {row.map((i) => (
                    <View
                      key={i}
                      style={[
                        styles.cell,
                        {
                          width: cellW,
                          // Beat grouping rides the gap BEFORE each cell.
                          marginLeft: stepGapBefore(i),
                          backgroundColor: stepFill(i % PER_ROW),
                        },
                      ]}
                    >
                      {combined[i] ? (
                        <Led ignite={!isFirstRender} style={styles.light} />
                      ) : null}
                      {isDownbeat(i) ? (
                        <View
                          style={[
                            styles.tick,
                            tickOnLightFill(i) && styles.tickLightFill,
                            { left: (cellW - TICK_W) / 2 },
                          ]}
                        />
                      ) : null}
                    </View>
                  ))}
                </View>
                <View style={styles.gridRow}>
                  {row.map((i) => (
                    <View
                      key={i}
                      style={[styles.attrSlot, { width: cellW, marginLeft: stepGapBefore(i) }]}
                    >
                      {aRot[i] ? <View style={[styles.attrDot, styles.attrG1]} /> : null}
                      {bRot[i] ? <View style={[styles.attrDot, styles.attrG2]} /> : null}
                    </View>
                  ))}
                </View>
              </View>
            ))
          : null}
        {cellW > 0 && washActive ? (
          <RerollWash
            trigger={washNonce}
            direction={washDirection}
            steps={n}
            cellW={cellW}
            width={width}
          />
        ) : null}
      </View>
    </View>
  );
}

/**
 * The reroll wash: a soft light curtain sweeps the lane's steps over ~350ms
 * while the cells flicker-bloom under it column by column and settle into the
 * NEW pattern already painted beneath (slot-machine reveal); the curtain fades
 * out past the last column. Grey palette only — the light layer is #F6F4F4
 * at low opacity, and only opacity/transform animate.
 *
 * The whole layer is CLIPPED to the lane's occupied steps (`contentW`), and
 * the curtain travels that span — not the card's full 16-column width. Two
 * things went wrong without it (TestFlight, lane editor): the curtain is
 * fully lit the instant it's parked at the entry edge, so it painted a hard
 * light band OUTSIDE the card — over the sheet background and across the
 * card's rounded corner — at both ends of every sweep; and a lane shorter
 * than 16 steps had the light carry on across empty card past its last step.
 * Clipping to the steps makes the light enter and leave at the lane's own
 * bounds.
 */
function RerollWash({
  trigger,
  direction,
  steps,
  cellW,
  width,
}: {
  /** Bumped per Randomize press: retargets the curtain, retriggers the films. */
  trigger: number;
  direction: 'ltr' | 'rtl';
  steps: number;
  cellW: number;
  width: number;
}) {
  // The lane's own width: a row is only as wide as the steps it holds, so a
  // 12- or 8-step lane stops well short of the card's right edge.
  const cols = Math.min(PER_ROW, Math.max(1, steps));
  const contentW = cols >= PER_ROW ? width : stepLeft(cols - 1, cellW) + cellW;
  // 2.5 cells of light, but never wider than the lane itself — on a 1–2 step
  // lane an oversized band would fill the whole row and never read as moving.
  const curtainW = Math.min(cellW * 2.5, contentW);
  const rtl = direction === 'rtl';

  // Curtain: constant-speed sweep (mechanical, LED-like), fading past the
  // last column.
  const x = useSharedValue(rtl ? contentW : -curtainW);
  const o = useSharedValue(0);
  useEffect(() => {
    const startX = rtl ? contentW : -curtainW;
    const endX = rtl ? -curtainW : contentW;
    const span = contentW + curtainW;
    // Parked and invisible → enter fresh from the start edge (nothing on
    // screen to cut). Still mid-sweep → leave the curtain where it is and
    // carry it to the end at the SAME speed: a re-press re-flickers the cells
    // under a light that never jumps.
    if (o.value < 0.02) x.value = startX;
    const remaining = Math.abs(endX - x.value);
    const dur = Math.max(60, SWEEP_MS * (remaining / span));
    o.value = 1; // instant attack
    x.value = withTiming(endX, { duration: dur, easing: Easing.linear });
    o.value = withDelay(
      Math.max(0, dur - 110),
      withTiming(0, { duration: 160, easing: Easing.out(Easing.quad) }),
    );
    // Fires on mount and again on every trigger bump.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
  const curtainStyle = useAnimatedStyle(() => ({
    opacity: o.value,
    transform: [{ translateX: x.value }],
  }));

  // Per-cell flicker, staggered by column as the curtain passes. Cheap
  // deterministic per-cell jitter/peak from the wash seed (no Math.random in
  // render — a re-render must not reroll the sparkle).
  const rand = (i: number) => {
    const t = Math.sin((i + 1) * 127.1 + trigger * 311.7) * 43758.5453;
    return t - Math.floor(t);
  };
  // Staggered over the lane's OWN columns, so a short lane's cells stay under
  // the curtain instead of finishing while it still has card left to cross.
  const colMs = SWEEP_MS / cols;
  const cells = Array.from({ length: steps }, (_, i) => {
    const col = i % PER_ROW;
    const sweepCol = rtl ? cols - 1 - col : col;
    return {
      i,
      delay: sweepCol * colMs + rand(i) * colMs * 0.8,
      peak: 0.3 + 0.35 * rand(i + steps),
      left: stepLeft(col, cellW),
      top: Math.floor(i / PER_ROW) * ROW_PITCH,
    };
  });

  return (
    // Clipped to the lane's steps: the curtain enters and leaves at the lane's
    // own edges and nothing paints over the card's padding or the sheet.
    <View style={[styles.washClip, { width: contentW }]} pointerEvents="none">
      {/* Films stay mounted under a stable key and retrigger — a mid-fade cell
          redirects from its current opacity instead of cutting to zero. */}
      {cells.map((c) => (
        <FlickerBloom
          key={c.i}
          trigger={trigger}
          delay={c.delay}
          peak={c.peak}
          style={[
            styles.washCell,
            { left: c.left, top: c.top, width: cellW },
          ]}
        />
      ))}
      <Animated.View style={[styles.curtain, { width: curtainW }, curtainStyle]}>
        <View style={[styles.curtainEdge, rtl ? styles.curtainEdgeLeft : styles.curtainEdgeRight]} />
      </Animated.View>
    </View>
  );
}

// Paper "02 · Lane Editor": card #232325 r12 p10, NO header (the grid speaks
// for itself); cells 30 tall r3, 16/row, gap 3 inside a beat and 8 before each
// downbeat; light 6px white, dark ring, glow, top-centered 3px from the top;
// attribution row 3px dots, 4px tall.
const styles = StyleSheet.create({
  card: {
    backgroundColor: color.stepEmptyDim,
    borderRadius: 12,
    padding: CARD_PAD,
  },
  grid: { gap: GRID_GAP },
  rowPair: { gap: 5 },
  // No row gap: each cell carries its own leading gap (uniform, but slot 0
  // starts flush — see stepGapBefore).
  gridRow: { flexDirection: 'row' },
  cell: { height: CELL_H, borderRadius: 3, alignItems: 'center', paddingTop: 3 },
  // Downbeat tick (V4b "lit tick") — same tick as the sequencer strips, so
  // the two grids stay one language.
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
  tickLightFill: {
    backgroundColor: '#FFFFFF',
    shadowOpacity: 0.6,
    outlineWidth: 1,
    outlineColor: 'rgba(0,0,0,0.40)',
    outlineStyle: 'solid',
  },
  attrSlot: {
    height: 4,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 2,
  },
  attrDot: { width: 3, height: 3, borderRadius: 999 },
  attrG1: { backgroundColor: G1_DOT },
  attrG2: { backgroundColor: G2_DOT },
  // Concept J: the wash layer is clipped to the lane's steps (see RerollWash),
  // so the curtain never paints outside the lane it belongs to.
  washClip: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  // Concept J: light film over a cell while the wash passes (opacity-only).
  washCell: {
    position: 'absolute',
    height: CELL_H,
    borderRadius: 3,
    backgroundColor: '#F6F4F4',
  },
  // The curtain: a soft light band with a brighter leading edge + glow. Full
  // height of the clip (which is the grid's box) — the old -4 overhang bled
  // into the card's padding.
  curtain: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: 'rgba(246,244,244,0.10)',
    borderRadius: 4,
  },
  curtainEdge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    borderRadius: 1,
    backgroundColor: '#F6F4F4',
    opacity: 0.55,
    shadowColor: '#F6F4F4',
    shadowOpacity: 0.9,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  curtainEdgeRight: { right: 0 },
  curtainEdgeLeft: { left: 0 },
  light: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 1,
    shadowRadius: 3.5,
    shadowOffset: { width: 0, height: 0 },
  },
});
