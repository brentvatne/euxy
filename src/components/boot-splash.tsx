/**
 * BootSplash — the LED power-on (ROADMAP "Splash boot sequence" / LED-motion
 * concept C). The native splash is the unlit 5×5 grid; this overlay renders
 * the IDENTICAL PNG centered at the same 276pt (same bitmap, same scaling, so
 * hiding the native splash is invisible on any device), then types a glyph on
 * cell by cell (30ms stagger, instant attack) over it, holds ~150ms, and
 * fades itself out while the UI appears underneath — one continuous power-on.
 *
 * The typed glyph is picked at random from the 24-chip registry each launch:
 * frame 0 is the unlit grid, so the splash PNG is glyph-agnostic.
 * Reduced Motion skips straight to the crossfade.
 */
import * as SplashScreen from 'expo-splash-screen';
import { useEffect, useMemo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  runOnJS,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { CHIPS } from '@/components/patterns/chips';
import { LedGrid, litCount, typeOnOrder } from '@/components/ui/led-grid';

// Keep the native splash up until our first frame is rendered underneath it.
void SplashScreen.preventAutoHideAsync().catch(() => {});

const GRID = 276; // pt — must match app.json expo-splash-screen imageWidth
const STAGGER_MS = 30;
const HOLD_MS = 150;
const FADE_MS = 250;

const GLYPHS = Object.values(CHIPS);

export function BootSplash() {
  const [done, setDone] = useState(false);
  const reduceMotion = useReducedMotion();
  const glyph = useMemo(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)], []);
  const order = useMemo(() => typeOnOrder(glyph), [glyph]);
  const progress = useSharedValue(0);
  const opacity = useSharedValue(1);

  useEffect(() => {
    // Our identical frame is mounted — drop the native splash and power on.
    SplashScreen.hide();
    const cells = litCount(glyph);
    const typeMs = reduceMotion ? 0 : cells * STAGGER_MS;
    if (reduceMotion) {
      progress.value = 1;
    } else {
      progress.value = withTiming(1, { duration: typeMs, easing: Easing.linear });
    }
    const t = setTimeout(() => {
      opacity.value = withTiming(
        0,
        { duration: FADE_MS, easing: Easing.out(Easing.quad), reduceMotion: ReduceMotion.System },
        (finished) => {
          if (finished) runOnJS(setDone)(true);
        },
      );
    }, typeMs + HOLD_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (done) return null;

  return (
    <Animated.View style={[styles.overlay, { opacity }]} pointerEvents={done ? 'none' : 'auto'}>
      <View style={{ width: GRID, height: GRID }}>
        {/* Frame 0 = the actual splash asset, so the handoff can't jump. */}
        <Image
          source={require('../../assets/images/splash-icon.png')}
          style={{ width: GRID, height: GRID }}
          fadeDuration={0}
        />
        <View style={StyleSheet.absoluteFill}>
          <LedGrid shades={glyph} order={order} progress={progress} size={GRID} renderBase={false} />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#08080A',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
});
