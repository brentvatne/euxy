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
import { useEffect, useRef, useState } from 'react';
import { router } from 'expo-router';
import { MenuView } from '@expo/ui/community/menu';
import {
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollView,
} from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { midi, midiOut } from '@/components/midi/runtime';
import { midiNoteName } from '@/core/note';
import { haptics, logObserveEvent } from '@/lib/shims';
import { useLane } from '@/state/selectors';
import { useStore } from '@/state/store';
import type { CombineOp, Lane } from '@/state/types';
import { color, font, radius, ramp, space } from '@/theme/tokens';
import { AppText, SFSymbol, SheetHeader } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import { ledExitSuppressed } from '@/components/ui/led';
import { CombinedCard, combinedCardHeight } from '@/components/lane-editor/combined-card';
import { NotePads } from '@/components/lane-editor/note-pads';
import { PickerBar } from '@/components/lane-editor/picker-bar';
import { SliderRow } from '@/components/lane-editor/slider-row';
import { useMarkInteractive } from '@/lib/use-mark-interactive';

/** Pinned wrapper vertical paddings — shared with the scroll-spacer math so
 * the spacer mirrors the card's footprint exactly. */
const PINNED_PAD_TOP = 14;
const PINNED_PAD_BOTTOM = 14;

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

/**
 * Which controls a lane-editing session actually touched. Diffed once on
 * close, NEVER per change: every control here is a slider or a drag, so a
 * per-change event would emit hundreds per session. Keys are the product
 * names, not the field names.
 */
const EDIT_FIELDS: { key: string; read: (l: Lane) => unknown }[] = [
  { key: 'genA_pulses', read: (l) => l.genA.pulses },
  { key: 'genA_rotate', read: (l) => l.genA.rotation },
  { key: 'genB_pulses', read: (l) => l.genB.pulses },
  { key: 'genB_rotate', read: (l) => l.genB.rotation },
  { key: 'op', read: (l) => l.op },
  { key: 'steps', read: (l) => l.length },
  { key: 'track_rotate', read: (l) => l.trackRot },
  { key: 'note', read: (l) => l.note },
  { key: 'channel', read: (l) => l.channel },
  { key: 'name', read: (l) => l.name },
  { key: 'resolution', read: (l) => l.resolutionTicks },
  { key: 'velocity', read: (l) => l.velocity },
  { key: 'gate', read: (l) => l.gateMs },
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
  useMarkInteractive();
  const laneId = useStore((s) => s.selection.laneId);
  const lane = useLane(laneId);
  const updateLane = useStore((s) => s.updateLane);
  const updateGenerator = useStore((s) => s.updateGenerator);
  const setLaneOp = useStore((s) => s.setLaneOp);
  const removeLane = useStore((s) => s.removeLane);
  const randomizeLane = useStore((s) => s.randomizeLane);
  const [listening, setListening] = useState(false);
  // Concept J: bumping the nonce sweeps the reroll wash across the pinned
  // combined card — triggered by the Randomize press, not the clock.
  const [washNonce, setWashNonce] = useState(0);
  // Note entry: tapping the Note cell expands the inline pad grid (Paper 02c).
  const [padsOpen, setPadsOpen] = useState(false);
  // The pinned card's drop shadow appears only once content scrolls under it.
  const [scrolled, setScrolled] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const scrollY = useRef(0);
  const ledExitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    scrollY.current = e.nativeEvent.contentOffset.y;
    const isScrolled = e.nativeEvent.contentOffset.y > 2;
    if (isScrolled !== scrolled) setScrolled(isScrolled);
  };

  // One event per editing session, on close. Observe told us this sheet is
  // opened more than everything else combined and nothing about what happens
  // inside it; this is that gap. Cheap (a shallow diff of two lane snapshots)
  // and bounded (one event no matter how long the session ran).
  const openedAt = useRef(0);
  const firstLane = useRef<Lane | null>(null);
  const lastLane = useRef<Lane | null>(null);
  const deletedLane = useRef(false);
  useEffect(() => {
    if (!lane) return;
    if (firstLane.current == null) firstLane.current = lane;
    lastLane.current = lane;
  }, [lane]);
  useEffect(() => {
    openedAt.current = Date.now();
    return () => {
      const before = firstLane.current;
      const after = lastLane.current;
      const touched =
        before && after ? EDIT_FIELDS.filter((f) => f.read(before) !== f.read(after)) : [];
      logObserveEvent('lane_editor.closed', {
        attributes: {
          duration_ms: Date.now() - openedAt.current,
          // Sorted-by-definition (EDIT_FIELDS order) so the same set of edits
          // always produces the same string — otherwise this is unaggregatable.
          fields: touched.map((f) => f.key).join(',') || 'none',
          field_count: touched.length,
          deleted: deletedLane.current,
        },
      });
    };
  }, []);

  // Listen: while engaged, notes played from the OP-XY's aux track set this
  // lane's note AND its track (the inbound channel selects the track), and
  // each note is echoed straight back out on that channel so the device
  // plays it from the target track — you hear what you're setting. Stays
  // engaged so you can browse notes; auto-cancels after 8s of silence or
  // when the sheet unmounts. (This scoped echo is safe — the old ghost-note
  // problem came from blanket soft-thru of ALL inbound traffic, always.)
  useEffect(() => {
    if (!listening || !laneId) return;
    let timeout = setTimeout(() => setListening(false), 8000);
    const unsubscribe = midi.onInbound((e) => {
      if (e.type === 'noteon') {
        midiOut.sendNoteOn(e.note, e.velocity, e.channel);
        updateLane(laneId, { note: e.note, channel: e.channel });
        clearTimeout(timeout);
        timeout = setTimeout(() => setListening(false), 8000);
      } else if (e.type === 'noteoff') {
        midiOut.sendNoteOff(e.note, e.channel);
      }
    });
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
    // Removed steps take their lights with them: a phosphor exit on a cell
    // that no longer exists floats in space (Brent). Suppress LED exit
    // decays around this commit; 80ms comfortably covers the removal and
    // continuous drags re-arm it every step.
    ledExitSuppressed.value = 1;
    if (ledExitTimer.current) clearTimeout(ledExitTimer.current);
    ledExitTimer.current = setTimeout(() => {
      ledExitSuppressed.value = 0;
    }, 80);
    // Losing a row with less scroll-back than the height delta strands the
    // offset in the bounce region (maintainVisibleContentPosition subtracts
    // the full delta) — an idle gap between card and form until the next
    // touch. Settle back to top AFTER the compensated commit lands (double
    // rAF); everywhere else mVCP alone keeps the form still.
    const shrink =
      combinedCardHeight(lane.length) - combinedCardHeight(Math.max(1, length));
    if (shrink > 0 && scrollY.current < shrink) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => scrollRef.current?.scrollTo({ y: 0, animated: true })),
      );
    }
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

      {/* The pinned card is an absolute OVERLAY above the scroll view (not a
          flex sibling), so the scroll viewport's frame never changes when the
          Steps slider crosses a 16-multiple and the card gains/loses a row.
          The spacer (first scroll child) reserves the card's footprint in the
          content, and maintainVisibleContentPosition keeps the form visually
          still while the spacer resizes — the card grows down OVER the form
          (or retracts) instead of shoving it, so nothing jumps under the
          finger mid-drag. Spacer height is computed, not measured: it must
          change in the SAME commit as the grid row (see combinedCardHeight). */}
      <View style={styles.body}>
        {/* Pinned combined card — OUTSIDE the scroll view so it never leaves. */}
        <View style={[styles.pinned, scrolled && styles.pinnedShadow]}>
          <CombinedCard lane={lane} washNonce={washNonce} />
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
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        bottomOffset={24}
        onScroll={onScroll}
        scrollEventThrottle={16}
        maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
      >
        {/* Card footprint — index 0, exempt from minIndexForVisible above. */}
        <View
          style={{
            height: combinedCardHeight(lane.length) + PINNED_PAD_TOP + PINNED_PAD_BOTTOM,
          }}
        />
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
          <SliderRow
            label="Steps"
            value={lane.length}
            min={1}
            max={64}
            onChange={setLength}
            // Bar-multiple landmarks land with a harder detent (encoder feel).
            accentValues={[16, 32, 48, 64]}
          />
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
            <Pressable
              style={({ pressed }) => [styles.cell, styles.cellFirst, pressed && styles.pressedDim]}
              onPress={() => {
                haptics.selection();
                setPadsOpen((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel="Note"
              accessibilityState={{ expanded: padsOpen }}
            >
              <AppText style={styles.cellTitle}>Note</AppText>
              <View style={styles.cellRight}>
                <AppText style={[styles.cellValue, padsOpen && styles.cellValueActive]}>
                  {midiNoteName(lane.note)} · {lane.note}
                </AppText>
                <Pressable
                  style={({ pressed }) => [
                    styles.listen,
                    padsOpen && styles.listenMuted,
                    listening && styles.listenActive,
                    pressed && styles.pressedDim,
                  ]}
                  onPress={() => {
                    haptics.impact('light');
                    setListening((v) => !v);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Listen for note"
                  accessibilityState={{ selected: listening }}
                >
                  <SFSymbol
                    name="mic.fill"
                    size={13}
                    tint={listening ? color.label : padsOpen ? color.label3 : color.ground}
                  />
                  <AppText
                    style={[
                      styles.listenLabel,
                      padsOpen && styles.listenLabelMuted,
                      listening && styles.listenLabelActive,
                    ]}
                  >
                    {listening ? 'Listening…' : 'Listen'}
                  </AppText>
                </Pressable>
                {padsOpen ? (
                  <SFSymbol name="chevron.up" size={12} tint={color.label3} />
                ) : null}
              </View>
            </Pressable>
            {padsOpen ? (
              <NotePads
                note={lane.note}
                velocity={lane.velocity}
                channel={lane.channel}
                onSelect={(note) => updateLane(id, { note })}
              />
            ) : null}
            <Pressable
              style={({ pressed }) => [styles.cell, styles.cellLast, pressed && styles.pressedDim]}
              // Tap-cycling caps at 8 (the OP-XY has 8 audio tracks). A channel
              // above 8 that arrived some other way (inbound capture) is kept
              // and displayed; the next tap folds back into tracks 1–8.
              onPress={() => {
                haptics.selection();
                updateLane(id, { channel: (lane.channel + 1) % 8 });
              }}
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
          <AppText style={styles.groupFootnote}>
            Listen — play a note from the OP‑XY’s aux track to set it. The channel you send on
            selects the track, and euxy echoes the note back so you hear it played from that track.
          </AppText>
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
            {/* Permanent sliders (TestFlight 1.2.0 (6) feedback) — the old
                tap-to-expand cells duplicated label/value into a mash. */}
            <View style={[styles.cellBlock, styles.cellMid]}>
              <SliderRow
                label="Velocity"
                value={lane.velocity}
                min={1}
                max={127}
                onChange={(v) => updateLane(id, { velocity: v })}
              />
            </View>
            <View style={[styles.cellBlock, styles.cellLast]}>
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
          </View>
        </Section>

        {/* Randomize — re-rolls the rhythm only; note/track/timing stay. */}
        <View style={styles.actions}>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedDim]}
            accessibilityRole="button"
            onPress={() => {
              // A roll is a commitment — heavier than a browse tick.
              haptics.impact('medium');
              randomizeLane(id);
              setWashNonce((v) => v + 1);
            }}
          >
            <SFSymbol name="dice" size={16} tint={color.label} />
            <AppText style={styles.actionLabel}>Randomize</AppText>
          </Pressable>
          <AppText style={styles.actionFootnote}>
            Randomize re-rolls the rhythm only — note & track stay.
          </AppText>
          <Pressable
            style={({ pressed }) => [styles.actionBtn, pressed && styles.pressedDim]}
            accessibilityRole="button"
            onPress={() => {
              haptics.warning();
              deletedLane.current = true;
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
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  grabberSpace: { height: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1 },
  scroll: { flex: 1 },
  content: { paddingBottom: space.xxl },

  // Paper 02b: the pinned wrapper carries the sheet bg so scrolling content
  // disappears under it; the shadow only exists once scrolled. Absolute so a
  // row-count change never reframes the scroll viewport below (see body).
  pinned: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 12,
    // Breathing room between the sheet nav and the card (Brent 2026-07-24 —
    // the top of the sheet read as crowded), and under it before the form.
    paddingTop: PINNED_PAD_TOP,
    paddingBottom: PINNED_PAD_BOTTOM,
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
  // iOS grouped-list footer (Paper 02: 13/18 label4, slight inset).
  groupFootnote: {
    fontFamily: font.text,
    fontSize: 13,
    lineHeight: 18,
    color: color.label4,
    paddingHorizontal: 4,
    paddingTop: 8,
  },
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
  // Block cell hosting a SliderRow (its own label/value head — no cellTitle).
  cellBlock: { backgroundColor: color.surface2, paddingVertical: 10, paddingHorizontal: 16 },
  cellTitle: { fontFamily: font.text, fontSize: 16, lineHeight: 20, color: color.label },
  cellRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cellRightTight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellValue: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label25 },
  // Paper 02c: the value reads primary while the pad grid is open.
  cellValueActive: { color: color.label },
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
  // Paper 02c: Listen recedes while the pad grid is the primary input.
  listenMuted: { backgroundColor: ramp[6] },
  listenLabelMuted: { color: color.label3 },

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
  // Press-down feedback for cells/rows (dim, not travel — wide surfaces).
  pressedDim: { opacity: 0.65 },
});
