/**
 * Patterns library (Paper node GR-0). Large-title list of saved patterns with a
 * native header search bar and swipe-to-delete. Tapping a row loads it into the
 * sequencer and switches to the Sequencer tab. A + in the header opens the New
 * Pattern sheet. Empty state (node 2NR-0) shows when there are no patterns.
 */
import { useEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { haptics, useObserve } from '@/lib/shims';
// Gesture-handler's ScrollView, so the row swipe pan and the list scroll
// negotiate inside one gesture system — with RN's ScrollView the swipe
// could lose the horizontal drag on device (ROADMAP §11).
import { GestureHandlerRootView, ScrollView } from 'react-native-gesture-handler';

import { AppText, SFSymbol } from '@/components/ui';
import { PatternGlyph } from '@/components/patterns/pattern-glyph';
import { PatternRow } from '@/components/patterns/pattern-row';
import { isPresetPattern } from '@/state/presets';
import { usePatterns } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { Pattern } from '@/state/types';
import { color, radius, space } from '@/theme/tokens';

const SEQUENCER_HREF = '/(tabs)/(sequencer)' as const;

function HeaderAddButton() {
  return (
    <Pressable
      onPress={() => {
        haptics.impact('light');
        router.push('/new-pattern');
      }}
      hitSlop={space.md}
      style={({ pressed }) => (pressed ? styles.pressedDim : undefined)}
      accessibilityRole="button"
      accessibilityLabel="New pattern"
    >
      <SFSymbol name="plus" size={22} tint={color.label} />
    </Pressable>
  );
}

export default function PatternsScreen() {
  const patterns = usePatterns();
  const activeId = useStore((s) => s.activePatternId);
  const isPlaying = useStore((s) => s.transport.playing);
  const loadPattern = useStore((s) => s.loadPattern);
  const deletePattern = useStore((s) => s.deletePattern);
  const renamePattern = useStore((s) => s.renamePattern);
  const resetPreset = useStore((s) => s.resetPreset);
  const resetAllPresets = useStore((s) => s.resetAllPresets);
  const [query, setQuery] = useState('');

  const promptRename = (pattern: Pattern) => {
    Alert.prompt(
      'Rename pattern',
      undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Rename', onPress: (name?: string) => name?.trim() && renamePattern(pattern.id, name) },
      ],
      'plain-text',
      pattern.name,
    );
  };

  // Long-press context menu (roadmap: Rename / Change Icon / Delete). A plain
  // ActionSheetIOS instead of @expo/ui MenuView: its long-press trigger is a
  // SwiftUI ContextMenu whose Host/RNHostView re-parents the row — inside a
  // ReanimatedSwipeable that puts the swipe/tap gestures at risk, and this
  // must not break them.
  const showPatternMenu = (pattern: Pattern) => {
    const changeIcon = () =>
      router.push({ pathname: '/change-icon', params: { patternId: pattern.id } });
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        {
          title: pattern.name,
          options: ['Cancel', 'Rename…', 'Change Icon…', 'Delete'],
          cancelButtonIndex: 0,
          destructiveButtonIndex: 3,
        },
        (index) => {
          if (index === 1) promptRename(pattern);
          else if (index === 2) changeIcon();
          else if (index === 3) deletePattern(pattern.id);
        },
      );
      return;
    }
    // Android/web: Alert stand-in (no Alert.prompt there, so rename is iOS-only).
    Alert.alert(pattern.name, undefined, [
      { text: 'Change Icon…', onPress: changeIcon },
      { text: 'Delete', style: 'destructive', onPress: () => deletePattern(pattern.id) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const confirmRestoreAll = () => {
    Alert.alert(
      'Restore factory presets?',
      'The five factory patterns return to their original state — edits to them are replaced, and deleted ones come back. Your own patterns are untouched.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () => {
            resetAllPresets();
            haptics.success();
          },
        },
      ],
    );
  };

  // Per-route TTI for EAS Observe.
  const { markInteractive } = useObserve();
  useEffect(() => {
    markInteractive();
  }, [markInteractive]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patterns;
    return patterns.filter((p) => p.name.toLowerCase().includes(q));
  }, [patterns, query]);

  const openPattern = (id: string) => {
    // Tapping a pattern swaps it in place (hardware-style, see loadPattern)
    // so you can audition several in a row without leaving Patterns. Tapping
    // the already-active one is the "take me to it" gesture — jump to the
    // Sequencer without reloading (a reload would re-note the §15 "loaded"
    // moment and clear the lane selection for no reason).
    if (id === activeId) {
      router.navigate(SEQUENCER_HREF);
      return;
    }
    loadPattern(id);
  };

  return (
    <GestureHandlerRootView style={styles.flex}>
      <Stack.Screen options={{ headerRight: () => <HeaderAddButton /> }} />
      <Stack.SearchBar
        placeholder="Search"
        hideWhenScrolling={false}
        tintColor={color.label}
        textColor={color.label}
        hintTextColor={color.label3}
        headerIconColor={color.label3}
        onChangeText={(e) => setQuery(e.nativeEvent.text)}
      />
      <ScrollView
        style={styles.root}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
      >
        {patterns.length === 0 ? (
          <EmptyState />
        ) : filtered.length === 0 ? (
          <NoMatches query={query} />
        ) : (
          filtered.map((p, i) => (
            <PatternRow
              key={p.id}
              pattern={p}
              active={p.id === activeId}
              playing={p.id === activeId && isPlaying}
              first={i === 0}
              last={i === filtered.length - 1}
              onPress={() => openPattern(p.id)}
              onDelete={() => deletePattern(p.id)}
              onLongPress={() => showPatternMenu(p)}
              onReset={isPresetPattern(p.id) ? () => resetPreset(p.id) : undefined}
            />
          ))
        )}
        {patterns.length > 0 && !query.trim() ? (
          <Pressable
            onPress={confirmRestoreAll}
            style={({ pressed }) => [styles.restoreAll, pressed && styles.pressedDim]}
            accessibilityRole="button"
          >
            <AppText style={styles.restoreAllLabel}>Restore factory presets</AppText>
          </Pressable>
        ) : null}
      </ScrollView>
    </GestureHandlerRootView>
  );
}

/** Node 2NR-0 — first-run empty library. */
function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyGlyph}>
        <PatternGlyph size={72} twinkle />
      </View>
      <AppText variant="title" style={styles.emptyTitle}>
        No saved patterns
      </AppText>
      <AppText variant="subhead" tone="secondary" style={styles.emptyBody}>
        Patterns you save from the sequencer show up here. Create one to get started.
      </AppText>
      <Pressable
        onPress={() => router.push('/new-pattern')}
        style={({ pressed }) => [styles.newBtn, pressed && styles.newBtnPressed]}
        accessibilityRole="button"
      >
        <SFSymbol name="plus" size={16} tint={color.ground} />
        <AppText variant="headline" style={styles.newBtnLabel}>
          New pattern
        </AppText>
      </Pressable>
    </View>
  );
}

function NoMatches({ query }: { query: string }) {
  return (
    <View style={styles.noMatch}>
      <AppText variant="subhead" tone="tertiary">
        No patterns matching “{query.trim()}”
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  root: { flex: 1, backgroundColor: color.ground },
  content: { paddingHorizontal: space.lg, paddingBottom: space.xxl },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 140,
    paddingHorizontal: space.xl,
  },
  emptyGlyph: {
    opacity: 0.5,
    marginBottom: space.xl,
  },
  emptyTitle: { textAlign: 'center', marginBottom: space.sm },
  emptyBody: { textAlign: 'center', marginBottom: space.xl },
  newBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: color.label,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    borderRadius: radius.cell,
  },
  newBtnPressed: { opacity: 0.85 },
  newBtnLabel: { color: color.ground },
  noMatch: { alignItems: 'center', paddingTop: 80 },
  // iOS grouped-list footer action: quiet text button under the list.
  restoreAll: { alignItems: 'center', paddingVertical: 18 },
  restoreAllLabel: { fontSize: 13, lineHeight: 18, color: color.label3, fontWeight: '500' },
  pressedDim: { opacity: 0.65 },
});
