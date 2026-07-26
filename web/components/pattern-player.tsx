/**
 * Playback surface shared by the home page (presets) and /p (shared
 * patterns): lane grid + play/stop key + BPM readout. Owns the scheduler;
 * the first press is the user gesture that unlocks the AudioContext.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { SharedLane } from '@/core/share-codec';
import { color } from '@/theme/tokens';
import { getAudioContext, PatternScheduler } from '../lib/player';
import { LaneGrid } from './lane-grid';
import { Key, LedChip, MonoLabel, SANS } from './ui';

export interface PlayerPattern {
  name: string;
  bpm: number;
  lanes: SharedLane[];
}

export function PatternPlayer({
  pattern,
  chip,
  note,
  reserve,
}: {
  pattern: PlayerPattern;
  /** Caption inside the card — what these sounds are. Lives in the card so
   * it stays attached to the thing it describes. */
  note?: string;
  /** Chip glyph shades (chips.ts). When given, the card leads with an
   * identity row — the card names what you're hearing, which also serves as
   * feedback when the picker is scrolled past the card. Omit where the page
   * already shows identity above the card (/p). */
  chip?: string;
  /** Lane sets of sibling patterns — reserves grid height so switching
   * patterns doesn't shift the layout below the card. */
  reserve?: { length: number }[][];
}) {
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(-1);
  const schedulerRef = useRef<PatternScheduler | null>(null);

  // The scheduler's lifetime is derived from (playing, pattern): switching
  // patterns mid-playback tears down the old scheduler and starts the new
  // pattern from the top, still playing. (Don't gate on the ref — the
  // cleanup runs before the next effect body and had nulled it, which left
  // the button on "Stop" with no audio.)
  useEffect(() => {
    if (!playing) return;
    const scheduler = new PatternScheduler(getAudioContext(), pattern);
    schedulerRef.current = scheduler;
    scheduler.start();
    return () => {
      scheduler.stop();
      if (schedulerRef.current === scheduler) schedulerRef.current = null;
    };
  }, [playing, pattern]);

  useEffect(() => {
    if (!playing) return;
    // Re-render only when a 16th-grid step could change, not per frame.
    const minRes = Math.min(...pattern.lanes.map((l) => l.resolutionTicks));
    let raf = 0;
    let last = -1;
    const loop = () => {
      const t = schedulerRef.current?.currentTick() ?? -1;
      const q = t < 0 ? -1 : Math.floor(t / minRes);
      if (q !== last) {
        last = q;
        setTick(t);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, pattern]);

  const toggle = () => {
    if (playing) {
      setPlaying(false);
      setTick(-1);
      return;
    }
    // Create/resume the AudioContext synchronously in the gesture — the
    // effect above starts the scheduler after render.
    getAudioContext();
    setPlaying(true);
  };

  return (
    <View style={styles.card}>
      {chip ? (
        <View style={styles.identity}>
          <LedChip shades={chip} size={28} />
          <Text style={styles.name} numberOfLines={1}>
            {pattern.name}
          </Text>
        </View>
      ) : null}
      <LaneGrid lanes={pattern.lanes} tick={playing ? tick : -1} reserve={reserve} />
      <View style={styles.transport}>
        <Key label={playing ? 'Stop' : 'Play'} primary={!playing} active={playing} onPress={toggle} />
        <MonoLabel>
          {pattern.lanes.length} LANES · {pattern.bpm} BPM
        </MonoLabel>
      </View>
      {note ? <Text style={styles.note}>{note}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: color.displayBg,
    borderRadius: 12,
    padding: 18,
    gap: 16,
    // Hairline bezel — displayBg on the black ground has no visible edge.
    boxShadow: '0 0 0 1px rgba(255,255,255,0.06)',
  },
  // Centred like every other row in the card (grid, transport, note).
  identity: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  name: { fontFamily: SANS, fontSize: 17, fontWeight: '600', color: color.label, flexShrink: 1 },
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
  note: {
    fontFamily: SANS,
    fontSize: 14,
    lineHeight: 19,
    color: '#6E6E76',
    textAlign: 'center',
    alignSelf: 'center',
    maxWidth: 520,
  },
});
