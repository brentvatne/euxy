/**
 * New Pattern sheet (Paper node 2AH-0). Name / icon / tempo / base-resolution
 * form presented as a form sheet. Create (header or the primary button) calls
 * newPattern({ name, icon, bpm, baseResolutionTicks }) — which also makes it
 * the active pattern — then dismisses back to the Patterns list.
 *
 * The ICON group is the shared picker as one sideways-scrolling row: the
 * sheet's 0.6 detent can't host the 5-row grid, and a horizontal strip keeps
 * every glyph reachable without burying the Tempo/Create controls. The
 * default is a shuffled glyph (icon-picker spec: every pattern gets a
 * distinct icon with zero effort), pre-selected and scrolled into view.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { router } from 'expo-router';

import { AppText, SFSymbol, SheetHeader } from '@/components/ui';
import { IconClear, IconDice } from '@/components/ui/icons';
import { Key } from '@/components/ui/key';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import { ValueFilm } from '@/components/ui/value-film';
import { haptics } from '@/lib/shims';
import { generatePatternName } from '@/lib/pattern-names';
import { allChipNames, randomChipName, type ChipName } from '@/components/patterns/chips';
import { IconPicker } from '@/components/patterns/icon-picker';
import { ResolutionPicker } from '@/components/patterns/resolution-picker';
import { useStore } from '@/state/store';
import { color, font, radius, space, timing } from '@/theme/tokens';
import { useMarkInteractive } from '@/lib/use-mark-interactive';

/** Tempo bounds — shared with the Tempo sheet (app/tempo.tsx). */
export const BPM_MIN = 20;
export const BPM_MAX = 300;

/** Chip size for the horizontal ICON row (the grid's 76 is too tall here). */
const ICON_CHIP_SIZE = 56;
/** One chip slot's stride in the row: chip + slot border/padding + gap. */
const ICON_CHIP_STRIDE = ICON_CHIP_SIZE + 6 + 10;

export default function NewPatternSheet() {
  useMarkInteractive();
  const newPattern = useStore((s) => s.newPattern);

  // §9: names are GENERATED, never "Untitled N". The sheet opens with a
  // suggestion pre-filled; dice rerolls it, × clears back to the placeholder
  // (which stays the latest suggestion so a blank Create still lands on it).
  const [suggestion, setSuggestion] = useState(() => generatePatternName());
  const [name, setName] = useState(suggestion);
  const [icon, setIcon] = useState<ChipName>(() => randomChipName());
  const [bpm, setBpm] = useState(120);
  const [ticks, setTicks] = useState<number>(timing.defaultResolutionTicks);

  // Land the row's initial scroll on the shuffled default (a peek of the
  // previous chip signals there's more to the left).
  const initialIconOffset = useMemo(() => {
    const index = allChipNames().indexOf(icon);
    return { x: Math.max(0, index * ICON_CHIP_STRIDE - space.lg), y: 0 };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial only
  }, []);

  const create = () => {
    haptics.success();
    newPattern({ name: name.trim() || suggestion, icon, bpm, baseResolutionTicks: ticks });
    router.back();
  };

  // Dice: a fresh suggestion replaces whatever's in the field (never repeats
  // the current name); × clears to the placeholder. Neither disables (§9).
  const rerollName = () => {
    haptics.selection();
    const next = generatePatternName(name.trim() || suggestion);
    setSuggestion(next);
    setName(next);
  };
  const clearName = () => setName('');

  const adjustBpm = (delta: number) => {
    const next = Math.max(BPM_MIN, Math.min(BPM_MAX, bpm + delta));
    if (next !== bpm) {
      haptics.selection();
      setBpm(next);
    }
  };

  return (
    <View style={styles.root}>
      {/* §9 header padding: same 13px "sheet top" band as the Edit Lane sheet
          (Paper 16Z-0) — the native grabber floats over it. */}
      <View style={styles.grabberSpace} />
      <SheetHeader
        title="New Pattern"
        onCancel={() => router.back()}
        onDone={create}
        doneLabel="Create"
      />

      {/* The form must SCROLL — at the sheet's detent the Create button sits
          past the fold (Brent's report). collapsable={false} keeps this
          wrapper in the native tree so the ScrollView is NOT a direct child
          of the screen content wrapper — react-native-screens' formSheet
          frame correction otherwise resizes it over the header (see
          docs/feedback/form-sheets.md + lane-editor). RNKC scroll view =
          the screen's ONE keyboard owner (Name field). */}
      <View style={styles.scroll} collapsable={false}>
      <KeyboardAwareScrollView
        bottomOffset={24}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.body}
      >
        <Field label="Name">
          {/* Paper 8OY-0 name-field row: input + 30px × key + 30px dice key
              (dice = the 5-pip mutate glyph: one vocabulary for "random"). */}
          <View style={styles.inputCell}>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder={suggestion}
              placeholderTextColor={color.label4}
              selectionColor={color.label}
              style={styles.input}
              returnKeyType="done"
              autoCapitalize="words"
              autoCorrect={false}
              onSubmitEditing={create}
            />
            <Key
              onPress={clearName}
              hitSlop={7} // 30px key → 44px hit target
              style={styles.fieldKey}
              accessibilityRole="button"
              accessibilityLabel="Clear name"
            >
              <IconClear size={11} />
            </Key>
            <Key
              onPress={rerollName}
              haptic="none" // rerollName fires haptics.selection() itself
              hitSlop={7}
              style={styles.fieldKey}
              accessibilityRole="button"
              accessibilityLabel="New name suggestion"
            >
              <IconDice size={14} />
            </Key>
          </View>
        </Field>

        <Field label="Icon">
          {/* collapsable={false} frame keeps the ScrollView out of the
              formSheet frame-correction path — react-native-screens
              otherwise paints it over the sheet header (see change-icon). */}
          <View style={styles.iconStripFrame} collapsable={false}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentOffset={initialIconOffset}
              contentContainerStyle={styles.iconRow}
              style={styles.iconStrip}
            >
              <IconPicker
                selected={icon}
                onSelect={setIcon}
                horizontal
                size={ICON_CHIP_SIZE}
              />
            </ScrollView>
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
              <View style={styles.tempoValueBox}>
                {/* Commit light behind the digits (same as the Tempo sheet). */}
                <ValueFilm value={bpm} style={styles.tempoValueFilm} />
                <AppText variant="title" style={styles.tempoValue}>
                  {bpm}
                </AppText>
              </View>
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

        <Field label="Base Resolution">
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
      </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

/** Section headers match the Edit Lane sheet (Brent: that one is correct) —
 * title case, 17/22 semibold label3 — NOT small-caps micro labels. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  grabberSpace: { height: 13 },
  scroll: { flex: 1 },
  // xxl group gap — the sections need air between them (Brent).
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.xxl,
  },
  field: { gap: space.sm },
  fieldLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
    color: color.label3,
    marginLeft: 2,
  },
  // Paper 8OY-0: pl 16 / pr 12, gap 10, keys trail the flexed input.
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
    fontFamily: 'SF Pro Text',
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
  // Bleed the strip to the sheet edges so chips scroll under them; content
  // padding restores the body's gutter at rest. The frame's explicit height
  // (chip + selection ring) anchors the strip while it's collapsable={false}.
  iconStripFrame: { height: ICON_CHIP_SIZE + 6 },
  iconStrip: { marginHorizontal: -space.lg },
  iconRow: { paddingHorizontal: space.lg },
  tempoValue: { minWidth: 52, textAlign: 'center' },
  tempoValueBox: { justifyContent: 'center' },
  tempoValueFilm: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -6,
    right: -6,
    borderRadius: 6,
    backgroundColor: '#F6F4F4',
  },
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
