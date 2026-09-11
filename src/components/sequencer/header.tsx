/**
 * Sequencer header (Paper 7L-0): pattern name + chevron on the left — tapping
 * it opens the native pattern menu (new / rename / change icon / share / save
 * copy & revert / revert to loaded / restore preset / clear) — and the
 * connection pill on the right.
 * The pill is a readout of a CONNECTED device and nothing else: with nothing
 * connected the header shows no pill at all (TestFlight, build 84).
 * Lane actions live in the floating action bar (floating-actions.tsx), not here.
 */
import { MenuView } from '@expo/ui/community/menu';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { color, font } from '@/theme/tokens';
import { AppText } from '@/components/ui';
import { LedChip } from '@/components/patterns/led-chip';
import { UpdateMarker } from '@/components/update-marker';

// Paper 7L-0 nav metrics, shared by the styles and by the trigger-width math
// below — the two must not drift.
const NAV_PAD = 16;
const TRIGGER_GAP = 12;

export type PatternMenuAction =
  | 'new'
  | 'rename'
  | 'icon'
  | 'share'
  | 'save-copy'
  | 'revert'
  | 'restore'
  | 'clear';

export function SequencerNav({
  patternName,
  patternChip,
  connected,
  deviceName,
  canSaveCopy,
  canRestorePreset,
  onMenuAction,
}: {
  patternName: string;
  /** The pattern's glyph shades (chips.ts) — identity continuity with the
   * Patterns list, shown left of the title inside the menu trigger. */
  patternChip: string;
  connected: boolean;
  deviceName: string;
  /** True while this session's edits differ from the loaded state — only then
   * is there a changed version for "Save copy & revert" to keep. */
  canSaveCopy: boolean;
  /** True while the loaded pattern is a factory preset — only then does
   * "Restore preset" have a shipped state to go back to. */
  canRestorePreset: boolean;
  onMenuAction: (action: PatternMenuAction) => void;
}) {
  // The menu trigger's own width, measured off the row instead of read from
  // the host: SwiftUI centers a Menu label narrower than its frame, and
  // `alignSelf: 'stretch'` cannot beat that — RNHostView measures the RN child
  // with an unconstrained width (`matchContents`), so 'stretch' resolves to the
  // content's own width and the chip + title + chevron drift toward the middle
  // of the row (TestFlight, build 84; the same centering ROADMAP §4 first hit,
  // which grew back when the chip was added). Sizing the label to the trigger
  // leaves SwiftUI nothing to center, so the row left-aligns on the same 16pt
  // margin the lanes below it use.
  //
  // Measured from the ROW, not from the MenuView: the host reports its
  // content-matched size, so feeding that back into its own child would chase
  // itself. The row and the right-hand group are plain RN views, and neither
  // depends on what the trigger holds.
  const [navWidth, setNavWidth] = useState(0);
  // `null` until measured, not 0: with nothing connected and no update staged
  // the right-hand group really is 0 wide, and a measured 0 still has to arm
  // the width math below — otherwise the trigger falls back to 'stretch' and
  // the title drifts back toward the middle of the row.
  const [rightWidth, setRightWidth] = useState<number | null>(null);
  const triggerWidth =
    navWidth > 0 && rightWidth != null ? navWidth - NAV_PAD * 2 - TRIGGER_GAP - rightWidth : 0;

  // Green by definition — the pill only paints while a device is connected.
  const pill = (
    <View style={styles.pill}>
      <View style={[styles.pillDot, { backgroundColor: color.connected }]} />
      <AppText style={styles.pillText}>{deviceName}</AppText>
    </View>
  );

  return (
    <View style={styles.nav} onLayout={(e) => setNavWidth(e.nativeEvent.layout.width)}>
      <MenuView
        title={patternName}
        actions={[
          { id: 'new', title: 'New pattern', image: 'plus' },
          { id: 'rename', title: 'Rename', image: 'pencil' },
          { id: 'icon', title: 'Change Icon…', image: 'square.grid.3x3' },
          { id: 'share', title: 'Share…', image: 'square.and.arrow.up' },
          // Keep both versions: this session's edits are saved to the
          // library as a copy and the pattern in front of you goes back to
          // the state it was loaded in. Only while the two actually differ —
          // with no edits it would just be Duplicate wearing a longer name.
          ...(canSaveCopy
            ? ([
                {
                  id: 'save-copy',
                  title: 'Save copy & revert',
                  image: 'plus.square.on.square',
                },
              ] as const)
            : []),
          // §15: reverting to what YOU loaded, not factory lanes — swap
          // semantics, so picking it again undoes it.
          { id: 'revert', title: 'Revert to loaded', image: 'arrow.counterclockwise' },
          // Factory presets only: back to the shipped lanes and tempo, the
          // same restore the Patterns list offers per row. Dropped from the
          // menu on your own patterns, which have no factory state.
          ...(canRestorePreset
            ? ([
                {
                  id: 'restore',
                  title: 'Restore preset',
                  image: 'arrow.counterclockwise.circle',
                },
              ] as const)
            : []),
          { id: 'clear', title: 'Clear all lanes', image: 'trash', attributes: { destructive: true } },
        ]}
        onPressAction={({ nativeEvent }) => onMenuAction(nativeEvent.event as PatternMenuAction)}
        style={styles.patternTrigger}
      >
        <View
          style={[styles.pattern, triggerWidth > 0 && { width: triggerWidth }]}
          accessibilityRole="button"
          accessibilityLabel={`Pattern ${patternName} — menu`}
        >
          <LedChip shades={patternChip} size={28} relightOnBoot />
          <AppText style={styles.patternName} numberOfLines={1}>
            {patternName}
          </AppText>
          <Svg width={13} height={13} viewBox="0 0 24 24" style={styles.chevron}>
            <Path
              d="M6 9l6 6 6-6"
              fill="none"
              stroke={color.label}
              strokeWidth={3}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </View>
      </MenuView>
      <View style={styles.right} onLayout={(e) => setRightWidth(e.nativeEvent.layout.width)}>
        {/* Only a real connection gets a pill. A standing "No device" badge
            says nothing you can act on from this screen — connecting is the
            MIDI tab's job — so it was header furniture on every launch
            without a device attached. */}
        {connected ? pill : null}
        {/* Renders nothing unless an OTA update is staged. */}
        <UpdateMarker />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Paper 7L-0: pt 4 / pb 10 / px 16.
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: NAV_PAD,
  },
  // flex:1 (not just flexShrink) — the MenuView native host otherwise caps
  // the title at its own measured width and truncates long pattern names even
  // with free row space (TestFlight feedback 2026-07-24: "the title is
  // truncated too aggressively").
  patternTrigger: { flex: 1, marginRight: TRIGGER_GAP },
  // The measured `triggerWidth` above is what actually pins this row to the
  // left; alignSelf stretch is the fallback for the first frame, before the
  // row has laid out. (Side effect, intended: the strip left of the pill opens
  // the menu — with nothing connected and no update staged that is the whole
  // header row, verified on an iOS simulator.)
  pattern: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'stretch' },
  patternName: {
    flexShrink: 1,
    fontFamily: font.display,
    fontWeight: '700',
    fontSize: 22,
    lineHeight: 28,
    letterSpacing: -0.44,
    color: '#FFFFFF',
  },
  chevron: { marginTop: 4 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: color.surface,
  },
  pillDot: { width: 7, height: 7, borderRadius: 999 },
  pillText: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: '#EBEBEB' },
});
