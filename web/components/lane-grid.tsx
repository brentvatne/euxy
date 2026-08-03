/**
 * The share-card lane grid, live: one labeled row per lane, stepRamp gradient
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
import { stepFill } from '@/theme/tokens';
import { MONO, webAttrs } from './ui';

const MAX_CELL = 22;

/**
 * App step-strip geometry (src/components/sequencer/step-strip-layout.ts),
 * scaled to the responsive cell: steps group in fours with a wider gap
 * before each downbeat (3/8 at full size), rows of a wrapped lane sit 4
 * apart, and every downbeat cell carries the dim inset underline (V4c).
 */
interface Metrics {
  cell: number;
  led: number;
  labelW: number;
  labelSize: number;
  stepGap: number;
  beatGap: number;
  rowGap: number;
  tickInset: number;
  tickBottom: number;
}

function metricsFor(width: number): Metrics {
  const labelW = width >= 440 ? 78 : 54;
  const labelGap = 8;
  const avail = width - labelW - labelGap;
  // A full 16-slot row has 12 in-beat gaps and 3 downbeat gaps.
  const fit = (stepGap: number, beatGap: number) =>
    Math.floor((avail - 12 * stepGap - 3 * beatGap) / 16);
  let stepGap = 3;
  let beatGap = 8;
  let cell = Math.min(MAX_CELL, fit(stepGap, beatGap));
  if (cell < 16) {
    // Tight viewports shrink the gaps with the cells, keeping the beat
    // grouping legible instead of eating the whole width.
    stepGap = 2;
    beatGap = 5;
    cell = Math.min(MAX_CELL, fit(stepGap, beatGap));
  }
  cell = Math.max(8, cell);
  return {
    cell,
    led: cell >= 18 ? 5 : 4,
    labelW,
    labelSize: width >= 440 ? 11 : 9,
    stepGap,
    beatGap,
    rowGap: cell >= 16 ? 4 : 2,
    tickInset: cell >= 16 ? 3 : 2,
    tickBottom: cell >= 16 ? 3 : 2,
  };
}

/** App convention: rows wrap at 16 (a multiple of 4), so absolute index
 * works unchanged — 1 / 5 / 9 / 13 of every row. */
const isDownbeat = (i: number) => i % 4 === 0;

/** Tick color over the ramp: light everywhere except the four lightest
 * slots, where a light tick would vanish (step-strip-layout.tickColor). */
const tickColor = (slot: number) =>
  slot >= 12 ? 'rgba(0,0,0,0.45)' : 'rgba(255,255,255,0.40)';

function Cell({
  slot,
  fill,
  hit,
  playhead,
  m,
}: {
  /** Position in the 16-slot row — drives fill, grouping gap and tick. */
  slot: number;
  fill: string;
  hit: boolean;
  playhead: boolean;
  m: Metrics;
}) {
  // App playhead language: the travelling light occupies the LED slot on
  // empty steps; crossing a hit it REPLACES the steady LED with a prominent
  // black dot in the same slot (never both at once).
  const blackDot = playhead && hit;
  const ledTop = m.cell >= 18 ? 3 : 2;
  // The dark dot is one pixel larger than the LED it replaces (app darkDot).
  const dot = m.led + 1;
  return (
    <View
      style={[
        styles.cell,
        {
          width: m.cell,
          height: m.cell,
          borderRadius: m.cell >= 16 ? 4 : 3,
          backgroundColor: fill,
          // Beat grouping lives in the gap BEFORE each cell (app convention):
          // none at the row start, wider before each downbeat.
          marginLeft: slot === 0 ? 0 : isDownbeat(slot) ? m.beatGap : m.stepGap,
        },
      ]}
    >
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
            styles.darkDot,
            {
              // Centered on the LED slot.
              top: ledTop + m.led / 2 - dot / 2,
              left: (m.cell - dot) / 2,
              width: dot,
              height: dot,
              borderRadius: dot / 2,
            },
          ]}
        />
      )}
      {isDownbeat(slot) && (
        <View
          style={[
            styles.tick,
            {
              bottom: m.tickBottom,
              left: m.tickInset,
              width: m.cell - m.tickInset * 2,
              backgroundColor: tickColor(slot),
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
      <View style={{ gap: m.rowGap }}>
        {rows.map((slots, r) => (
          <View key={r} style={styles.cells}>
            {slots.map((i) => (
              <Cell
                key={i}
                slot={i % 16}
                fill={stepFill(i % 16)}
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
  return Math.max(rows * m.cell + (rows - 1) * m.rowGap, 14);
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
  // No gap here: each cell carries its own leading margin so beat groups
  // can be spaced wider than the steps inside them (app convention).
  cells: { flexDirection: 'row' },
  cell: {},
  // App LED: white with a dark ring and the soft emissive glow
  // (shadowOpacity 0.7 / radius 2.5 in step-strip.tsx).
  led: {
    position: 'absolute',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.45)',
    boxShadow: '0 0 2.5px rgba(255,255,255,0.7)',
  },
  // Playhead-on-hit: the light goes dark but stays PRESENT — the app's
  // darkDot (#08080a with a faint light rim).
  darkDot: {
    position: 'absolute',
    backgroundColor: '#08080a',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  // Downbeat underline (V4c): static, drawn with the cell.
  tick: {
    position: 'absolute',
    height: 2,
    borderRadius: 1,
  },
});
