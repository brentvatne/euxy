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

export function PatternPlayer({ pattern }: { pattern: PlayerPattern }) {
  const [playing, setPlaying] = useState(false);
  const [tick, setTick] = useState(-1);
  const schedulerRef = useRef<PatternScheduler | null>(null);

  // Stop (and reset) whenever the pattern changes.
  useEffect(() => {
    return () => {
      schedulerRef.current?.stop();
      schedulerRef.current = null;
    };
  }, [pattern]);

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
      schedulerRef.current?.stop();
      schedulerRef.current = null;
      setPlaying(false);
      setTick(-1);
      return;
    }
    const scheduler = new PatternScheduler(getAudioContext(), pattern);
    schedulerRef.current = scheduler;
    scheduler.start();
    setPlaying(true);
  };

  return (
    <View style={styles.card}>
      <LaneGrid lanes={pattern.lanes} tick={playing ? tick : -1} />
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
  },
  transport: { flexDirection: 'row', alignItems: 'center', gap: 16 },
});
