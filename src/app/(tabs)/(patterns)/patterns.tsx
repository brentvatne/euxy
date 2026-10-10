/**
 * Patterns library (Paper node GR-0). Large-title list of saved patterns with a
 * native header search bar and swipe-to-delete. Tapping a row loads it into the
 * sequencer and switches to the Sequencer tab. A + in the header opens the New
 * Pattern sheet, and a Sort by menu next to it orders the list (newest first by
 * default; picking the selected order again reverses it). Empty state (node
 * 2NR-0) shows when there are no patterns.
 */
import { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';

import { haptics } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
// Gesture-handler's ScrollView, so the row swipe pan and the list scroll
// negotiate inside one gesture system — with RN's ScrollView the swipe
// could lose the horizontal drag on device (ROADMAP §11).
import { GestureHandlerRootView, Pressable, ScrollView } from 'react-native-gesture-handler';

import { AppText, SFSymbol } from '@/components/ui';
import { reportFirstScreenLayout } from '@/components/boot-signal';
import { PatternGlyph } from '@/components/patterns/pattern-glyph';
import { PatternRow } from '@/components/patterns/pattern-row';
import { usePatternMenu } from '@/components/patterns/pattern-menu';
import { useRenamePrompt } from '@/components/patterns/rename-prompt';
import {
  SORT_OPTIONS,
  SortMenuButton,
  sortDirectionLabel,
  sortPatterns,
} from '@/components/patterns/sort-menu';
import { isPresetPattern } from '@/state/presets';
import { usePatterns } from '@/state/selectors';
import { useStore } from '@/state/store';
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
  const resetPreset = useStore((s) => s.resetPreset);
  const resetAllPresets = useStore((s) => s.resetAllPresets);
  const sort = useStore((s) => s.settings.patternSort);
  const sortDir = useStore((s) => s.settings.patternSortDir);
  const setPatternSort = useStore((s) => s.setPatternSort);
  const [query, setQuery] = useState('');

  const { promptRename, renamePrompt } = useRenamePrompt();
  const { showPatternMenu, patternMenu } = usePatternMenu(promptRename);

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
  useMarkInteractive();

  const filtered = useMemo(() => {
    const ordered = sortPatterns(patterns, sort, sortDir);
    const q = query.trim().toLowerCase();
    if (!q) return ordered;
    return ordered.filter((p) => p.name.toLowerCase().includes(q));
  }, [patterns, query, sort, sortDir]);

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
      <Stack.Screen
        options={{
          // Two native bar items, each with `sharesBackground: false`. A single
          // headerRight element is ONE UIBarButtonItem, so both glyphs landed in
          // one shared Liquid Glass capsule and read as a button group; opting
          // each item out of the shared background gives Sort and + a capsule of
          // their own. (A fixed spacer between two custom items only widens the
          // shared capsule — it does not split it — and `hidesSharedBackground`
          // drops the glass entirely, so neither is the fix.)
          unstable_headerRightItems: () => [
            {
              type: 'menu',
              label: 'Sort',
              accessibilityLabel: 'Sort patterns',
              icon: { type: 'sfSymbol', name: 'arrow.up.arrow.down' },
              tintColor: color.label,
              sharesBackground: false,
              menu: {
                title: 'Sort by',
                items: SORT_OPTIONS.map((o) => ({
                  type: 'action',
                  label: o.title,
                  // Every row keeps its own glyph. The selected one states its
                  // direction in the secondary line (UIAction.subtitle), and
                  // tapping it again flips desc ⇄ asc (setPatternSort).
                  description: o.id === sort ? sortDirectionLabel(sort, sortDir) : undefined,
                  icon: { type: 'sfSymbol', name: o.image },
                  state: o.id === sort ? 'on' : 'off',
                  onPress: () => {
                    haptics.selection();
                    setPatternSort(o.id);
                  },
                })),
              },
            },
            {
              type: 'button',
              label: 'New',
              accessibilityLabel: 'New pattern',
              icon: { type: 'sfSymbol', name: 'plus' },
              tintColor: color.label,
              sharesBackground: false,
              onPress: () => {
                haptics.impact('light');
                router.push('/new-pattern');
              },
            },
          ],
          // Non-iOS has no header items API; keep the plain row there.
          headerRight: () => (
            <View style={styles.headerActions}>
              <SortMenuButton sort={sort} dir={sortDir} onChange={setPatternSort} />
              <HeaderAddButton />
            </View>
          ),
        }}
      />
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
        // Boot layout gate — see boot-signal.ts. Every tab root reports so the
        // boot never waits on a route that didn't mount. First reporter wins.
        onLayout={reportFirstScreenLayout}
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
      {patternMenu}
      {renamePrompt}
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
  // Sort menu then +, the iOS order for a large-title header's trailing group.
  // Only used off iOS, where the header items API is unavailable.
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
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
