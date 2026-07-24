/**
 * Sequencer header (Paper 7L-0): pattern name + chevron on the left — tapping
 * it opens the native pattern menu (new / rename / reset / clear) — and the
 * connection pill on the right. Lane actions live in the floating action bar
 * (floating-actions.tsx), not here.
 */
import { MenuView } from '@expo/ui/community/menu';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';

export type PatternMenuAction = 'new' | 'rename' | 'reset' | 'clear';

export function SequencerNav({
  patternName,
  connected,
  deviceName,
  onMenuAction,
}: {
  patternName: string;
  connected: boolean;
  deviceName: string;
  onMenuAction: (action: PatternMenuAction) => void;
}) {
  return (
    <View style={styles.nav}>
      <MenuView
        title={patternName}
        actions={[
          { id: 'new', title: 'New pattern', image: 'plus' },
          { id: 'rename', title: 'Rename', image: 'pencil' },
          { id: 'reset', title: 'Reset to default lanes', image: 'arrow.counterclockwise' },
          { id: 'clear', title: 'Clear all lanes', image: 'trash', attributes: { destructive: true } },
        ]}
        onPressAction={({ nativeEvent }) => onMenuAction(nativeEvent.event as PatternMenuAction)}
        style={styles.patternTrigger}
      >
        <View style={styles.pattern} accessibilityRole="button" accessibilityLabel={`Pattern ${patternName} — menu`}>
          <AppText style={styles.patternName} numberOfLines={1}>
            {patternName}
          </AppText>
          <Svg width={13} height={13} viewBox="0 0 24 24" style={styles.chevron}>
            <Path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke={color.label}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </MenuView>
      <View style={styles.right}>
        <View style={styles.pill}>
          <View
            style={[styles.pillDot, { backgroundColor: connected ? color.connected : color.label4 }]}
          />
          <AppText style={styles.pillText}>{deviceName}</AppText>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Paper 7L-0: pt 4 / pb 10 / px 16.
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  // flex:1 (not just flexShrink) — the MenuView native host otherwise caps
  // the title at its own measured width and truncates long pattern names even
  // with free row space (TestFlight feedback 2026-07-24: "the title is
  // truncated too aggressively").
  patternTrigger: { flex: 1, marginRight: 12 },
  pattern: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' },
  patternName: {
    flexShrink: 1,
    fontFamily: font.display,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.44,
    color: '#FFFFFF',
  },
  chevron: { marginTop: 4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: color.surface,
  },
  pillDot: { width: 7, height: 7, borderRadius: 999 },
  pillText: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: '#EBEBEB' },

});
