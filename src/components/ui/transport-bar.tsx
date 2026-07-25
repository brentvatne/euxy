/**
 * Pinned transport bar. Values pulled from Paper node CO-0 (jam), 1X1-0
 * (record) and 22T-0 (disabled play). Presentational — screens wire it to the
 * store.
 *
 * Jam mode: BPM (left) · skip-to-start / circular play-pause / stop (center) ·
 * JAM mode pill (right); app is clock master. Record mode: app is a clock
 * slave, so the center cluster is a passive glowing-red "Recording / locked to
 * device clock" indicator, the BPM label reads `· REC`, and the pill shows a
 * red REC. Tapping the pill toggles the clock mode. Panic lives on the MIDI
 * tab. `playDisabled` dims the play button (empty pattern).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import { Key } from './key';
import { KeyEase } from './key-ease';
import { EASE_TRANSPORT_PLAY } from '@/lib/flags';

// Wave2 ease spike (concept H comparison surface): ONLY the play button swaps.
const PlayKey = EASE_TRANSPORT_PLAY ? KeyEase : Key;

import type { ClockMode, RecordPhase } from '@/state/types';
import { color, font, ramp, space } from '@/theme/tokens';
import { AppText } from './text';
import { IconPause, IconPlay, IconSkipToStart, IconStop } from './icons';

export interface TransportBarProps {
  playing: boolean;
  bpm: number;
  mode: ClockMode;
  /** Record-mode lifecycle (Paper "Transport · Record states"). */
  recordPhase?: RecordPhase;
  countInBeat?: number;
  playDisabled?: boolean;
  onTogglePlay?: () => void;
  onStop?: () => void;
  onSkipToStart?: () => void;
  onToggleMode?: () => void;
  onPressBpm?: () => void;
}

export function TransportBar({
  playing,
  bpm,
  mode,
  recordPhase = 'armed',
  countInBeat = 0,
  playDisabled = false,
  onTogglePlay,
  onStop,
  onSkipToStart,
  onToggleMode,
  onPressBpm,
}: TransportBarProps) {
  const jam = mode === 'jam';
  return (
    <View style={styles.bar}>
      <Pressable onPress={onPressBpm} disabled={!onPressBpm} style={styles.bpmCol}>
        {/* Meter-style readout: the BPM unit centers under the number. */}
        <View style={styles.bpmBlock}>
          <AppText style={styles.bpmValue} numberOfLines={1}>
            {bpm.toFixed(1)}
          </AppText>
          <AppText style={styles.bpmLabel} numberOfLines={1}>
            BPM
          </AppText>
        </View>
      </Pressable>

      {jam ? (
        <View style={styles.buttons}>
          <Key onPress={onSkipToStart} hitSlop={space.sm} accessibilityLabel="Skip to start">
            <IconSkipToStart size={24} />
          </Key>
          <PlayKey
            onPress={onTogglePlay}
            disabled={playDisabled}
            ack
            style={[styles.play, playDisabled && styles.playDisabled]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <IconPause size={24} color={color.ground} />
            ) : (
              <IconPlay size={24} color={playDisabled ? color.labelDisabled : color.ground} />
            )}
          </PlayKey>
          <Key onPress={onStop} hitSlop={space.sm} accessibilityLabel="Stop">
            <IconStop size={22} />
          </Key>
        </View>
      ) : (
        // Paper "Transport · Record states": armed (gray ring, instructions) →
        // count-in (red ring + beat) → recording (solid glowing dot).
        <View style={styles.recIndicator}>
          {recordPhase === 'recording' ? (
            <View style={styles.recDot} />
          ) : (
            <View
              style={[
                styles.recRing,
                { borderColor: recordPhase === 'countin' ? color.danger : color.label4 },
              ]}
            />
          )}
          <View style={styles.recText}>
            {recordPhase === 'armed' ? (
              // The actual button sequence: arm with ● + ▶, then ▶ to start.
              <View style={styles.armGlyphs}>
                <View style={styles.armRecordIcon} />
                <AppText style={styles.armGlyphSep}>+</AppText>
                <IconPlay size={12} color={color.label} />
                <AppText style={styles.armGlyphSep}>,</AppText>
                <IconPlay size={12} color={color.label} />
              </View>
            ) : (
              <AppText style={styles.recTitle}>
                {recordPhase === 'recording' ? 'Recording' : `Count‑in · ${countInBeat}`}
              </AppText>
            )}
            <AppText style={styles.recSub}>
              {recordPhase === 'recording'
                ? 'locked to device clock'
                : recordPhase === 'countin'
                  ? 'starts after the bar'
                  : 'on the OP‑XY to start'}
            </AppText>
          </View>
        </View>
      )}

      <View style={styles.right}>
        {/* Mode pill (Paper CO-0 / 1X1-0): JAM in white, REC with the record
            LED red. Tap toggles the clock mode. */}
        <Key
          onPress={onToggleMode}
          disabled={!onToggleMode}
          hitSlop={space.sm}
          style={styles.modePill}
          accessibilityRole="button"
          accessibilityLabel={jam ? 'Switch to record mode' : 'Switch to jam mode'}
        >
          {!jam ? <View style={styles.modeDot} /> : null}
          <AppText style={[styles.modeLabel, !jam && styles.modeLabelRec]}>
            {jam ? 'JAM' : 'REC'}
          </AppText>
        </Key>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // FIXED height (Paper rows: 77 = 1px top border + 12px padding + 52px play
    // button + 12px padding) so switching between the playback and record UIs
    // can never reflow the screen — a minHeight of 76 let jam mode (77 natural)
    // sit 1px taller than record mode (clamped to 76), jiggling the lane list
    // on every mode toggle.
    height: 77,
    paddingVertical: space.md,
    paddingHorizontal: 18,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: color.surface,
    // Subtle upward shadow so the pinned bar reads as floating over the lane
    // list scrolling beneath it (Paper 2026-07-24 depth pass).
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -8 },
  },
  bpmCol: { flex: 1 },
  bpmBlock: { alignItems: 'center', alignSelf: 'flex-start' },
  bpmValue: {
    fontFamily: font.display,
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: color.label,
  },
  bpmLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.8,
    color: color.label25,
  },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  play: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: color.label,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playDisabled: { backgroundColor: color.surface2 },
  // Fixed width + left alignment so the dot sits at the same x in every
  // record state regardless of text length (Paper "Transport · Record states").
  recIndicator: { flexDirection: 'row', alignItems: 'center', gap: 11, width: 180, flexShrink: 0 },
  armGlyphs: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  armRecordIcon: { width: 12, height: 12, borderRadius: 999, backgroundColor: color.danger },
  armGlyphSep: { fontFamily: font.text, fontWeight: '600', fontSize: 14, lineHeight: 18, color: color.label25 },
  recDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: color.danger,
    shadowColor: color.danger,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  recRing: { width: 16, height: 16, borderRadius: 999, borderWidth: 2 },
  recText: { gap: 1 },
  recTitle: { fontFamily: font.text, fontWeight: '600', fontSize: 15, lineHeight: 18, color: '#FFFFFF' },
  recSub: { fontFamily: font.text, fontWeight: '500', fontSize: 12, lineHeight: 16, color: color.label25 },
  right: { flex: 1, alignItems: 'flex-end' },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: ramp[7],
  },
  modeDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: color.danger },
  modeLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.88,
    color: color.label,
  },
  modeLabelRec: { color: color.danger },
});
