/**
 * Playback surface shared by the home page (presets) and /p (shared
 * patterns): lane grid + play/stop key + BPM readout. Owns the scheduler;
 * the first press is the user gesture that unlocks the AudioContext.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import type { SharedLane } from '@/core/share-codec';
import { color } from '@/theme/tokens';
import { getAudioContext, PatternScheduler } from '../lib/player';
import { LaneGrid } from './lane-grid';
import { Key, MonoLabel } from './ui';

export interface PlayerPattern {
  name: string;
  bpm: number;
  lanes: SharedLane[];
}

export function PatternPlayer({
  pattern,
  reserve,
}: {
  pattern: PlayerPattern;
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
      <LaneGrid lanes={pattern.lanes} tick={playing ? tick : -1} reserve={reserve} />
      <View style={styles.transport}>
        <Key label={playing ? 'Stop' : 'Play'} primary={!playing} active={playing} onPress={toggle} />
        <MonoLabel>
          {pattern.lanes.length} LANES · {pattern.bpm} BPM
        </MonoLabel>
      </View>
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
  transport: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
});
