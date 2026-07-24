/**
 * Steps view (Paper node 12E-0, the default editor view) — three linear rows:
 *   • COMBINED — the played pattern, with each hit colored by its source
 *     (gen1-only #AFAFB3, gen2-only #797982, both #F6F4F4 — Paper 17G-0) and a
 *     dark cell with a 2px white outline under the playhead.
 *   • GEN 1 / GEN 2 — each generator's own pattern as a short (16px) sub-row so
 *     you can see how the two combine.
 * All rows are fit-to-width (flex) so length 64 (node 1DU-0) just shrinks the
 * blocks — no horizontal scroll (see the editor redline in docs/design/README).
 */
import { StyleSheet, View } from 'react-native';

import { generator, withRotation } from '@/core/euclid';
import { patternForLane } from '@/state/selectors';
import type { Lane, Transport } from '@/state/types';
import { color, font, ramp } from '@/theme/tokens';
import { AppText } from '@/components/ui';
import { usePlayhead } from './use-playhead';

export function StepsView({ lane, transport }: { lane: Lane; transport: Transport }) {
  const n = lane.length;
  const combined = patternForLane(lane);
  const genA = generator(lane.genA.pulses, n, lane.genA.rotation);
  const genB =
    lane.genB.pulses > 0
      ? generator(lane.genB.pulses, n, lane.genB.rotation)
      : (new Array(n).fill(0) as number[]);
  // The combined row is whole-track rotated; rotate the sources the same way so
  // each hit can be colored by which generator produced it.
  const aRot = withRotation(genA, lane.trackRot);
  const bRot = withRotation(genB, lane.trackRot);
  const hits = combined.reduce((s, h) => s + (h ? 1 : 0), 0);
  const play = usePlayhead(n, lane.resolutionTicks);

  const ruler = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)].map((i) => i + 1);

  const hitColor = (i: number) =>
    aRot[i] && bRot[i] ? color.label : aRot[i] ? color.stepHit : color.label4;

  // Long lanes tighten up (Paper 1DU-0 @64: combined gap 2 / height 40).
  const long = n > 32;
  const gap = long ? 2 : 5;
  const stepH = long ? 40 : 44;

  return (
    <View style={styles.container}>
      {/* Combined played row */}
      <View style={styles.block}>
        <View style={styles.head}>
          <AppText style={styles.headLabel}>COMBINED · {lane.op}</AppText>
          <AppText style={styles.headMeta}>
            {hits} hits · {n} steps
          </AppText>
        </View>
        <View style={[styles.row, { gap }]}>
          {combined.map((hit, i) => {
            const active = transport.playing && i === play;
            return (
              <View
                key={i}
                style={[
                  styles.step,
                  { height: stepH },
                  { backgroundColor: active && !hit ? ramp[7] : hit ? hitColor(i) : color.stepEmpty },
                  active && styles.stepActive,
                ]}
              />
            );
          })}
        </View>
        <View style={styles.ruler}>
          {ruler.map((label, i) => (
            <AppText key={i} style={styles.rulerLabel}>
              {label}
            </AppText>
          ))}
        </View>
      </View>

      {/* Gen 1 sub-row */}
      <GenRow
        swatch={color.stepHit}
        label={`GEN 1 · ${lane.genA.pulses} pulses${lane.genA.rotation ? ` · ⟳${lane.genA.rotation}` : ''}`}
        pattern={genA}
        hitColor={color.stepHit}
        gap={gap}
      />

      {/* Gen 2 sub-row */}
      <GenRow
        swatch={color.label4}
        label={`GEN 2 · ${lane.genB.pulses} pulses${lane.genB.rotation ? ` · ⟳${lane.genB.rotation}` : ''}`}
        pattern={genB}
        hitColor={color.label4}
        gap={gap}
      />
    </View>
  );
}

function GenRow({
  swatch,
  label,
  pattern,
  hitColor,
  gap,
}: {
  swatch: string;
  label: string;
  pattern: number[];
  hitColor: string;
  gap: number;
}) {
  return (
    <View style={styles.genBlock}>
      <View style={styles.genHead}>
        <View style={[styles.genSwatch, { backgroundColor: swatch }]} />
        <AppText style={styles.genLabel}>{label}</AppText>
      </View>
      <View style={[styles.row, { gap }]}>
        {pattern.map((hit, i) => (
          <View
            key={i}
            style={[styles.genCell, { backgroundColor: hit ? hitColor : color.stepEmptyDim }]}
          />
        ))}
      </View>
    </View>
  );
}

// Exact values from Paper 17G-0: min-h 346, py 24, px 20, gap 20; combined
// blocks 44 tall / radius 6 / gap 5; gen cells 16 tall / radius 4.
const styles = StyleSheet.create({
  container: {
    minHeight: 346,
    justifyContent: 'center',
    paddingVertical: 24,
    paddingHorizontal: 20,
    gap: 20,
  },
  block: { gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.48,
    color: color.label3,
  },
  headMeta: { fontFamily: font.text, fontWeight: '600', fontSize: 12, lineHeight: 16, color: color.label3 },
  row: { flexDirection: 'row' },
  step: { flex: 1, borderRadius: 6 },
  stepActive: { borderWidth: 2, borderColor: color.label },
  ruler: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  rulerLabel: { fontFamily: font.mono, fontSize: 10, lineHeight: 12, color: color.labelDisabled },
  genBlock: { gap: 6 },
  genHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  genSwatch: { width: 9, height: 9, borderRadius: 2 },
  genLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 11, lineHeight: 14, color: color.label3 },
  genCell: { flex: 1, height: 16, borderRadius: 4 },
});
