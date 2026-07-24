/**
 * Graph view (Paper node DR-0) — the OP-XY dot-matrix "device screen": two
 * concentric pixel rings on color.displayBg. Gen 1 is the outer ring (bright
 * pixels for pulses, dim pixels for the rest, hits joined by a bright polygon);
 * Gen 2 is the inner ring (mid-gray pulse pixels joined by a dim polygon). A
 * faint cyan pixel + spoke marks the playhead. Rendered with react-native-svg.
 *
 * Geometry is computed from the lane (length / pulses / rotation) via the shared
 * euclid engine, not hardcoded — the mockup's 4·3/16 layout is just one case.
 */
import { StyleSheet, View } from 'react-native';
import Svg, { Line, Polygon, Rect } from 'react-native-svg';

import { generator } from '@/core/euclid';
import { midiNoteName } from '@/core/note';
import { color, font } from '@/theme/tokens';
import type { Lane, Transport } from '@/state/types';
import { AppText } from '@/components/ui';
import { usePlayhead } from './use-playhead';

const VB = 280;
const C = VB / 2;
const R_OUTER = 112;
const R_INNER = 74;

const RING_DIM = '#3A3A40';
const GEN1 = color.label; // #F6F4F4
const GEN2_STROKE = color.label4; // #797982
const GEN2_FILL = color.label3; // #95959A
const MONO_LABEL = '#C9D6CF';

function pointAt(i: number, n: number, r: number): [number, number] {
  const a = -Math.PI / 2 + (i * 2 * Math.PI) / n;
  return [C + r * Math.cos(a), C + r * Math.sin(a)];
}

function polyPoints(pattern: number[], r: number): string {
  return pattern
    .map((hit, i) => (hit ? pointAt(i, pattern.length, r) : null))
    .filter((p): p is [number, number] => p !== null)
    .map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`)
    .join(' ');
}

export function GraphView({ lane, transport }: { lane: Lane; transport: Transport }) {
  const n = lane.length;
  const genA = generator(lane.genA.pulses, n, lane.genA.rotation);
  const hasB = lane.genB.pulses > 0;
  const genB = hasB ? generator(lane.genB.pulses, n, lane.genB.rotation) : [];

  const playStep = usePlayhead(n, lane.resolutionTicks, transport);
  const [px, py] = pointAt(playStep, n, R_OUTER);

  const aPoly = polyPoints(genA, R_OUTER);
  const bPoly = hasB ? polyPoints(genB, R_INNER) : '';

  return (
    <View style={styles.panel}>
      <View style={styles.readout}>
        <AppText style={styles.mono}>steps {n}</AppText>
        <AppText style={styles.mono}>
          pulses {lane.genA.pulses}
          {hasB ? `·${lane.genB.pulses}` : ''}
        </AppText>
        <AppText style={styles.mono}>op {lane.op.toLowerCase()}</AppText>
      </View>

      <View style={styles.ringWrap}>
        <Svg width="100%" height="100%" viewBox={`0 0 ${VB} ${VB}`}>
          {/* gen 2 connecting polygon (inner, dim) */}
          {hasB && lane.genB.pulses >= 2 ? (
            <Polygon points={bPoly} fill="none" stroke={GEN2_STROKE} strokeWidth={1.5} />
          ) : null}
          {/* gen 1 connecting polygon (outer, bright) */}
          {lane.genA.pulses >= 2 ? (
            <Polygon points={aPoly} fill="none" stroke={GEN1} strokeWidth={1.5} />
          ) : null}
          {/* playhead spoke */}
          <Line x1={C} y1={C} x2={px} y2={py} stroke={color.playhead} strokeWidth={2} opacity={0.9} />

          {/* gen 1 ring pixels */}
          {genA.map((hit, i) => {
            const [x, y] = pointAt(i, n, R_OUTER);
            const s = hit ? 16 : 7;
            return (
              <Rect
                key={`a${i}`}
                x={x - s / 2}
                y={y - s / 2}
                width={s}
                height={s}
                rx={hit ? 1.5 : 1}
                fill={hit ? GEN1 : RING_DIM}
              />
            );
          })}
          {/* gen 2 ring pixels (hits only) */}
          {hasB
            ? genB.map((hit, i) => {
                if (!hit) return null;
                const [x, y] = pointAt(i, n, R_INNER);
                return (
                  <Rect
                    key={`b${i}`}
                    x={x - 6}
                    y={y - 6}
                    width={12}
                    height={12}
                    rx={1.5}
                    fill={GEN2_FILL}
                  />
                );
              })
            : null}
          {/* playhead pixel */}
          <Rect x={px - 7} y={py - 7} width={14} height={14} rx={1.5} fill={color.playhead} />
        </Svg>

        <View style={styles.center} pointerEvents="none">
          <AppText style={styles.noteBig}>{midiNoteName(lane.note)}</AppText>
          {lane.name ? <AppText style={styles.noteSub}>{lane.name.toLowerCase()}</AppText> : null}
        </View>
      </View>

      <View style={styles.legend}>
        <Legend swatch={GEN1} label="gen 1" />
        <Legend swatch={GEN2_FILL} label="gen 2" />
        <Legend swatch={color.playhead} label="play" />
      </View>
    </View>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendSwatch, { backgroundColor: swatch }]} />
      <AppText style={styles.mono}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: color.displayBg,
    borderRadius: 12,
    minHeight: 346,
    paddingVertical: 16,
    paddingHorizontal: 18,
    gap: 8,
  },
  readout: { flexDirection: 'row', justifyContent: 'space-between' },
  mono: { fontFamily: font.mono, fontSize: 12, lineHeight: 16, color: MONO_LABEL },
  ringWrap: { flex: 1, minHeight: 264, alignItems: 'center', justifyContent: 'center' },
  center: { position: 'absolute', alignItems: 'center' },
  noteBig: { fontFamily: font.mono, fontWeight: '700', fontSize: 26, lineHeight: 32, color: color.label },
  noteSub: { fontFamily: font.mono, fontSize: 11, lineHeight: 14, color: MONO_LABEL, letterSpacing: 0.4 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 9, height: 9, borderRadius: 1 },
});
