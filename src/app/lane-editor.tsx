/**
 * Lane Editor form sheet (Paper "02 · Lane Editor" + "02b · scrolled"). The
 * vertical D layout: the combined pattern is a compact pinned card (always
 * visible; a drop shadow appears once the form scrolls beneath it), then
 * Sound (note + track) — first, because it's what you set before touching the
 * rhythm on a new lane (Brent 2026-07-29) — then Generator 1/2 (sliders),
 * Combine (op · steps · track rotate), More (name, resolution, velocity, gate
 * as a compact grouped list), Randomize, Delete. Listen explains itself in a
 * popover that hangs off the Listen key while it's engaged, not as a standing
 * footnote under the group.
 * Section headers use the current-iOS style (title case 17/22 semibold), like
 * the MIDI screen; the leading Sound group is headerless (its rows name
 * themselves). No Steps|Graph toggle — the combined card is the only view.
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
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { midi, midiOut, sendTestNote } from '@/components/midi/runtime';
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
import { TrackPicker } from '@/components/lane-editor/track-picker';
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

/** Caret box (a rotated square, so its point is the diagonal). */
const TIP_CARET = 12;

/**
 * The popover DROPS out of the Listen key: opacity leads, 6pt of travel, one
 * soft settle. Short enough to feel like the key's own response to the tap
 * (Brent 2026-07-29 asked for a popover instead of a strip in the group).
 */
const TIP_ENTER = () => {
  'worklet';
  return {
    initialValues: { opacity: 0, transform: [{ translateY: -6 }] },
    animations: {
      opacity: withTiming(1, {
        duration: 130,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      }),
      transform: [
        {
          translateY: withSpring(0, {
            duration: 320,
            dampingRatio: 0.8,
            reduceMotion: ReduceMotion.System,
          }),
        },
      ],
    },
  };
};
/** Leaving is faster and drops the movement — the mode is already over. */
const TIP_EXIT = FadeOut.duration(110).reduceMotion(ReduceMotion.System);

/**
 * The Listen popover: what Listen does, said once, while it is listening —
 * the message Brent kept from the old group footnote, trimmed, with no icon.
 * It floats over the rows below (pointerEvents none, so the pads and Track row
 * underneath stay tappable) rather than taking a row of its own, so engaging
 * Listen never reflows the form.
 *
 * `caretLeft` is the Listen key's measured centre in the Note row's coordinate
 * space — measured, not derived from the label, because the key changes width
 * when it flips to "Listening…".
 */
function ListenTip({ caretLeft }: { caretLeft: number }) {
  return (
    <Animated.View
      pointerEvents="none"
      entering={TIP_ENTER}
      exiting={TIP_EXIT}
      style={styles.tipLayer}
    >
      {/* Caret first, bubble second: the bubble paints over the square's lower
          half, leaving only the point above its edge. */}
      <View style={[styles.tipCaret, { left: caretLeft - TIP_CARET / 2 }]} />
      <View style={styles.tipBubble}>
        <AppText style={styles.tipText}>
          Play a note from the OP‑XY’s aux track to set it. The channel picks the track, and euxy
          echoes it back.
        </AppText>
      </View>
    </Animated.View>
  );
}

/**
 * iOS-style section header (matches the MIDI screen's SectionHeader).
 *
 * `title` is optional: a group whose own rows already name themselves doesn't
 * need one. A headerless group takes `gapAfter` so the NEXT section's header
 * keeps its distance — with only the standard 22pt section gap above it, that
 * header sits close enough to the untitled rows to read as titling them.
 */
function Section({
  title,
  dot,
  hint,
  gapAfter,
  children,
}: {
  title?: string;
  dot?: string;
  hint?: string;
  gapAfter?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={[styles.section, gapAfter && styles.sectionGapAfter]}>
      {title ? (
        <View style={styles.sectionHead}>
          <View style={styles.sectionTitleRow}>
            {dot ? <View style={[styles.sectionDot, { backgroundColor: dot }]} /> : null}
            <AppText style={styles.sectionTitle}>{title}</AppText>
          </View>
          {hint ? <AppText style={styles.sectionHint}>{hint}</AppText> : null}
        </View>
      ) : null}
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
  // Track entry: same disclosure for the 8-track row — collapsed until tapped.
  const [trackOpen, setTrackOpen] = useState(false);
  // Listen popover anchor: the key's centre along the Note row = its offset
  // inside the row's right-hand group + that group's offset inside the cell.
  const [listenGroupX, setListenGroupX] = useState(0);
  const [listenKeyX, setListenKeyX] = useState(0);
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

  /** A light leaving with the cell it sits in has nothing to decay over: the
   * phosphor tail floats in empty space (Brent). Arm this across a commit that
   * unmounts lit cells; 80ms comfortably covers one, and repeat calls (a
   * continuous drag) re-arm it every step. */
  const suppressLedExit = () => {
    ledExitSuppressed.value = 1;
    if (ledExitTimer.current) clearTimeout(ledExitTimer.current);
    ledExitTimer.current = setTimeout(() => {
      ledExitSuppressed.value = 0;
    }, 80);
  };

  const setLength = (length: number) => {
    // Removed steps take their lights with them.
    suppressLedExit();
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
        {/* Sound leads the form (Brent 2026-07-29): note & track are what a new
            lane needs before its rhythm is worth hearing, so they shouldn't sit
            three slider sections down. No header (Brent 2026-07-30): the two
            rows are labelled Note and Track · Channel, so a "Sound" title over
            them named nothing the rows didn't already say — and as the form's
            first group it has no sibling above it to be told apart from. */}
        <Section gapAfter>
          <View style={styles.cells}>
            {/* The Note row owns the Listen popover, so it needs its own
                positioning context and has to paint above the rows below it. */}
            <View style={styles.noteRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.cell,
                  styles.cellFirst,
                  pressed && styles.pressedDim,
                ]}
                onPress={() => {
                  haptics.selection();
                  setPadsOpen((v) => !v);
                }}
                accessibilityRole="button"
                accessibilityLabel="Note"
                accessibilityState={{ expanded: padsOpen }}
              >
                <AppText style={styles.cellTitle}>Note</AppText>
                <View
                  style={styles.cellRight}
                  onLayout={(e) => setListenGroupX(e.nativeEvent.layout.x)}
                >
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
                    // Re-measured whenever the key changes width ("Listen" →
                    // "Listening…"), so the caret keeps pointing at its centre.
                    onLayout={(e) =>
                      setListenKeyX(e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2)
                    }
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
                  {/* Same disclosure chevron as the Track · Channel cell below,
                      collapsed AND expanded (Brent 2026-07-29): with it hidden
                      while collapsed, the row read as a plain readout and gave no
                      hint it opened the pad grid. */}
                  <SFSymbol
                    name={padsOpen ? 'chevron.up' : 'chevron.right'}
                    size={padsOpen ? 12 : 16}
                    tint={padsOpen ? color.label3 : color.labelDisabled}
                  />
                </View>
              </Pressable>
              {/* How Listen works, only while it's listening (Brent 2026-07-29 —
                  the standing footnote under the group explained a mode nobody
                  was in, and the in-group strip that replaced it read as another
                  row). A popover off the key it belongs to: it says what the mode
                  does and leaves with the mode. Not while the pad grid is open:
                  it would float over the top octave, and Listen already recedes
                  there (see listenMuted) because the pads are the input. */}
              {listening && !padsOpen ? (
                <ListenTip caretLeft={listenGroupX + listenKeyX} />
              ) : null}
            </View>
            {padsOpen ? (
              <NotePads
                note={lane.note}
                velocity={lane.velocity}
                channel={lane.channel}
                onSelect={(note) => updateLane(id, { note })}
              />
            ) : null}
            {/* Track: all 8 at once, not a tap-cycle. The old cell advanced one
                track per tap and wrapped, so moving DOWN a track meant lapping
                the whole device; the revealed row is one tap in either direction
                and shows where the lane sits. Tapping the row toggles it (Brent
                2026-07-29) — same disclosure as the Note cell above, so the
                collapsed group stays a plain two-row list. Selecting a track
                auditions the lane's note on it (same as tapping a pad above) so
                you hear the track you landed on. */}
            <Pressable
              style={({ pressed }) => [
                styles.cell,
                !trackOpen && styles.cellLast,
                pressed && styles.pressedDim,
              ]}
              onPress={() => {
                haptics.selection();
                // Collapsing unmounts the row, so the selected pill's phosphor
                // tail would decay over whatever the group closed onto (it
                // ghosted across the footnote) — same case as a shrinking grid.
                if (trackOpen) suppressLedExit();
                setTrackOpen((v) => !v);
              }}
              accessibilityRole="button"
              accessibilityLabel="Track and channel"
              accessibilityState={{ expanded: trackOpen }}
            >
              <AppText style={styles.cellTitle}>Track · Channel</AppText>
              <View style={styles.cellRightTight}>
                <AppText style={[styles.cellValue, trackOpen && styles.cellValueActive]}>
                  Track {lane.channel + 1} · Ch {lane.channel + 1}
                </AppText>
                <SFSymbol
                  name={trackOpen ? 'chevron.up' : 'chevron.right'}
                  size={trackOpen ? 12 : 16}
                  tint={trackOpen ? color.label3 : color.labelDisabled}
                />
              </View>
            </Pressable>
            {trackOpen ? (
              <View style={[styles.cellBlock, styles.trackPanel, styles.cellLast]}>
                <TrackPicker
                  channel={lane.channel}
                  onChange={(channel) => {
                    haptics.selection();
                    updateLane(id, { channel });
                    sendTestNote(lane.note, lane.velocity, channel);
                  }}
                />
              </View>
            ) : null}
          </View>
        </Section>

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
  // Trailing space for a headerless group (Brent 2026-07-30): 22 + 14 = 36pt
  // between the Sound cells and the Generator 1 header, so that header clearly
  // opens the section below rather than closing the one above.
  sectionGapAfter: { paddingBottom: 14 },
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
  // Block cell hosting a SliderRow (its own label/value head — no cellTitle).
  cellBlock: { backgroundColor: color.surface2, paddingVertical: 10, paddingHorizontal: 16 },
  cellTitle: { fontFamily: font.text, fontSize: 16, lineHeight: 20, color: color.label },
  cellRight: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  cellRightTight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cellValue: { fontFamily: font.text, fontWeight: '600', fontSize: 16, lineHeight: 20, color: color.label25 },
  // Revealed 8-track row. Extra top padding (Brent 2026-07-29 — it sat too
  // close to the row that discloses it) so the segments read as their own
  // panel under the Track · Channel cell rather than crowding its underside.
  // Its own background over cellBlock's surface2 (Brent 2026-07-29): matching
  // the cell made the panel read as a third sibling row instead of as content
  // nested under Track · Channel. One step LIGHTER than the cell, not black —
  // the segmented track inside moves up to surface4 to stay above the panel.
  trackPanel: { backgroundColor: color.surface3, paddingTop: 16, paddingBottom: 14 },
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
  // The Note row is the popover's positioning context and has to paint over the
  // rows (and pad grid) below it.
  noteRow: { zIndex: 2 },
  // Popover: hangs off the bottom edge of the Note row, out of the layout.
  tipLayer: { position: 'absolute', top: '100%', left: 0, right: 0 },
  tipBubble: {
    alignSelf: 'flex-end',
    marginTop: 8,
    marginRight: 8,
    maxWidth: 300,
    // surface4, the top of the ramp — NOT surface3. The fill was always fully
    // opaque, but surface3 is the level a row expands INTO (trackPanel, the pad
    // grid) and lands only ~14 of 255 above the surface2 cell this floats over,
    // so the panel read as see-through. One step up clears both the cell and
    // the disclosure level, and the rim pins the edge the soft shadow left
    // ambiguous — together they read as solid rather than as a frosted overlay.
    backgroundColor: color.surface4,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ramp[3],
    borderRadius: radius.cell,
    paddingVertical: 10,
    paddingHorizontal: 13,
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  tipCaret: {
    position: 'absolute',
    top: 3,
    width: TIP_CARET,
    height: TIP_CARET,
    borderRadius: 2,
    // Matches the bubble it points out of — the caret is the same surface.
    backgroundColor: color.surface4,
    transform: [{ rotate: '45deg' }],
  },
  tipText: {
    fontFamily: font.text,
    fontSize: 13,
    lineHeight: 18,
    // label2 on the lighter panel falls to ~4.2:1; primary label holds the copy
    // legible, and the popover is only up while Listen is engaged anyway.
    color: color.label,
  },
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
