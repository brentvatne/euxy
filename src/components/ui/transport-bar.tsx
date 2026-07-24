/**
 * Pinned transport bar. Values pulled from Paper node CO-0 (jam), 1X1-0
 * (record) and 22T-0 (disabled play). Presentational — screens wire it to the
 * store.
 *
 * Jam mode: BPM (left) · skip-to-start / circular play-pause / stop (center) ·
 * Panic (right); app is clock master. Record mode: app is a clock slave, so the
 * center cluster is a passive glowing-red "Recording / locked to device clock"
 * indicator and the BPM label reads `· REC` (see redlines). Panic is always
 * reachable. `playDisabled` dims the play button (empty pattern).
 */
import { Pressable, StyleSheet, View } from 'react-native';

import type { ClockMode } from '@/state/types';
import { color, font, space } from '@/theme/tokens';
import { AppText } from './text';
import { IconPanic, IconPause, IconPlay, IconSkipToStart, IconStop } from './icons';

export interface TransportBarProps {
  playing: boolean;
  bpm: number;
  mode: ClockMode;
  playDisabled?: boolean;
  onTogglePlay?: () => void;
  onStop?: () => void;
  onSkipToStart?: () => void;
  onPanic?: () => void;
  onPressBpm?: () => void;
}

export function TransportBar({
  playing,
  bpm,
  mode,
  playDisabled = false,
  onTogglePlay,
  onStop,
  onSkipToStart,
  onPanic,
  onPressBpm,
}: TransportBarProps) {
  const jam = mode === 'jam';
  return (
    <View style={styles.bar}>
      <Pressable onPress={onPressBpm} disabled={!onPressBpm} style={styles.bpmCol}>
        <AppText style={styles.bpmValue} numberOfLines={1}>
          {bpm.toFixed(1)}
        </AppText>
        <AppText style={styles.bpmLabel} numberOfLines={1}>
          {jam ? 'BPM · JAM' : 'BPM · REC'}
        </AppText>
      </Pressable>

      {jam ? (
        <View style={styles.buttons}>
          <Pressable onPress={onSkipToStart} hitSlop={space.sm} accessibilityLabel="Skip to start">
            <IconSkipToStart size={24} />
          </Pressable>
          <Pressable
            onPress={onTogglePlay}
            disabled={playDisabled}
            style={[styles.play, playDisabled && styles.playDisabled]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <IconPause size={24} color={color.ground} />
            ) : (
              <IconPlay size={24} color={playDisabled ? color.labelDisabled : color.ground} />
            )}
          </Pressable>
          <Pressable onPress={onStop} hitSlop={space.sm} accessibilityLabel="Stop">
            <IconStop size={22} />
          </Pressable>
        </View>
      ) : (
        // Paper 1X1-0: glowing 16px red dot + two-line status.
        <View style={styles.recIndicator}>
          <View style={styles.recDot} />
          <View style={styles.recText}>
            <AppText style={styles.recTitle}>Recording</AppText>
            <AppText style={styles.recSub}>locked to device clock</AppText>
          </View>
        </View>
      )}

      <View style={styles.right}>
        <Pressable onPress={onPanic} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel="Panic — all notes off">
          <IconPanic size={24} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    paddingHorizontal: 18,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: color.surface,
  },
  bpmCol: { flex: 1 },
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
  recIndicator: { flexDirection: 'row', alignItems: 'center', gap: 11, flexShrink: 1 },
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
  recText: { gap: 1 },
  recTitle: { fontFamily: font.text, fontWeight: '600', fontSize: 15, lineHeight: 18, color: '#FFFFFF' },
  recSub: { fontFamily: font.text, fontWeight: '500', fontSize: 12, lineHeight: 16, color: color.label25 },
  right: { flex: 1, alignItems: 'flex-end' },
});
