/**
 * Sequencer compact header (Paper 7L-0 + 7Z-0): pattern name + chevron on the
 * left — tapping it opens the native pattern menu (new / rename / reset /
 * clear) — and the connection pill on the right; then the Lanes | Overview
 * toggle. The toggle is sequencer-local: Paper gives it the muted gray active
 * fill (#3A3A3C on #1C1C1E), unlike the shared white-active Segmented.
 */
import { MenuView } from '@expo/ui/community/menu';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, font } from '@/theme/tokens';
import { AppText, SFSymbol } from '@/components/ui';

export type SequencerView = 'lanes' | 'overview';

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

/**
 * Mutate ▸ undo pair (Paper 7Z-0 "Mutate group"): each mutate press nudges the
 * pattern slightly (KeyStep 37 model); undo steps back through the history.
 */
export function MutateControls({
  canUndo,
  onMutate,
  onUndo,
}: {
  canUndo: boolean;
  onMutate: () => void;
  onUndo: () => void;
}) {
  return (
    <View style={styles.mutateGroup}>
      <Pressable
        onPress={onMutate}
        style={({ pressed }) => [styles.mutateBtn, pressed && styles.mutatePressed]}
        accessibilityRole="button"
        accessibilityLabel="Mutate pattern"
      >
        <SFSymbol name="shuffle" size={15} tint={color.label} />
      </Pressable>
      <Pressable
        onPress={onUndo}
        disabled={!canUndo}
        style={({ pressed }) => [styles.mutateBtn, pressed && styles.mutatePressed]}
        accessibilityRole="button"
        accessibilityLabel="Undo mutation"
        accessibilityState={{ disabled: !canUndo }}
      >
        <SFSymbol name="arrow.uturn.backward" size={15} tint={canUndo ? color.label : color.label4} />
      </Pressable>
    </View>
  );
}

export function LanesOverviewToggle({
  value,
  onChange,
  right,
}: {
  value: SequencerView;
  onChange: (v: SequencerView) => void;
  /** Optional trailing controls sharing the row (Paper 7Z-0: mutate group). */
  right?: React.ReactNode;
}) {
  const segs: { v: SequencerView; label: string }[] = [
    { v: 'lanes', label: 'Lanes' },
    { v: 'overview', label: 'Overview' },
  ];
  return (
    <View style={styles.toggleWrap}>
      <View style={styles.track}>
        {segs.map(({ v, label }) => {
          const active = v === value;
          return (
            <Pressable
              key={v}
              onPress={() => onChange(v)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.segment, active && styles.segmentActive]}
            >
              <AppText style={active ? styles.segTextActive : styles.segTextInactive}>
                {label}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      {right}
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
  patternTrigger: { flexShrink: 1 },
  pattern: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  patternName: {
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

  // Paper 7Z-0: pt 2 / pb 14 / px 16; track #1C1C1E, active #3A3A3C. The
  // toggle flexes and the mutate group sits trailing, gap 12.
  toggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingTop: 2,
    paddingBottom: 14,
    paddingHorizontal: 16,
  },
  track: { flex: 1, flexDirection: 'row', padding: 2, borderRadius: 9, backgroundColor: color.surface },

  // Paper 7Z-0 "Mutate group": 32px circles on surface2.
  mutateGroup: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mutateBtn: {
    width: 32,
    height: 32,
    borderRadius: 999,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutatePressed: { opacity: 0.6 },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 7,
  },
  segmentActive: { backgroundColor: color.surface3 },
  segTextActive: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: '#FFFFFF' },
  segTextInactive: { fontFamily: font.text, fontWeight: '500', fontSize: 13, lineHeight: 16, color: color.label25 },
});
