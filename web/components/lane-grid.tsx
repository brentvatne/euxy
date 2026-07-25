/**
 * The share-card lane grid, live: one labeled row per lane, keyRamp gradient
 * fills, steady white LEDs on sequenced steps, and the app's playhead
 * language while playing — a travelling white light on empty steps that
 * becomes a prominent black dot when it crosses a hit. Long lanes wrap at 16
 * per row (uniform grid: blocks always sized for 16 slots).
 */
import { StyleSheet, Text, View } from 'react-native';
import { laneStepAt } from '@/core/euclid';
import { patternForLane } from '@/core/lane-pattern';
import type { SharedLane } from '@/core/share-codec';
import { color, keyRamp } from '@/theme/tokens';
import { MONO } from './ui';

const CELL = 18;
const GAP = 2;

function Cell({ fill, hit, playhead }: { fill: string; hit: boolean; playhead: boolean }) {
  return (
    <View style={[styles.cell, { backgroundColor: fill }]}>
      {hit && <View style={styles.led} />}
      {playhead && !hit && <View style={[styles.led, styles.playheadLight]} />}
      {playhead && hit && <View style={styles.blackDot} />}
    </View>
  );
}

function LaneRow({ lane, tick }: { lane: SharedLane; tick: number }) {
  const steps = patternForLane(lane);
  const playStep = tick >= 0 ? laneStepAt(tick, lane.resolutionTicks, lane.length) : -1;
  const rows: number[][] = [];
  for (let i = 0; i < lane.length; i += 16) {
    rows.push(Array.from({ length: Math.min(16, lane.length - i) }, (_, k) => i + k));
  }
  return (
    <View style={styles.laneRow}>
      <Text style={styles.label} numberOfLines={1}>
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
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

export function LaneGrid({ lanes, tick }: { lanes: SharedLane[]; tick: number }) {
  return (
    <View style={styles.grid}>
      {lanes.map((lane, i) => (
        <LaneRow key={i} lane={lane} tick={tick} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: { gap: 6 },
  laneRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: {
    width: 64,
    flexShrink: 0,
    fontFamily: MONO,
    fontSize: 9,
    lineHeight: 12,
    letterSpacing: 0.4,
    color: '#6E6E76',
  },
  cells: { flexDirection: 'row', gap: GAP },
  cell: { width: CELL, height: CELL, borderRadius: 4 },
  led: {
    position: 'absolute',
    top: 3,
    left: (CELL - 4) / 2,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#FFFFFF',
    boxShadow: '0 0 5px rgba(255,255,255,1), 0 0 2px rgba(255,255,255,0.95)',
  },
  playheadLight: { top: (CELL - 4) / 2 },
  blackDot: {
    position: 'absolute',
    top: (CELL - 6) / 2,
    left: (CELL - 6) / 2,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: color.displayBg,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
});
