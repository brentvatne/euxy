/**
 * Wave 0 primitives gallery — the Sequencer tab's placeholder until the real
 * screen lands (Wave 2). Exercises every shared primitive against real seed-store
 * data so we can eyeball tokens, spacing, contrast, and hit targets on the sim.
 */
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { laneStepAt } from '@/core/euclid';
import { midiNoteName } from '@/core/note';
import { patternForLane, useLanes } from '@/state/selectors';
import { color, space } from '@/theme/tokens';
import {
  AppText,
  LaneRow,
  Segmented,
  SheetHeader,
  StatusDot,
  StepBlock,
  Stepper,
  TransportBar,
} from '@/components/ui';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText variant="micro" tone="tertiary" uppercase>
        {title}
      </AppText>
      {children}
    </View>
  );
}

export default function Gallery() {
  const insets = useSafeAreaInsets();
  const lanes = useLanes();
  const [view, setView] = useState<'lanes' | 'overview'>('lanes');
  const [playhead, setPlayhead] = useState(0);
  const [tempo, setTempo] = useState(120);

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + space.lg, paddingBottom: insets.bottom + space.xxl },
      ]}
    >
      <View style={styles.titleBlock}>
        <AppText variant="largeTitle">euxy</AppText>
        <AppText variant="footnote" tone="secondary">
          Wave 0 · primitives gallery
        </AppText>
      </View>

      <Section title="Typography">
        <AppText variant="title">Title 22</AppText>
        <AppText variant="headline">Headline 17</AppText>
        <AppText variant="body">Body 16 — the quick brown fox</AppText>
        <AppText variant="footnote" tone="secondary">
          Footnote 13 secondary
        </AppText>
        <AppText variant="body" mono>
          mono 90 3C 64 · F8 clock
        </AppText>
      </Section>

      <Section title="Status">
        <View style={styles.rowGap}>
          <StatusDot connected label="OP-XY" />
          <StatusDot connected={false} label="Offline" />
        </View>
      </Section>

      <Section title="Segmented (Lanes / Overview)">
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { label: 'Lanes', value: 'lanes' },
            { label: 'Overview', value: 'overview' },
          ]}
        />
      </Section>

      <Section title="Steppers">
        <View style={styles.rowGap}>
          <Stepper label="Tempo" value={tempo} onChange={setTempo} min={20} max={300} format={(v) => `${v}`} />
          <Stepper label="Playhead" value={playhead} onChange={setPlayhead} min={0} max={15} />
        </View>
      </Section>

      <Section title="Step blocks (E(4,16), playhead follows the stepper)">
        <View style={styles.stepStrip}>
          {patternForLane(lanes[0]).map((hit, i) => (
            <StepBlock key={i} hit={!!hit} active={i === playhead} />
          ))}
        </View>
      </Section>

      <Section title="Lane rows (seed pattern)">
        {lanes.map((lane) => {
          const pat = patternForLane(lane);
          const active = laneStepAt(playhead * lane.resolutionTicks, lane.resolutionTicks, lane.length);
          return (
            <LaneRow
              key={lane.id}
              title={lane.name ?? midiNoteName(lane.note)}
              subtitle={`T${lane.channel + 1} · ${midiNoteName(lane.note)} · ${lane.genA.pulses}/${lane.length}`}
              muted={lane.muted}
              solo={lane.solo}
            >
              {pat.map((hit, i) => (
                <StepBlock key={i} hit={!!hit} active={i === active} grow />
              ))}
            </LaneRow>
          );
        })}
      </Section>

      <Section title="Transport (jam / record)">
        <View style={{ gap: space.md }}>
          <TransportBar playing bpm={tempo} mode="jam" />
          <TransportBar playing={false} bpm={tempo} mode="record" />
        </View>
      </Section>

      <Section title="Sheet header">
        <View style={styles.sheetDemo}>
          <SheetHeader title="New Pattern" onCancel={() => {}} onDone={() => {}} />
        </View>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space.lg, gap: space.xl },
  titleBlock: { gap: space.xs },
  section: { gap: space.md },
  rowGap: { gap: space.lg },
  stepStrip: { flexDirection: 'row', gap: 3, flexWrap: 'wrap' },
  sheetDemo: { backgroundColor: color.surface, borderRadius: 12, overflow: 'hidden' },
});
