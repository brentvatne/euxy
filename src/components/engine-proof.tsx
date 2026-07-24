/**
 * Engine proof harness (Wave 1). Minimal, NOT the final Sequencer — it exists to
 * prove the timing engine end to end on the sim: TransportBar Play starts the
 * lookahead scheduler, and a playhead overlay sweeps the seed lanes' step strips
 * driven entirely by a Reanimated shared value on the UI thread (no per-tick
 * re-render). Reuses shared primitives + tokens.
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { engine } from '@/core/engine';
import { midiNoteName } from '@/core/note';
import { playheadPlaying, playheadTick } from '@/core/playhead';
import { laneAudible, patternForLane, useAnySolo, useLanes } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { Lane } from '@/state/types';
import { color, radius, space, timing } from '@/theme/tokens';
import { AppText, LaneRow, StatusDot, Stepper, StepBlock, TransportBar } from '@/components/ui';

const GAP = 4;
const STRIP_H = 22;

/** One lane's step strip: blocks render once; the playhead is an animated overlay. */
function LaneStrip({ lane }: { lane: Lane }) {
  const pattern = patternForLane(lane);
  const n = pattern.length;
  const [width, setWidth] = useState(0);
  const blockW = width > 0 ? (width - GAP * (n - 1)) / n : 0;
  const res = lane.resolutionTicks;
  const len = lane.length;

  const overlayStyle = useAnimatedStyle(() => {
    const tick = playheadTick.value;
    const step = res > 0 && len > 0 ? Math.floor(tick / res) % len : 0;
    return {
      opacity: playheadPlaying.value,
      width: blockW,
      transform: [{ translateX: step * (blockW + GAP) }],
    };
  });

  return (
    <View style={styles.stripRoot} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.stripBlocks}>
        {pattern.map((hit, i) => (
          <StepBlock key={i} hit={!!hit} grow height={STRIP_H} />
        ))}
      </View>
      {blockW > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.playhead, overlayStyle]} />
      ) : null}
    </View>
  );
}

export default function EngineProof() {
  const insets = useSafeAreaInsets();
  const lanes = useLanes();
  const anySolo = useAnySolo();
  const transport = useStore((s) => s.transport);
  const togglePlay = useStore((s) => s.togglePlay);
  const stop = useStore((s) => s.stop);
  const setBpm = useStore((s) => s.setBpm);
  const toggleMute = useStore((s) => s.toggleMute);
  const toggleSolo = useStore((s) => s.toggleSolo);

  // Wire the engine's store subscription + MIDI port up once.
  useEffect(() => {
    engine.init();
    return () => {
      // Leaving the harness stops sound but leaves the engine instance intact.
      if (engine.isRunning()) stop();
    };
  }, [stop]);

  return (
    <View style={styles.root}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.lg }]}
      >
        <View style={styles.titleBlock}>
          <AppText variant="largeTitle">euxy</AppText>
          <AppText variant="footnote" tone="secondary">
            Wave 1 · engine proof — Play drives the scheduler; the playhead runs on the UI thread
          </AppText>
        </View>

        <View style={styles.rowGap}>
          <StatusDot connected label="Engine ready" />
          <Stepper
            label="Tempo"
            value={transport.bpm}
            onChange={setBpm}
            min={20}
            max={300}
            format={(v) => `${v} BPM`}
          />
        </View>

        <AppText variant="micro" tone="tertiary" uppercase>
          {`Seed lanes · ${timing.ppqn} PPQN · lookahead ${timing.lookaheadMs}ms / ${timing.schedulerIntervalMs}ms`}
        </AppText>

        <View style={styles.lanes}>
          {lanes.map((lane) => (
            <LaneRow
              key={lane.id}
              title={lane.name ?? midiNoteName(lane.note)}
              subtitle={`T${lane.channel + 1} · ${midiNoteName(lane.note)} · ${lane.genA.pulses}/${lane.length} · ${
                laneAudible(lane, anySolo) ? 'on' : 'muted'
              }`}
              muted={lane.muted}
              solo={lane.solo}
              onToggleMute={() => toggleMute(lane.id)}
              onToggleSolo={() => toggleSolo(lane.id)}
            >
              <LaneStrip lane={lane} />
            </LaneRow>
          ))}
        </View>
      </ScrollView>

      <View style={{ paddingBottom: insets.bottom }}>
        <TransportBar
          playing={transport.playing}
          bpm={transport.bpm}
          mode={transport.clockMode}
          onTogglePlay={togglePlay}
          onStop={stop}
          onSkipToStart={stop}
          onPanic={() => engine.panic()}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.ground },
  scroll: { flex: 1 },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl, gap: space.lg },
  titleBlock: { gap: space.xs },
  rowGap: { gap: space.lg },
  lanes: { gap: 0 },
  stripRoot: { flex: 1, position: 'relative' },
  stripBlocks: { flexDirection: 'row', gap: GAP },
  playhead: {
    position: 'absolute',
    top: 0,
    height: STRIP_H,
    borderRadius: radius.step,
    borderWidth: 2,
    borderColor: color.label,
    backgroundColor: 'transparent',
  },
});
