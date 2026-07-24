/**
 * Lane Editor form sheet (Paper "02 · Lane Editor" + "02b · scrolled"). The
 * vertical D layout: the combined pattern is a compact pinned card (always
 * visible; a drop shadow appears once the form scrolls beneath it), then
 * sections ordered by how often they're touched — Generator 1/2 (sliders),
 * Combine (op · steps · track rotate), Sound (note + track), More (name,
 * resolution, velocity, gate as a compact grouped list), Randomize, Delete.
 * Section headers use the current-iOS style (title case 17/22 semibold), like
 * the MIDI screen. No Steps|Graph toggle — the combined card is the only view.
 */
import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import { MenuView } from '@expo/ui/community/menu';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';

import { midi } from '@/components/midi/runtime';
import { midiNoteName } from '@/core/note';
import { useLane } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { CombineOp } from '@/state/types';
import { color, font, radius, space } from '@/theme/tokens';
import { AppText, SFSymbol, SheetHeader } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import { CombinedCard } from '@/components/lane-editor/combined-card';
import { PickerBar } from '@/components/lane-editor/picker-bar';
import { SliderRow } from '@/components/lane-editor/slider-row';

const OP_OPTIONS: { label: string; value: CombineOp }[] = [
  { label: 'OR', value: 'OR' },
  { label: 'AND', value: 'AND' },
  { label: 'XOR', value: 'XOR' },
  { label: 'A>B', value: 'A>B' },
];

/** Resolution presets → ticks per step at 24 PPQN. */
const RES_OPTIONS = [
  { label: '1/4', value: '24' },
  { label: '1/8', value: '12' },
  { label: '1/8T', value: '8' },
  { label: '1/16', value: '6' },
  { label: '1/16T', value: '4' },
  { label: '1/32', value: '3' },
];

/** iOS-style section header (matches the MIDI screen's SectionHeader). */
function Section({
  title,
  dot,
  hint,
  children,
}: {
  title: string;
  dot?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={styles.sectionTitleRow}>
          {dot ? <View style={[styles.sectionDot, { backgroundColor: dot }]} /> : null}
          <AppText style={styles.sectionTitle}>{title}</AppText>
        </View>
        {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
      </View>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

export default function LaneEditorSheet() {
  const laneId = useStore((s) => s.selection.laneId);
  const lane = useLane(laneId);
  const updateLane = useStore((s) => s.updateLane);
  const updateGenerator = useStore((s) => s.updateGenerator);
  const setLaneOp = useStore((s) => s.setLaneOp);
  const removeLane = useStore((s) => s.removeLane);
  const randomizeLane = useStore((s) => s.randomizeLane);
  const [listening, setListening] = useState(false);
  // Less-used numeric fields live as compact value rows; tapping one expands
  // an inline slider beneath it (progressive disclosure, Paper "More" group).
  const [expanded, setExpanded] = useState<'velocity' | 'gate' | null>(null);
  // The pinned card's drop shadow appears only once content scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isScrolled = e.nativeEvent.contentOffset.y > 2;
    if (isScrolled !== scrolled) setScrolled(isScrolled);
  };

  // Listen: the next inbound note-on (played on the OP-XY) sets this lane's
  // note. Auto-cancels after 8s or when the sheet unmounts.
  useEffect(() => {
    if (!listening || !laneId) return;
    const unsubscribe = midi.onInbound((e) => {
      if (e.type === 'noteon') {
        updateLane(laneId, { note: e.note });
        setListening(false);
      }
    });
    const timeout = setTimeout(() => setListening(false), 8000);
    return () => {
      unsubscribe();
      clearTimeout(timeout);
    };
  }, [listening, laneId, updateLane]);

  if (!lane) {
    return (
      <View style={styles.root}>
        <View style={styles.grabberSpace} />
        <SheetHeader title="Edit Lane" onDone={() => router.back()} />
        <View style={styles.empty}>
          <AppText tone="secondary">No lane selected.</AppText>
        </View>
      </View>
    );
  }

  const id = lane.id;
  const maxRot = Math.max(0, lane.length - 1);

  const setLength = (length: number) => {
    updateLane(id, { length });
    // Keep pulses/rotations coherent when the lane shrinks.
    if (lane.genA.pulses > length) updateGenerator(id, 'genA', { pulses: length });
    if (lane.genB.pulses > length) updateGenerator(id, 'genB', { pulses: length });
    if (lane.genA.rotation > length - 1) updateGenerator(id, 'genA', { rotation: Math.max(0, length - 1) });
    if (lane.genB.rotation > length - 1) updateGenerator(id, 'genB', { rotation: Math.max(0, length - 1) });
    if (lane.trackRot > length - 1) updateLane(id, { trackRot: Math.max(0, length - 1) });
  };

  const resLabel = RES_OPTIONS.find((o) => o.value === String(lane.resolutionTicks))?.label ?? '1/16';

  return (
    <View style={styles.root}>
      {/* Paper 16Z-0: 13px "sheet top" band the native grabber floats over. */}
      <View style={styles.grabberSpace} />
      <SheetHeader title="Edit Lane" onCancel={() => router.back()} onDone={() => router.back()} />

      {/* Pinned combined card — OUTSIDE the scroll view so it never leaves. */}
      <View style={[styles.pinned, scrolled && styles.pinnedShadow]}>
        <CombinedCard lane={lane} />
      </View>

      {/* collapsable={false} keeps this wrapper in the native tree so the
          ScrollView is NOT a direct child of the screen content wrapper —
          react-native-screens' formSheet "frame correction" finds direct-child
          scroll views and forces them to the full sheet frame (origin 0),
          which painted the scroll content OVER the header and swallowed taps.
          See RNSScreen.mm applyFrameCorrectionForDescendantScrollView. */}
      <View style={styles.scroll} collapsable={false}>
      {/* KeyboardAwareScrollView (RNKC) reveals the focused Name field instead
          of letting the keyboard cover it. ONE keyboard owner per screen. */}
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        onScroll={onScroll}
        scrollEventThrottle={16}
      >
        <Section title="Generator 1" dot={color.label}>
          <SliderRow
            label="Pulses"
            value={lane.genA.pulses}
            min={0}
            max={lane.length}
            onChange={(v) => updateGenerator(id, 'genA', { pulses: v })}
          />
          <SliderRow
            label="Rotate"
            value={lane.genA.rotation}
            min={0}
            max={maxRot}
            onChange={(v) => updateGenerator(id, 'genA', { rotation: v })}
          />
        </Section>

        <Section title="Generator 2" dot={color.label3} hint="0 pulses = off">
          <SliderRow
            label="Pulses"
            value={lane.genB.pulses}
            min={0}
            max={lane.length}
            onChange={(v) => updateGenerator(id, 'genB', { pulses: v })}
          />
          <SliderRow
            label="Rotate"
            value={lane.genB.rotation}
            min={0}
            max={maxRot}
            onChange={(v) => updateGenerator(id, 'genB', { rotation: v })}
          />
        </Section>

        <Section title="Combine">
          <PickerBar<CombineOp>
            options={OP_OPTIONS}
            value={lane.op}
            onChange={(op) => setLaneOp(id, op)}
            size={13}
          />
          <SliderRow label="Steps" value={lane.length} min={1} max={64} onChange={setLength} />
          <SliderRow
            label="Track rotate"
            value={lane.trackRot}
            min={0}
            max={maxRot}
            onChange={(v) => updateLane(id, { trackRot: v })}
          />
        </Section>

        <Section title="Sound">
          <View style={styles.cells}>
            <View style={[styles.cell, styles.cellFirst]}>
              <AppText style={styles.cellTitle}>Note</AppText>
              <View style={styles.cellRight}>
                <SmallStep
                  onDown={() => updateLane(id, { note: Math.max(0, lane.note - 1) })}
                  onUp={() => updateLane(id, { note: Math.min(127, lane.note + 1) })}
                >
                  <AppText style={styles.cellValue}>
                    {midiNoteName(lane.note)} · {lane.note}
                  </AppText>
                </SmallStep>
                <Pressable
                  style={[styles.listen, listening && styles.listenActive]}
                  onPress={() => setListening((v) => !v)}
                  accessibilityRole="button"
                  accessibilityLabel="Listen for note"
                  accessibilityState={{ selected: listening }}
                >
                  <SFSymbol name="mic.fill" size={13} tint={listening ? color.label : color.ground} />
                  <AppText style={[styles.listenLabel, listening && styles.listenLabelActive]}>
                    {listening ? 'Listening…' : 'Listen'}
                  </AppText>
                </Pressable>
              </View>
            </View>
            <Pressable
              style={[styles.cell, styles.cellLast]}
              // Tap-cycling caps at 8 (the OP-XY has 8 audio tracks). A channel
              // above 8 that arrived some other way (inbound capture) is kept
              // and displayed; the next tap folds back into tracks 1–8.
              onPress={() => updateLane(id, { channel: (lane.channel + 1) % 8 })}
              accessibilityRole="button"
            >
              <AppText style={styles.cellTitle}>Track · Channel</AppText>
              <View style={styles.cellRightTight}>
                <AppText style={styles.cellValue}>
                  Track {lane.channel + 1} · Ch {lane.channel + 1}
                </AppText>
                <SFSymbol name="chevron.right" size={16} tint={color.labelDisabled} />
              </View>
            </Pressable>
          </View>
        </Section>

        <Section title="More">
          <View style={styles.cells}>
            <View style={[styles.cell, styles.cellFirst]}>
              <AppText style={styles.cellTitle}>Name</AppText>
              <TextInput
                value={lane.name ?? ''}
                onChangeText={(t) => updateLane(id, { name: t || undefined })}
                placeholder={midiNoteName(lane.note)}
                placeholderTextColor={color.labelDisabled}
                style={styles.nameInput}
                returnKeyType="done"
                autoCapitalize="words"
                accessibilityLabel="Lane name"
              />
            </View>
            <MenuView
              title="Resolution"
              actions={RES_OPTIONS.map((o) => ({ id: o.value, title: o.label }))}
              onPressAction={({ nativeEvent }) =>
                updateLane(id, { resolutionTicks: Number(nativeEvent.event) })
              }
            >
              <View style={[styles.cell, styles.cellMid]} accessibilityRole="button">
                <AppText style={styles.cellTitle}>Resolution</AppText>
                <View style={styles.cellRightTight}>
                  <AppText style={styles.cellValue}>{resLabel}</AppText>
                  <SFSymbol name="chevron.up.chevron.down" size={13} tint={color.labelDisabled} />
                </View>
              </View>
            </MenuView>
            <Pressable
              style={[styles.cell, styles.cellMid]}
              onPress={() => setExpanded(expanded === 'velocity' ? null : 'velocity')}
              accessibilityRole="button"
            >
              <AppText style={styles.cellTitle}>Velocity</AppText>
              <AppText style={styles.cellValue}>{lane.velocity}</AppText>
            </Pressable>
            {expanded === 'velocity' ? (
              <View style={[styles.cell, styles.cellMid, styles.sliderCell]}>
                <SliderRow
                  label="Velocity"
                  value={lane.velocity}
                  min={1}
                  max={127}
                  onChange={(v) => updateLane(id, { velocity: v })}
                />
              </View>
            ) : null}
            <Pressable
              style={[styles.cell, styles.cellLast]}
              onPress={() => setExpanded(expanded === 'gate' ? null : 'gate')}
              accessibilityRole="button"
            >
              <AppText style={styles.cellTitle}>Gate</AppText>
              <AppText style={styles.cellValue}>{lane.gateMs} ms</AppText>
            </Pressable>
            {expanded === 'gate' ? (
              <View style={[styles.cell, styles.cellLast, styles.sliderCell]}>
                <SliderRow
                  label="Gate"
                  value={lane.gateMs}
                  min={5}
                  max={500}
                  step={5}
                  onChange={(v) => updateLane(id, { gateMs: v })}
                  formatValue={(v) => `${v} ms`}
                />
              </View>
            ) : null}
          </View>
        </Section>

        {/* Randomize — re-rolls the rhythm only; note/track/timing stay. */}
        <View style={styles.actions}>
          <Pressable style={styles.actionBtn} accessibilityRole="button" onPress={() => randomizeLane(id)}>
            <SFSymbol name="dice" size={16} tint={color.label} />
            <AppText style={styles.actionLabel}>Randomize</AppText>
          </Pressable>
          <AppText style={styles.actionFootnote}>
            Randomize re-rolls the rhythm only — note & track stay.
          </AppText>
          <Pressable
            style={styles.actionBtn}
            accessibilityRole="button"
            onPress={() => {
              removeLane(id);
              router.back();
            }}
          >
            <AppText style={styles.deleteLabel}>Delete lane</AppText>
          </Pressable>
        </View>
      </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

/** Wraps a readout with tap-up / long-press-down affordances via ± hit zones. */
function SmallStep({
  onDown,
  onUp,
  children,
}: {
  onDown: () => void;
  onUp: () => void;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.smallStep}>
      <Pressable onPress={onDown} hitSlop={12} accessibilityRole="button" accessibilityLabel="Decrease note">
        <SFSymbol name="minus" size={14} tint={color.label3} />
      </Pressable>
      {children}
      <Pressable onPress={onUp} hitSlop={12} accessibilityRole="button" accessibilityLabel="Increase note">
        <SFSymbol name="plus" size={14} tint={color.label3} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  grabberSpace: { height: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { flex: 1 },
  content: { paddingBottom: space.xxl },

  // Paper 02b: the pinned wrapper carries the sheet bg so scrolling content
  // disappears under it; the shadow only exists once scrolled.
  pinned: {
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: color.surface,
    zIndex: 1,
  },
  pinnedShadow: {
    shadowColor: '#000000',
    shadowOpacity: 0.45,
    shadowRadius: 9,
    shadowOffset: { width: 0, height: 10 },
  },

  // MIDI-screen header style (title case, 17/22 semibold, label3).
  section: { paddingHorizontal: 16, paddingTop: 22 },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
  },
  sectionTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sectionDot: { width: 9, height: 9, borderRadius: 999 },
  sectionTitle: { fontFamily: font.text, fontWeight: '600', fontSize: 17, lineHeight: 22, color: color.label3 },
  sectionHint: { fontFamily: font.text, fontWeight: '600', fontSize: 11, lineHeight: 14, color: color.label4 },
  sectionBody: { gap: 14 },

  cells: { gap: 1 },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface2,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  cellFirst: { borderTopLeftRadius: radius.cell, borderTopRightRadius: radius.cell, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  cellMid: { borderRadius: 2 },
  cellLast: { borderBottomLeftRadius: radius.cell, borderBottomRightRadius: radius.cell, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  sliderCell: { paddingVertical: 10 },
  cellTitle: { fontFamily: font.text, fontSize: 16, lineHeight: 20, color: color.label },
  cellRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cellRightTight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellValue: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label25 },
  nameInput: {
    flex: 1,
    marginLeft: 16,
    textAlign: 'right',
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 16,
    color: color.label,
    padding: 0,
  },
  smallStep: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  listen: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: color.label,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 11,
  },
  listenLabel: { fontFamily: font.text, fontWeight: '700', fontSize: 13, lineHeight: 16, color: color.ground },
  listenActive: { backgroundColor: color.surface3 },
  listenLabelActive: { color: color.label },

  actions: { paddingHorizontal: 16, paddingTop: 26, gap: 10 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.cell,
    backgroundColor: color.surface2,
  },
  actionLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label },
  actionFootnote: {
    fontFamily: font.text,
    fontWeight: '500',
    fontSize: 12,
    lineHeight: 16,
    color: color.label4,
    textAlign: 'center',
  },
  deleteLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.danger },
});
