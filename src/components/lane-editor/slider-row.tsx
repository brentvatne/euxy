/**
 * SliderRow — label + value readout over a thin custom track with a large white
 * thumb. Matches Paper nodes 12E-0 / DR-0 (Velocity, Gate). Custom RN build
 * (PanResponder) rather than @expo/ui Slider so it stays monochrome and never
 * picks up the system tint. Track 6px, thumb 22px, fill #EBEBEB.
 */
import { useRef, useState } from 'react';
import { PanResponder, StyleSheet, View } from 'react-native';

import { color, font, space } from '@/theme/tokens';
import { AppText } from '@/components/ui';

const THUMB = 22;
const TRACK_H = 6;

export interface SliderRowProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  /** Formats the trailing value readout (defaults to the raw number). */
  formatValue?: (value: number) => string;
}

export function SliderRow({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  formatValue,
}: SliderRowProps) {
  const [width, setWidth] = useState(0);
  const widthRef = useRef(0);

  const clampToStep = (raw: number) => {
    const clamped = Math.max(min, Math.min(max, raw));
    const snapped = Math.round((clamped - min) / step) * step + min;
    return Math.max(min, Math.min(max, snapped));
  };

  const setFromX = (x: number) => {
    const w = widthRef.current - THUMB;
    if (w <= 0) return;
    const ratio = Math.max(0, Math.min(1, (x - THUMB / 2) / w));
    const next = clampToStep(min + ratio * (max - min));
    if (next !== value) onChange(next);
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => setFromX(e.nativeEvent.locationX),
      onPanResponderMove: (e) => setFromX(e.nativeEvent.locationX),
    })
  ).current;

  const ratio = max > min ? (value - min) / (max - min) : 0;
  const usable = Math.max(0, width - THUMB);
  const thumbLeft = ratio * usable;
  const fillW = thumbLeft + THUMB / 2;

  return (
    <View style={styles.row}>
      <View style={styles.head}>
        <AppText style={styles.label}>{label}</AppText>
        <AppText style={styles.value}>{formatValue ? formatValue(value) : String(value)}</AppText>
      </View>
      <View
        style={styles.hit}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setWidth(w);
        }}
        {...pan.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: fillW }]} />
        </View>
        <View style={[styles.thumb, { left: thumbLeft }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { gap: space.sm },
  head: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { fontFamily: font.text, fontWeight: '500', fontSize: 14, lineHeight: 18, color: color.label25 },
  value: { fontFamily: font.text, fontWeight: '600', fontSize: 14, lineHeight: 18, color: color.label },
  hit: { height: THUMB, justifyContent: 'center' },
  track: { height: TRACK_H, borderRadius: 3, backgroundColor: color.surface2, overflow: 'hidden' },
  fill: { height: TRACK_H, borderRadius: 3, backgroundColor: '#EBEBEB' },
  thumb: {
    position: 'absolute',
    top: 0,
    width: THUMB,
    height: THUMB,
    borderRadius: 999,
    backgroundColor: color.label,
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
});
