/**
 * Patterns library (Paper node GR-0). Large-title list of saved patterns with a
 * native header search bar and swipe-to-delete. Tapping a row loads it into the
 * sequencer and switches to the Sequencer tab. A + in the header opens the New
 * Pattern sheet. Empty state (node 2NR-0) shows when there are no patterns.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, router } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppText, SFSymbol } from '@/components/ui';
import { PatternGlyph } from '@/components/patterns/pattern-glyph';
import { PatternRow } from '@/components/patterns/pattern-row';
import { usePatterns } from '@/state/selectors';
import { useStore } from '@/state/store';
import { color, radius, space } from '@/theme/tokens';

const SEQUENCER_HREF = '/(tabs)/(sequencer)' as const;

function HeaderAddButton() {
  return (
    <Pressable
      onPress={() => router.push('/new-pattern')}
      hitSlop={space.md}
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
  const loadPattern = useStore((s) => s.loadPattern);
  const deletePattern = useStore((s) => s.deletePattern);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return patterns;
    return patterns.filter((p) => p.name.toLowerCase().includes(q));
  }, [patterns, query]);

  const openPattern = (id: string) => {
    loadPattern(id);
    router.navigate(SEQUENCER_HREF);
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
              first={i === 0}
              last={i === filtered.length - 1}
              onPress={() => openPattern(p.id)}
              onDelete={() => deletePattern(p.id)}
            />
          ))
        )}
      </ScrollView>
    </GestureHandlerRootView>
  );
}

/** Node 2NR-0 — first-run empty library. */
function EmptyState() {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyGlyph}>
        <PatternGlyph size={72} />
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
});
