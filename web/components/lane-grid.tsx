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
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { laneStepAt } from '@/core/euclid';
import { patternForLane } from '@/core/lane-pattern';
import type { SharedLane } from '@/core/share-codec';
import { color, keyRamp } from '@/theme/tokens';
import { MONO } from './ui';

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

export function LaneGrid({ lanes, tick }: { lanes: SharedLane[]; tick: number }) {
  const [width, setWidth] = useState(0);
  const m = metricsFor(width);
  return (
    <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 &&
        lanes.map((lane, i) => <LaneRow key={i} lane={lane} tick={tick} m={m} />)}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 6, alignSelf: 'stretch', minHeight: 24 },
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
