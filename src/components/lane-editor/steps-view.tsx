/**
 * Steps view (Paper node 12E-0, the default editor view) — three linear rows:
 *   • COMBINED — the played pattern (patternForLane) rendered with the shared
 *     StepBlock, tall (44px) with the white-outline playhead cell.
 *   • GEN 1 / GEN 2 — each generator's own pattern as a short (16px) sub-row so
 *     you can see how the two combine.
 * All rows are fit-to-width (flex) so length 64 (node 1DU-0) just shrinks the
 * blocks — no horizontal scroll (see the editor redline in docs/design/README).
 */
import { StyleSheet, View } from 'react-native';

import { generator } from '@/core/euclid';
import { patternForLane } from '@/state/selectors';
import type { Lane, Transport } from '@/state/types';
import { color, font, radius } from '@/theme/tokens';
import { AppText, StepBlock } from '@/components/ui';
import { usePlayhead } from './use-playhead';

export function StepsView({ lane, transport }: { lane: Lane; transport: Transport }) {
  const n = lane.length;
  const combined = patternForLane(lane);
  const genA = generator(lane.genA.pulses, n, lane.genA.rotation);
  const genB = lane.genB.pulses > 0 ? generator(lane.genB.pulses, n, lane.genB.rotation) : [];
  const hits = combined.reduce((s, h) => s + (h ? 1 : 0), 0);
  const play = usePlayhead(n, lane.resolutionTicks, transport);

  const ruler = [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor((3 * n) / 4)].map((i) => i + 1);

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
        <View style={styles.combinedRow}>
          {combined.map((hit, i) => (
            <StepBlock key={i} hit={!!hit} active={transport.playing && i === play} grow height={44} />
          ))}
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
        label={`GEN 1 · ${lane.genA.pulses} pulses${lane.genA.rotation ? ` · rot ${lane.genA.rotation}` : ''}`}
        pattern={genA}
        hitColor={color.stepHit}
      />

      {/* Gen 2 sub-row */}
      <GenRow
        swatch={color.label4}
        label={`GEN 2 · ${lane.genB.pulses} pulses${lane.genB.rotation ? ` · rot ${lane.genB.rotation}` : ''}`}
        pattern={genB.length ? genB : new Array(n).fill(0)}
        hitColor={color.label4}
      />
    </View>
  );
}

function GenRow({
  swatch,
  label,
  pattern,
  hitColor,
}: {
  swatch: string;
  label: string;
  pattern: number[];
  hitColor: string;
}) {
  return (
    <View style={styles.genBlock}>
      <View style={styles.genHead}>
        <View style={[styles.genSwatch, { backgroundColor: swatch }]} />
        <AppText style={styles.genLabel}>{label}</AppText>
      </View>
      <View style={styles.genRow}>
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

const styles = StyleSheet.create({
  container: { gap: 20, paddingVertical: 8, paddingHorizontal: 4 },
  block: { gap: 9 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.5,
    color: color.label3,
  },
  headMeta: { fontFamily: font.text, fontWeight: '600', fontSize: 12, lineHeight: 16, color: color.label3 },
  combinedRow: { flexDirection: 'row', gap: 5 },
  ruler: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 2 },
  rulerLabel: { fontFamily: font.mono, fontSize: 10, lineHeight: 12, color: color.labelDisabled },
  genBlock: { gap: 6 },
  genHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  genSwatch: { width: 9, height: 9, borderRadius: 2 },
  genLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 11, lineHeight: 14, color: color.label3 },
  genRow: { flexDirection: 'row', gap: 5 },
  genCell: { flex: 1, height: 16, borderRadius: radius.step },
});
