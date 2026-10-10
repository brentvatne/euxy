/**
 * Pattern actions sheet — the Patterns list's long-press menu on Android and
 * web. iOS gets a native ActionSheetIOS; `Alert.alert` was the stand-in here,
 * but Android caps alerts at three buttons, so Delete, Restore Default and
 * Cancel silently fell off. Same actions as the iOS sheet: Rename…, Change
 * Icon…, Clone, Restore Default (factory presets only), Delete. Actions that
 * open another sheet `replace` this one so the list underneath never flashes.
 *
 * Route params: `patternId` — the pattern the menu was opened on.
 */
import { useEffect, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { IconClose } from '@/components/midi/icons';
import { AppText } from '@/components/ui';
import { haptics } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { isPresetPattern } from '@/state/presets';
import { useStore } from '@/state/store';
import { color, font, radius, space } from '@/theme/tokens';

type Action = { key: string; label: string; onPress: () => void; destructive?: boolean };

export default function PatternActionsSheet() {
  useMarkInteractive();
  const { patternId } = useLocalSearchParams<{ patternId: string }>();
  // Captured on open: Delete removes the pattern from the store before the
  // sheet has finished dismissing, and the title must not blank out (or the
  // sheet navigate again) mid-animation.
  const live = useStore((s) => s.patterns.find((p) => p.id === patternId));
  const [pattern] = useState(live);
  const deletePattern = useStore((s) => s.deletePattern);
  const duplicatePattern = useStore((s) => s.duplicatePattern);
  const resetPreset = useStore((s) => s.resetPreset);

  useEffect(() => {
    if (!pattern) router.back();
  }, [pattern]);

  if (!pattern) return null;

  const actions: Action[] = [
    {
      key: 'rename',
      label: 'Rename…',
      onPress: () =>
        router.replace({ pathname: '/rename-pattern', params: { patternId: pattern.id } }),
    },
    {
      key: 'icon',
      label: 'Change Icon…',
      onPress: () =>
        router.replace({ pathname: '/change-icon', params: { patternId: pattern.id } }),
    },
    {
      key: 'clone',
      label: 'Clone',
      onPress: () => {
        haptics.impact('light');
        // duplicatePattern's set() is synchronous, so the copy is in the store
        // by the time the rename sheet looks it up.
        const newId = duplicatePattern(pattern.id);
        router.replace({ pathname: '/rename-pattern', params: { patternId: newId } });
      },
    },
    ...(isPresetPattern(pattern.id)
      ? [
          {
            key: 'restore',
            label: 'Restore Default',
            onPress: () => {
              haptics.impact('light');
              resetPreset(pattern.id);
              router.back();
            },
          },
        ]
      : []),
    {
      key: 'delete',
      label: 'Delete',
      destructive: true,
      onPress: () => {
        deletePattern(pattern.id);
        router.back();
      },
    },
  ];

  const corner = (i: number) => {
    if (i === 0) return styles.first;
    if (i === actions.length - 1) return styles.last;
    return styles.middle;
  };

  return (
    <View style={styles.root}>
      <View style={styles.header}>
        <AppText style={styles.title} numberOfLines={1}>
          {pattern.name}
        </AppText>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Close"
          style={styles.closeBtn}
          hitSlop={space.sm}
        >
          <IconClose />
        </Pressable>
      </View>
      <View style={styles.list}>
        {actions.map((a, i) => (
          <Pressable
            key={a.key}
            onPress={a.onPress}
            accessibilityRole="button"
            style={({ pressed }) => [styles.row, corner(i), pressed && styles.pressed]}
          >
            <AppText style={[styles.label, a.destructive && styles.destructive]}>{a.label}</AppText>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

// Same grouped-list recipe as the device picker (Paper 29L-0).
const OUTER = radius.cell;
const INNER = 2;
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface, paddingBottom: space.xxl },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 20,
    paddingBottom: 10,
    paddingHorizontal: space.xl,
    gap: space.md,
  },
  title: { flex: 1, fontSize: 20, lineHeight: 24, fontWeight: '700', color: color.label },
  closeBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.chip,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: { paddingTop: space.xs, paddingHorizontal: space.lg, gap: 1 },
  row: { backgroundColor: color.surface2, paddingVertical: 15, paddingHorizontal: space.lg },
  pressed: { opacity: 0.6 },
  label: { fontFamily: font.text, fontSize: 16, lineHeight: 20, color: color.label },
  destructive: { color: color.danger },
  first: { borderTopLeftRadius: OUTER, borderTopRightRadius: OUTER, borderBottomLeftRadius: INNER, borderBottomRightRadius: INNER },
  middle: { borderRadius: INNER },
  last: { borderTopLeftRadius: INNER, borderTopRightRadius: INNER, borderBottomLeftRadius: OUTER, borderBottomRightRadius: OUTER },
});
