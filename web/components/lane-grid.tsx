/**
 * The share-card lane grid, live: one labeled row per lane, keyRamp gradient
 * fills, steady white LEDs on sequenced steps, and the app's playhead
 * language while playing — a travelling white light on empty steps that
 * becomes a prominent black dot when it crosses a hit. Long lanes wrap at 16
 * per row (uniform grid: blocks always sized for 16 slots).
 *
 * Responsive: the grid measures itself and derives cell/label sizes so 16
 * cells always fit — fixed 22px cells ran off phone screens (Brent's
 * report; a 390pt viewport leaves ~314px inside the card).
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { laneStepAt } from '@/core/euclid';
import { patternForLane } from '@/core/lane-pattern';
import type { SharedLane } from '@/core/share-codec';
import { color, keyRamp } from '@/theme/tokens';
import { MONO, webAttrs } from './ui';

const GAP = 2;
const MAX_CELL = 22;

interface Metrics {
  cell: number;
  led: number;
  dot: number;
  labelW: number;
  labelSize: number;
}

function metricsFor(width: number): Metrics {
  const labelW = width >= 440 ? 78 : 54;
  const labelGap = 8;
  const cell = Math.max(
    8,
    Math.min(MAX_CELL, Math.floor((width - labelW - labelGap - 15 * GAP) / 16)),
  );
  return {
    cell,
    led: cell >= 18 ? 5 : 4,
    dot: cell >= 18 ? 8 : 6,
    labelW,
    labelSize: width >= 440 ? 11 : 9,
  };
}

function Cell({ fill, hit, playhead, m }: { fill: string; hit: boolean; playhead: boolean; m: Metrics }) {
  // App playhead language: the travelling light occupies the LED slot on
  // empty steps; crossing a hit it REPLACES the steady LED with a prominent
  // black dot in the same slot (never both at once).
  const blackDot = playhead && hit;
  const ledTop = m.cell >= 18 ? 3 : 2;
  return (
    <View style={[styles.cell, { width: m.cell, height: m.cell, borderRadius: m.cell >= 16 ? 4 : 3, backgroundColor: fill }]}>
      {(hit || playhead) && !blackDot && (
        <View
          style={[
            styles.led,
            { top: ledTop, left: (m.cell - m.led) / 2, width: m.led, height: m.led, borderRadius: m.led / 2 },
          ]}
        />
      )}
      {blackDot && (
        <View
          style={[
            styles.blackDot,
            {
              // Centered on the LED slot.
              top: ledTop + m.led / 2 - m.dot / 2,
              left: (m.cell - m.dot) / 2,
              width: m.dot,
              height: m.dot,
              borderRadius: m.dot / 2,
            },
          ]}
        />
      )}
    </View>
  );
}

function LaneRow({ lane, tick, m }: { lane: SharedLane; tick: number; m: Metrics }) {
  const steps = patternForLane(lane);
  const playStep = tick >= 0 ? laneStepAt(tick, lane.resolutionTicks, lane.length) : -1;
  const rows: number[][] = [];
  for (let i = 0; i < lane.length; i += 16) {
    rows.push(Array.from({ length: Math.min(16, lane.length - i) }, (_, k) => i + k));
  }
  return (
    <View style={styles.laneRow}>
      <Text style={[styles.label, { width: m.labelW, fontSize: m.labelSize }]} numberOfLines={1}>
        {(lane.name ?? `CH ${lane.channel + 1}`).toUpperCase()}
      </Text>
      <View style={{ gap: GAP }}>
        {rows.map((slots, r) => (
          <View key={r} style={styles.cells}>
            {slots.map((i) => (
              <Cell
                key={i}
                fill={keyRamp[Math.floor((i % 16) / 2)]}
                hit={steps[i] === 1}
                playhead={i === playStep}
                m={m}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

function laneHeight(length: number, m: Metrics): number {
  const rows = Math.max(1, Math.ceil(length / 16));
  // A lane row is at least as tall as its label's 14px line.
  return Math.max(rows * m.cell + (rows - 1) * GAP, 14);
}

function gridHeight(lanes: { length: number }[], m: Metrics): number {
  return lanes.reduce((h, l) => h + laneHeight(l.length, m), 0) + 6 * (lanes.length - 1);
}

/** Static-export layout: 680px column − 2×18px card padding. Rendering at
 * this width from the first frame (instead of nothing until onLayout, which
 * fires after paint) means no load-time layout shift — the static HTML ships
 * a full-size grid, and hydration matches it exactly. */
const DEFAULT_WIDTH = 644;

// useLayoutEffect corrects the width estimate before the browser paints the
// hydrated tree; the server shim avoids React's SSR warning.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

export function LaneGrid({
  lanes,
  tick,
  reserve,
}: {
  lanes: SharedLane[];
  tick: number;
  /** Additional lane sets to reserve height for, so swapping patterns
   * (preset pills) causes no layout shift below the grid. */
  reserve?: { length: number }[][];
}) {
  const ref = useRef<View>(null);
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  useIsoLayoutEffect(() => {
    // On web the View ref IS the DOM element. Measured synchronously so
    // narrow viewports never paint the desktop-width estimate.
    const el = ref.current as unknown as HTMLElement | null;
    if (el?.offsetWidth) setWidth(el.offsetWidth);
  }, []);
  const m = metricsFor(width);
  const minHeight = Math.max(...[lanes, ...(reserve ?? [])].map((set) => gridHeight(set, m)));
  return (
    <View
      ref={ref}
      accessibilityRole="image"
      accessibilityLabel={`Lane grid — ${lanes
        .map((l) => (l.name ?? `CH ${l.channel + 1}`).toUpperCase())
        .join(', ')}`}
      {...webAttrs({ illustration: '' })}
      style={[styles.grid, { minHeight }]}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <View style={styles.rows}>
        {lanes.map((lane, i) => <LaneRow key={i} lane={lane} tick={tick} m={m} />)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Cells cap at MAX_CELL, so on wide cards the rows are narrower than the
  // measured container — center them as a block (rows stay left-aligned to
  // each other so labels line up). justifyContent centers shorter patterns
  // vertically inside the reserved minHeight.
  grid: { alignSelf: 'stretch', alignItems: 'center', justifyContent: 'center', minHeight: 24 },
  rows: { gap: 6 },
  laneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    flexShrink: 0,
    fontFamily: MONO,
    lineHeight: 14,
    letterSpacing: 0.4,
    color: '#6E6E76',
  },
  cells: { flexDirection: 'row', gap: GAP },
  cell: {},
  led: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 5px rgba(255,255,255,1), 0 0 2px rgba(255,255,255,0.95)',
  },
  blackDot: {
    position: 'absolute',
    backgroundColor: color.displayBg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
