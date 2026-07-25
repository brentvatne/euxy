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
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { generator, withRotation } from '@/core/euclid';
import { patternForLane } from '@/state/selectors';
import type { Lane } from '@/state/types';
import { color, keyRamp } from '@/theme/tokens';
import { Led } from '@/components/ui/led';

const PER_ROW = 16;
const GAP = 3;
const CELL_H = 30;

/** Attribution dots (Paper 02x concept C): G1 bright, G2 dim. */
const G1_DOT = '#98989F';
const G2_DOT = '#5B5D63';

export function CombinedCard({ lane }: { lane: Lane }) {
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
                      {combined[i] ? <Led style={styles.light} /> : null}
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
      </View>
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
    padding: 10,
  },
  grid: { gap: 12 },
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
