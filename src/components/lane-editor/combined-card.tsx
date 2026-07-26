/**
 * CombinedCard — the Lane Editor's pinned pattern readout (Paper "02 · Lane
 * Editor", gradient revision). Cells sweep the OP-XY sequencer-key ramp
 * exactly like the sequencer strips (fills never encode anything), a
 * prominent top-centered light marks the steps the COMBINED pattern actually
 * plays, and a thin attribution row under each grid row shows which generator
 * pulses on each step — G1 as the brighter left dot, G2 as the dimmer right
 * dot (with XOR you can see a both-dot step stay lightless). Steps wrap at 16
 * per row and never shrink; the editor never shows a playhead here.
 */
import { useEffect, useRef, useState } from 'react';
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
import { color, keyRamp } from '@/theme/tokens';
import { FlickerBloom } from '@/components/ui/flicker-bloom';
import { Led } from '@/components/ui/led';

const PER_ROW = 16;
const GAP = 3;
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
  const cellW = width > 0 ? (width - GAP * (PER_ROW - 1)) / PER_ROW : 0;

  // LEDs in the card's FIRST render must not run the ignition bloom — only
  // lights added by live edits (slider drags) ignite (see ui/led.tsx).
  const initialRender = useRef(true);
  useEffect(() => {
    initialRender.current = false;
  }, []);

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
                          backgroundColor: keyRamp[Math.floor((i % PER_ROW) / 2)],
                        },
                      ]}
                    >
                      {combined[i] ? (
                        <Led ignite={!initialRender.current} style={styles.light} />
                      ) : null}
                    </View>
                  ))}
                </View>
                <View style={styles.gridRow}>
                  {row.map((i) => (
                    <View key={i} style={[styles.attrSlot, { width: cellW }]}>
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
 * The reroll wash: a soft light curtain sweeps the card over ~350ms while
 * the cells flicker-bloom under it column by column and settle into the NEW
 * pattern already painted beneath (slot-machine reveal); the curtain fades
 * out past the last column. Grey palette only — the light layer is #F6F4F4
 * at low opacity, and only opacity/transform animate.
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
  const curtainW = cellW * 2.5;
  const rtl = direction === 'rtl';

  // Curtain: constant-speed sweep (mechanical, LED-like), fading past the
  // last column.
  const x = useSharedValue(rtl ? width : -curtainW);
  const o = useSharedValue(0);
  useEffect(() => {
    const startX = rtl ? width : -curtainW;
    const endX = rtl ? -curtainW : width;
    const span = width + curtainW;
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
  const colMs = SWEEP_MS / PER_ROW;
  const cells = Array.from({ length: steps }, (_, i) => {
    const col = i % PER_ROW;
    const sweepCol = rtl ? PER_ROW - 1 - col : col;
    return {
      i,
      delay: sweepCol * colMs + rand(i) * colMs * 0.8,
      peak: 0.3 + 0.35 * rand(i + steps),
      left: col * (cellW + GAP),
      top: Math.floor(i / PER_ROW) * ROW_PITCH,
    };
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
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
// for itself); cells 30 tall r3 gap 3, 16/row; light 6px white, dark ring,
// glow, top-centered 3px from the top; attribution row 3px dots, 4px tall.
const styles = StyleSheet.create({
  card: {
    backgroundColor: color.stepEmptyDim,
    borderRadius: 12,
    padding: CARD_PAD,
  },
  grid: { gap: GRID_GAP },
  rowPair: { gap: 5 },
  gridRow: { flexDirection: 'row', gap: GAP },
  cell: { height: CELL_H, borderRadius: 3, alignItems: 'center', paddingTop: 3 },
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
  // Concept J: light film over a cell while the wash passes (opacity-only).
  washCell: {
    position: 'absolute',
    height: CELL_H,
    borderRadius: 3,
    backgroundColor: '#F6F4F4',
  },
  // The curtain: a soft light band with a brighter leading edge + glow.
  curtain: {
    position: 'absolute',
    top: -4,
    bottom: -4,
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
