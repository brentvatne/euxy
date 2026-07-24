/**
 * CombinedCard — the Lane Editor's pinned pattern readout (Paper 02w · Lane
 * Editor D / 02w-b scrolled). OP-XY key model: each step's FILL shade shows
 * which generator pulses there, and a prominent top-centered light marks the
 * steps the COMBINED pattern actually plays — with XOR you can literally see a
 * both-generator step glow brightest yet stay silent. Steps wrap at 16 per row
 * and never shrink; the editor never shows a playhead here.
 */
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { generator, withRotation } from '@/core/euclid';
import { patternForLane } from '@/state/selectors';
import type { Lane } from '@/state/types';
import { color } from '@/theme/tokens';

/** Paper-exact fills (02w, 2026-07-24): pulse-source shade per step. */
const FILL = {
  empty: '#26262b',
  g2: '#40404a',
  g1: '#8b8b94',
  both: '#a9a9b0',
} as const;

const PER_ROW = 16;
const GAP = 3;
const CELL_H = 30;

export function CombinedCard({ lane }: { lane: Lane }) {
  const n = lane.length;
  const combined = patternForLane(lane);
  // Shade sources are whole-track rotated like the combined row, so each
  // step's fill matches the pattern actually shown.
  const aRot = withRotation(generator(lane.genA.pulses, n, lane.genA.rotation), lane.trackRot);
  const bRot =
    lane.genB.pulses > 0
      ? withRotation(generator(lane.genB.pulses, n, lane.genB.rotation), lane.trackRot)
      : (new Array(n).fill(0) as number[]);
  const [width, setWidth] = useState(0);
  const cellW = width > 0 ? (width - GAP * (PER_ROW - 1)) / PER_ROW : 0;

  const rows: number[][] = [];
  for (let i = 0; i < n; i += PER_ROW) {
    rows.push(Array.from({ length: Math.min(PER_ROW, n - i) }, (_, j) => i + j));
  }

  const fill = (i: number) =>
    aRot[i] && bRot[i] ? FILL.both : aRot[i] ? FILL.g1 : bRot[i] ? FILL.g2 : FILL.empty;

  return (
    <View style={styles.card}>
      <View style={styles.grid} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
        {cellW > 0
          ? rows.map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map((i) => (
                  <View key={i} style={[styles.cell, { width: cellW, backgroundColor: fill(i) }]}>
                    {combined[i] ? <View style={styles.light} /> : null}
                  </View>
                ))}
              </View>
            ))
          : null}
      </View>
    </View>
  );
}

// Paper "02 · Lane Editor": card #232325 r12 p10, NO header (the grid speaks
// for itself); cells 30 tall r3 gap 3, 16/row; light 6px white, dark ring,
// glow, top-centered 3px from the top.
const styles = StyleSheet.create({
  card: {
    backgroundColor: color.stepEmptyDim,
    borderRadius: 12,
    padding: 10,
  },
  grid: { gap: GAP },
  gridRow: { flexDirection: 'row', gap: GAP },
  cell: { height: CELL_H, borderRadius: 3, alignItems: 'center', paddingTop: 3 },
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
