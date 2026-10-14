// About — what euxy is, which build is running, and where to find the source.
// Pushed from the info button in the Settings header.
import Constants from 'expo-constants';
import { Linking, ScrollView } from 'react-native';

import { Group, PushRow, SectionHeader, ValueRow } from '@/components/midi/components';
import { AppText } from '@/components/ui';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { space } from '@/theme/tokens';
import { themed, useStyles } from '@/theme/theme';

const SOURCE_URL = 'https://github.com/brentvatne/euxy';

export default function AboutScreen() {
  useMarkInteractive();
  const styles = useStyles(stylesFor);
  const version = Constants.expoConfig?.version ?? '–';
  return (
    <ScrollView style={styles.root} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.content}>
      <AppText style={styles.lede}>
        A pocket step sequencer for the OP-XY. Build a pattern here, and euxy plays it over MIDI while you
        tweak lanes live.
      </AppText>

      <SectionHeader>App</SectionHeader>
      <Group>
        <ValueRow pos="first" label="Version" value={version} />
        <ValueRow pos="last" label="Made for" value="OP-XY" />
      </Group>

      <SectionHeader>Links</SectionHeader>
      <Group>
        <PushRow pos="first" label="Source code" onPress={() => void Linking.openURL(SOURCE_URL)} />
        <PushRow pos="last" label="Report a problem" onPress={() => void Linking.openURL(`${SOURCE_URL}/issues/new`)} />
      </Group>
    </ScrollView>
  );
}

const stylesFor = themed(({ color }) => ({
  root: { flex: 1, backgroundColor: color.ground },
  content: { paddingBottom: 40 },
  lede: {
    fontSize: 15,
    lineHeight: 21,
    color: color.label25,
    paddingHorizontal: space.xl + space.md,
    paddingTop: space.md,
  },
}));
