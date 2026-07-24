/**
 * New Pattern sheet (Paper node 2AH-0). Name / tempo / base-resolution form
 * presented as a form sheet. Create (header or the primary button) calls
 * newPattern({ name, bpm, baseResolutionTicks }) — which also makes it the
 * active pattern — then dismisses back to the Patterns list.
 */
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, SFSymbol, SheetHeader } from '@/components/ui';
import { ResolutionPicker } from '@/components/patterns/resolution-picker';
import { usePatterns } from '@/state/selectors';
import { useStore } from '@/state/store';
import { color, radius, space, timing } from '@/theme/tokens';

const BPM_MIN = 20;
const BPM_MAX = 300;

export default function NewPatternSheet() {
  const newPattern = useStore((s) => s.newPattern);
  const patterns = usePatterns();

  const suggestedName = useMemo(
    () => `Untitled ${String(patterns.length + 1).padStart(2, '0')}`,
    [patterns.length],
  );

  const [name, setName] = useState(suggestedName);
  const [bpm, setBpm] = useState(120);
  const [ticks, setTicks] = useState<number>(timing.defaultResolutionTicks);

  const create = () => {
    newPattern({ name: name.trim() || suggestedName, bpm, baseResolutionTicks: ticks });
    router.back();
  };

  const adjustBpm = (delta: number) =>
    setBpm((b) => Math.max(BPM_MIN, Math.min(BPM_MAX, b + delta)));

  return (
    <View style={styles.root}>
      <SheetHeader
        title="New Pattern"
        onCancel={() => router.back()}
        onDone={create}
        doneLabel="Create"
      />

      <View style={styles.body}>
        <Field label="Name">
          <View style={styles.inputCell}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={suggestedName}
              placeholderTextColor={color.label4}
              selectionColor={color.label}
              style={styles.input}
              returnKeyType="done"
              autoCapitalize="words"
              autoCorrect={false}
              onSubmitEditing={create}
            />
          </View>
        </Field>

        <Field label="Tempo">
          <View style={styles.tempoCell}>
            <AppText variant="body">BPM</AppText>
            <View style={styles.tempoControls}>
              <Pressable
                onPress={() => adjustBpm(-1)}
                disabled={bpm <= BPM_MIN}
                hitSlop={space.sm}
                style={[styles.tempoBtn, bpm <= BPM_MIN && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Decrease tempo"
              >
                <SFSymbol name="minus" size={18} tint={color.label} />
              </Pressable>
              <AppText variant="title" style={styles.tempoValue}>
                {bpm}
              </AppText>
              <Pressable
                onPress={() => adjustBpm(1)}
                disabled={bpm >= BPM_MAX}
                hitSlop={space.sm}
                style={[styles.tempoBtn, bpm >= BPM_MAX && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Increase tempo"
              >
                <SFSymbol name="plus" size={18} tint={color.label} />
              </Pressable>
            </View>
          </View>
        </Field>

        <Field label="Base resolution">
          <ResolutionPicker value={ticks} onChange={setTicks} />
        </Field>

        <Pressable
          onPress={create}
          style={({ pressed }) => [styles.createBtn, pressed && styles.createBtnPressed]}
          accessibilityRole="button"
        >
          <AppText variant="body" style={styles.createLabel}>
            Create pattern
          </AppText>
        </Pressable>
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText variant="caption" tone="secondary" uppercase style={styles.fieldLabel}>
        {label}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.lg },
  field: { gap: space.sm },
  fieldLabel: { marginLeft: 2 },
  inputCell: {
    backgroundColor: color.surface2,
    borderRadius: radius.cell,
    paddingHorizontal: space.lg,
    height: 52,
    justifyContent: 'center',
  },
  input: {
    color: color.label,
    fontSize: 16,
    fontFamily: 'SF Pro Text',
    padding: 0,
  },
  tempoCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface2,
    borderRadius: radius.cell,
    paddingLeft: space.lg,
    paddingRight: space.md,
    height: 52,
  },
  tempoControls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tempoBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.35 },
  tempoValue: { minWidth: 52, textAlign: 'center' },
  createBtn: {
    marginTop: space.sm,
    backgroundColor: color.label,
    borderRadius: radius.cell + 1,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createBtnPressed: { opacity: 0.85 },
  createLabel: { color: color.ground, fontWeight: '600' },
});
