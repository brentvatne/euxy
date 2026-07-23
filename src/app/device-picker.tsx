// Wave 0 stub — Agent D builds the Device picker (output/input selection).
import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText, SheetHeader } from '@/components/ui';
import { space } from '@/theme/tokens';

export default function DevicePickerSheet() {
  return (
    <View style={styles.root}>
      <SheetHeader title="MIDI Devices" onCancel={() => router.back()} />
      <View style={styles.body}>
        <AppText variant="footnote" tone="tertiary">
          Wave 0 stub · Agent D lists outputs/inputs here.
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  body: { flex: 1, padding: space.lg, gap: space.md },
});
