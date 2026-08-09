/**
 * Sequencer header (Paper 7L-0): pattern name + chevron on the left — tapping
 * it opens the native pattern menu (new / rename / change icon / share / save
 * copy & revert / revert to loaded / restore preset / clear) — and the
 * connection pill on the right.
 * While no device is connected the pill is a button: it drops a popover saying
 * how to connect.
 * Lane actions live in the floating action bar (floating-actions.tsx), not here.
 */
import { MenuView } from '@expo/ui/community/menu';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import Svg, { Path } from 'react-native-svg';

import { haptics } from '@/lib/shims';
import { color, font } from '@/theme/tokens';
import { AppText, Tip } from '@/components/ui';
import { LedChip } from '@/components/patterns/led-chip';
import { UpdateMarker } from '@/components/update-marker';

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
  // With nothing connected the pill is the one thing on screen that knows why
  // nothing plays, so it answers that question itself: tapping it drops the
  // same popover the Listen key uses (TestFlight, build 71). Only while
  // disconnected — a connected pill is a readout, not a question.
  //
  // The popover leaves on a second tap or when a device shows up, NOT on a
  // dwell timer: a timer that fires while the screen is otherwise idle (no
  // touches, transport stopped) sets the state but leaves the popover's exit
  // animation unflushed, so it stayed painted until the next unrelated touch
  // — measured frame-by-frame on an iOS simulator. Both remaining paths are
  // driven by something happening, which is exactly what flushes it.
  const [tipOpen, setTipOpen] = useState(false);
  // The pill's measured centre along the nav row = its offset inside the
  // right-hand group + that group's offset inside the row. Measured, because
  // the pill is as wide as the device name it shows.
  const [rightX, setRightX] = useState(0);
  const [pillX, setPillX] = useState(0);

  const toggleTip = () => {
    haptics.impact('light');
    setTipOpen((open) => !open);
  };

  const pill = (
    <View style={styles.pill}>
      <View
        style={[styles.pillDot, { backgroundColor: connected ? color.connected : color.label4 }]}
      />
      <AppText style={styles.pillText}>{deviceName}</AppText>
    </View>
  );

  return (
    // The nav row is wrapped so the popover can hang off its bottom edge in an
    // unpadded coordinate space, and paints over the lane list below.
    <View style={styles.navWrap}>
      <View style={styles.nav}>
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
          <View style={styles.pattern} accessibilityRole="button" accessibilityLabel={`Pattern ${patternName} — menu`}>
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
        <View style={styles.right} onLayout={(e) => setRightX(e.nativeEvent.layout.x)}>
          {connected ? (
            pill
          ) : (
            <Pressable
              onPress={toggleTip}
              // The pill is 26pt tall; the slop takes it to a comfortable target
              // without moving the paint (same intent as the Listen key's hit).
              hitSlop={10}
              onLayout={(e) =>
                setPillX(e.nativeEvent.layout.x + e.nativeEvent.layout.width / 2)
              }
              accessibilityRole="button"
              accessibilityLabel="No device — how to connect"
              accessibilityState={{ expanded: tipOpen }}
              style={({ pressed }) => pressed && styles.pillPressed}
            >
              {pill}
            </Pressable>
          )}
          {/* Renders nothing unless an OTA update is staged. */}
          <UpdateMarker />
        </View>
      </View>
      {/* Gated on `connected` as well as the tap: a device arriving IS the
          answer, so the popover leaves the moment the pill goes green. */}
      {tipOpen && !connected ? (
        <Tip caretLeft={rightX + pillX} style={styles.navTip}>
          Connect your OP‑XY over USB‑C and switch it on — euxy finds it and connects within a few
          seconds.
        </Tip>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  // The popover's positioning context: unpadded (so a measured pill centre and
  // the popover's own insets share one origin) and above the lane list, which
  // the bubble has to paint over.
  navWrap: { zIndex: 2 },
  // Pulls the layer's right edge in by 8 so the bubble's own 8pt margin lands
  // it on the header's 16pt screen margin, under the pill.
  navTip: { right: 8 },
  // Paper 7L-0: pt 4 / pb 10 / px 16.
  nav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 4,
    paddingBottom: 10,
    paddingHorizontal: 16,
  },
  // flex:1 (not just flexShrink) — the MenuView native host otherwise caps
  // the title at its own measured width and truncates long pattern names even
  // with free row space (TestFlight feedback 2026-07-24: "the title is
  // truncated too aggressively").
  patternTrigger: { flex: 1, marginRight: 12 },
  // alignSelf STRETCH, not flex-start: the SwiftUI menu host centers a child
  // smaller than itself and RN's flex-start never wins — stretching the label
  // to fill the host leaves SwiftUI nothing to center, so text left-aligns.
  // (Side effect, intended: the whole strip left of the pill opens the menu.)
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
  pillPressed: { opacity: 0.6 },
  pillDot: { width: 7, height: 7, borderRadius: 999 },
  pillText: { fontFamily: font.text, fontWeight: '600', fontSize: 13, lineHeight: 16, color: '#EBEBEB' },

});
