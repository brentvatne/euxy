// Wave 0 stub — Agent B builds the Lane Editor (Steps + Graph dot-matrix ring +
// 64-step). Opened via router.push('/lane-editor') with a selected lane.
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useLane } from '@/state/selectors';
import { useStore } from '@/state/store';
import { midiNoteName } from '@/core/note';
import { AppText, SheetHeader } from '@/components/ui';
import { space } from '@/theme/tokens';

export default function LaneEditorSheet() {
  const laneId = useStore((s) => s.selection.laneId);
  const lane = useLane(laneId);

  return (
    <View style={styles.root}>
      <SheetHeader title="Lane" onDone={() => router.back()} />
      <View style={styles.body}>
        <AppText variant="body" tone="secondary">
          {lane
            ? `${lane.name ?? midiNoteName(lane.note)} — ${lane.genA.pulses}/${lane.length}`
            : 'No lane selected.'}
        </AppText>
        <AppText variant="footnote" tone="tertiary">
          Wave 0 stub · Agent B builds Steps + Graph views here.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: space.lg, gap: space.md },
});
