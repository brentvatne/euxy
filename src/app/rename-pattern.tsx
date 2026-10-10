/**
 * Rename sheet. iOS renames through `Alert.prompt`, which Android and web do
 * not have — there the Patterns list, its long-press menu and the Sequencer's
 * pattern menu open this form sheet instead. One field, Done commits via
 * `renamePattern`; a blank name is a no-op (the store keeps the old one).
 *
 * Route params: `patternId` — the pattern to rename.
 */
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';

import { AppText, SheetHeader } from '@/components/ui';
import { IconClear } from '@/components/ui/icons';
import { Key } from '@/components/ui/key';
import { haptics } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { useStore } from '@/state/store';
import { color, font, radius, space, selection } from '@/theme/tokens';
import { useSheetBottomInset } from '@/components/ui/use-sheet-bottom-inset';

export default function RenamePatternSheet() {
  useMarkInteractive();
  const bottomInset = useSheetBottomInset();
  const { patternId } = useLocalSearchParams<{ patternId: string }>();
  const pattern = useStore((s) => s.patterns.find((p) => p.id === patternId));
  const renamePattern = useStore((s) => s.renamePattern);
  const [name, setName] = useState(pattern?.name ?? '');

  const commit = () => {
    if (pattern && name.trim()) {
      haptics.success();
      renamePattern(pattern.id, name);
    }
    router.back();
  };

  return (
    <View style={styles.root}>
      <View style={styles.grabberSpace} />
      <SheetHeader
        title="Rename Pattern"
        onCancel={() => router.back()}
        onDone={commit}
        doneLabel="Rename"
        doneDisabled={!name.trim()}
      />
      <View style={[styles.body, { paddingBottom: space.xxl + bottomInset }]}>
        <AppText style={styles.fieldLabel}>Name</AppText>
        <View style={styles.inputCell}>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={pattern?.name}
            placeholderTextColor={color.label4}
            selectionColor={selection}
            cursorColor={color.label}
            style={styles.input}
            returnKeyType="done"
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            selectTextOnFocus
            onSubmitEditing={commit}
          />
          <Key
            onPress={() => setName('')}
            hitSlop={7}
            style={styles.fieldKey}
            accessibilityRole="button"
            accessibilityLabel="Clear name"
          >
            <IconClear size={11} />
          </Key>
        </View>
      </View>
    </View>
  );
}

// Same field recipe as the New Pattern sheet (Paper 8OY-0).
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  grabberSpace: { height: 13 },
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.sm,
  },
  fieldLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
    color: color.label3,
    marginLeft: 2,
  },
  inputCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: color.surface2,
    borderRadius: radius.cell,
    paddingLeft: space.lg,
    paddingRight: space.md,
    height: 52,
  },
  input: {
    flex: 1,
    color: color.label,
    fontSize: 16,
    fontFamily: font.text,
    padding: 0,
  },
  fieldKey: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: color.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
