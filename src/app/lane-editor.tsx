/**
 * Lane Editor form sheet (Paper nodes 12E-0 Steps / DR-0 Graph). Edits the lane
 * in `selection.laneId`. A Steps|Graph toggle swaps the top view in place
 * (Steps is the default); everything below the view — the two generators, OP,
 * length, resolution, note/channel, velocity/gate — is shared between views and
 * wired straight to the store (updateLane / updateGenerator / setLaneOp).
 */
import { useState } from 'react';
import { router } from 'expo-router';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { midiNoteName } from '@/core/note';
import { useLane } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { CombineOp } from '@/state/types';
import { color, font, radius, space } from '@/theme/tokens';
import { AppText, SFSymbol, SheetHeader } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import { ViewToggle } from '@/components/lane-editor/view-toggle';
import { PillStepper } from '@/components/lane-editor/pill-stepper';
import { PickerBar } from '@/components/lane-editor/picker-bar';
import { SliderRow } from '@/components/lane-editor/slider-row';
import { StepsView } from '@/components/lane-editor/steps-view';
import { GraphView } from '@/components/lane-editor/graph-view';

type ViewMode = 'steps' | 'graph';

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

export default function LaneEditorSheet() {
  const laneId = useStore((s) => s.selection.laneId);
  const lane = useLane(laneId);
  const transport = useStore((s) => s.transport);
  const updateLane = useStore((s) => s.updateLane);
  const updateGenerator = useStore((s) => s.updateGenerator);
  const setLaneOp = useStore((s) => s.setLaneOp);
  const removeLane = useStore((s) => s.removeLane);
  const [view, setView] = useState<ViewMode>('steps');

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
    // Keep pulses/rotation coherent when the lane shrinks.
    if (lane.genA.pulses > length) updateGenerator(id, 'genA', { pulses: length });
    if (lane.genB.pulses > length) updateGenerator(id, 'genB', { pulses: length });
    if (lane.genA.rotation > length - 1) updateGenerator(id, 'genA', { rotation: Math.max(0, length - 1) });
    if (lane.genB.rotation > length - 1) updateGenerator(id, 'genB', { rotation: Math.max(0, length - 1) });
  };

  return (
    <View style={styles.root}>
      {/* Paper 16Z-0: 13px "sheet top" band the native grabber floats over. */}
      <View style={styles.grabberSpace} />
      <SheetHeader title="Edit Lane" onCancel={() => router.back()} onDone={() => router.back()} />

      <View style={styles.toggle}>
        <ViewToggle value={view} onChange={setView} />
      </View>

      {/* collapsable={false} keeps this wrapper in the native tree so the
          ScrollView is NOT a direct child of the screen content wrapper —
          react-native-screens' formSheet "frame correction" finds direct-child
          scroll views and forces them to the full sheet frame (origin 0),
          which painted the scroll content OVER the header and toggle and
          swallowed their taps. See RNSScreen.mm
          applyFrameCorrectionForDescendantScrollView. */}
      <View style={styles.scroll} collapsable={false}>
      {/* KeyboardAwareScrollView (RNKC) reveals the focused Name field instead
          of letting the keyboard cover it. ONE keyboard owner per screen. */}
      <KeyboardAwareScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
      >
        {/* Views size themselves (Paper: Steps 12E-0 and Graph DR-0 differ). */}
        {view === 'steps' ? (
          <StepsView lane={lane} transport={transport} />
        ) : (
          <GraphView lane={lane} />
        )}

        {/* Generators */}
        <View style={styles.genControls}>
          <View style={styles.genRow}>
            <View style={styles.genTag}>
              <View style={[styles.genDot, { backgroundColor: color.label }]} />
              <AppText style={[styles.genTagLabel, { color: color.label }]}>G1</AppText>
            </View>
            <PillStepper
              label="Pulses"
              value={lane.genA.pulses}
              min={0}
              max={lane.length}
              onChange={(v) => updateGenerator(id, 'genA', { pulses: v })}
            />
            <PillStepper
              label="Rotate"
              value={lane.genA.rotation}
              min={0}
              max={maxRot}
              onChange={(v) => updateGenerator(id, 'genA', { rotation: v })}
            />
          </View>
          <View style={styles.genRow}>
            <View style={styles.genTag}>
              <View style={[styles.genDot, { backgroundColor: color.label3 }]} />
              <AppText style={[styles.genTagLabel, { color: color.label3 }]}>G2</AppText>
            </View>
            <PillStepper
              label="Pulses"
              value={lane.genB.pulses}
              min={0}
              max={lane.length}
              onChange={(v) => updateGenerator(id, 'genB', { pulses: v })}
            />
            <PillStepper
              label="Rotate"
              value={lane.genB.rotation}
              min={0}
              max={maxRot}
              onChange={(v) => updateGenerator(id, 'genB', { rotation: v })}
            />
          </View>
        </View>

        {/* OP + Length */}
        <View style={styles.opRow}>
          <View style={styles.opTag}>
            <AppText style={styles.opTagLabel}>OP</AppText>
          </View>
          <PickerBar<CombineOp>
            options={OP_OPTIONS}
            value={lane.op}
            onChange={(op) => setLaneOp(id, op)}
            size={12}
          />
          <PillStepper label="Len" value={lane.length} min={1} max={64} onChange={setLength} compact />
        </View>

        {/* Resolution */}
        <View style={styles.section}>
          <AppText style={styles.sectionLabel}>RESOLUTION</AppText>
          <PickerBar
            options={RES_OPTIONS}
            value={String(lane.resolutionTicks)}
            onChange={(v) => updateLane(id, { resolutionTicks: Number(v) })}
            size={13}
          />
        </View>

        {/* Name / Note / Track · Channel */}
        <View style={styles.groupCell}>
          <View style={[styles.cell, styles.cellTop]}>
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
          <View style={[styles.cell, styles.cellMid]}>
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
              <Pressable style={styles.listen} accessibilityRole="button" accessibilityLabel="Listen for note">
                <SFSymbol name="mic.fill" size={13} tint={color.ground} />
                <AppText style={styles.listenLabel}>Listen</AppText>
              </Pressable>
            </View>
          </View>
          <Pressable
            style={[styles.cell, styles.cellBottom]}
            onPress={() => updateLane(id, { channel: (lane.channel + 1) % 16 })}
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

        {/* Velocity / Gate */}
        <View style={styles.sliders}>
          <SliderRow
            label="Velocity"
            value={lane.velocity}
            min={1}
            max={127}
            onChange={(v) => updateLane(id, { velocity: v })}
          />
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

        {/* Delete lane — the one destructive action in the editor. */}
        <Pressable
          style={styles.deleteLane}
          accessibilityRole="button"
          onPress={() => {
            removeLane(id);
            router.back();
          }}
        >
          <AppText style={styles.deleteLaneLabel}>Delete lane</AppText>
        </Pressable>
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
  toggle: { paddingHorizontal: 20, paddingBottom: 4 },
  scroll: { flex: 1 },
  content: { paddingBottom: space.xxl },

  genControls: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4, gap: 10 },
  genRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  genTag: { flexDirection: 'row', alignItems: 'center', gap: 6, width: 52, flexShrink: 0 },
  genDot: { width: 9, height: 9, borderRadius: 999 },
  genTagLabel: { fontFamily: font.text, fontWeight: '700', fontSize: 12, lineHeight: 16 },

  opRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 6, paddingBottom: 4 },
  opTag: { width: 52, flexShrink: 0 },
  opTagLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.44,
    color: color.label25,
  },

  section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, gap: 8 },
  sectionLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 0.48,
    color: color.label25,
    paddingLeft: 2,
  },

  groupCell: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 1 },
  cell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface2,
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  cellTop: { borderTopLeftRadius: radius.cell, borderTopRightRadius: radius.cell, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  cellMid: { borderRadius: 2 },
  cellBottom: { borderBottomLeftRadius: radius.cell, borderBottomRightRadius: radius.cell, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
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
  cellTitle: { fontFamily: font.text, fontSize: 16, lineHeight: 20, color: color.label },
  cellRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cellRightTight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellValue: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label25 },
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

  sliders: { padding: 16, gap: 16 },
  deleteLane: {
    marginHorizontal: 16,
    marginTop: 4,
    paddingVertical: 13,
    borderRadius: radius.cell,
    backgroundColor: color.surface2,
    alignItems: 'center',
  },
  deleteLaneLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.danger },
});
