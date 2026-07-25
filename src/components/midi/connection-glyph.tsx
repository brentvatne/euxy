/**
 * ConnectionGlyph — LED-motion concepts F + G. A small 5×5 LED grid whose
 * perimeter ring tells the MIDI connection story, state-machined off the
 * runtime's `connected` boolean (never the clock):
 *
 * - Searching (F): a light chases the ring with a 2-cell phosphor trail —
 *   radar around an empty centre — on a slow loop.
 * - Connect (F): the radar cuts, the ring's cells ignite in the reverse of
 *   the dropout order (~400ms), then the ring flashes full twice at light
 *   (#F6F4F4) — the handshake — and settles fully lit.
 * - Disconnect (G): the ring loses its cells in random order over ~400ms
 *   down to a single dim ember, holds a beat, then the radar resumes.
 *   Pairs with the CONNECTED → OFFLINE badge swap beside it.
 *
 * Reduced Motion freezes to settled frames: rest grid when disconnected,
 * lit ring when connected. All per-cell work runs on the UI thread via
 * LedGrid; JS only orchestrates the state transitions.
 */
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { chase, decay, LedGrid } from '@/components/ui/led-grid';

// Perimeter ring, empty centre. Digit 1 = lit #AFAFB3, digit 2 = light #F6F4F4.
const RING = '11111' + '10001' + '10001' + '10001' + '11111';
const RING_LIGHT = RING.replace(/1/g, '2');
const NO_CELLS: (number | null)[] = Array(25).fill(null);
/** Palette rest — the unlit grid cells. */
const REST = '#2C2C2E';

const REV_MS = 1800; // one radar revolution (16 cells ⇒ ~340ms trail decay)
const IGNITE_MS = 400; // G reverse: cells igniting back in
const DROP_MS = 400; // G dropout to the ember
const EMBER_HOLD_MS = 900; // the ember lingers before the radar resumes
const FLASH_MS = 160; // each handshake flash decays out
const EMBER = 0.5 / 16; // fill progress that keeps exactly one cell (orderIndex 0)
const EMBER_DIM = 0.45; // layer opacity of the dying ring / ember

export function ConnectionGlyph({ connected, size = 22 }: { connected: boolean; size?: number }) {
  const reduceMotion = useReducedMotion();
  // Seed picked JS-side, per mount — every dropout dies a different way.
  const seed = useMemo(() => Math.floor(Math.random() * 0x7fffffff), []);
  const dropOrder = useMemo(() => decay(RING, seed), [seed]);
  const chaseOrder = useMemo(() => chase(), []);

  const one = useSharedValue(1); // constant — static layers
  const chaseP = useSharedValue(0); // trail-mode loop position
  const fillP = useSharedValue(connected ? 1 : 0); // ring fill (ignite/dropout/steady)
  const searchOp = useSharedValue(connected ? 0 : 1); // radar layer visibility
  const fillOp = useSharedValue(1); // ring layer dim (the ember)
  const flashOp = useSharedValue(0); // handshake layer

  const prev = useRef(connected);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const was = prev.current;
    prev.current = connected;
    timers.current.forEach(clearTimeout);
    timers.current = [];
    const after = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    const clear = () => {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
    const stopAll = () => {
      cancelAnimation(chaseP);
      cancelAnimation(fillP);
      cancelAnimation(fillOp);
      cancelAnimation(flashOp);
      cancelAnimation(searchOp);
    };
    // Searching radar REMOVED (Brent 2026-07-25: too much for a resting
    // state) — disconnected simply shows the rest grid. The connect ignite/
    // handshake and dropout-to-ember one-shots stay.
    const startChase = () => {};

    if (reduceMotion) {
      // Settled frames only: rest grid / lit ring.
      stopAll();
      searchOp.value = 0;
      flashOp.value = 0;
      fillOp.value = 1;
      fillP.value = connected ? 1 : 0;
      return clear;
    }

    if (connected === was) {
      // Mount (or Reduced-Motion flip) — settle straight into the steady state.
      stopAll();
      flashOp.value = 0;
      fillOp.value = 1;
      fillP.value = connected ? 1 : 0;
      searchOp.value = connected ? 0 : 1;
      if (!connected) startChase();
      return clear;
    }

    if (connected) {
      // Device found: radar out, cells ignite (reverse dropout), double flash.
      cancelAnimation(chaseP);
      searchOp.value = withTiming(0, { duration: 120, easing: Easing.out(Easing.quad) });
      fillOp.value = 1;
      fillP.value = 0;
      fillP.value = withTiming(1, { duration: IGNITE_MS, easing: Easing.linear });
      const flashOnce = () => {
        flashOp.value = 1; // instant attack
        flashOp.value = withTiming(0, { duration: FLASH_MS, easing: Easing.out(Easing.quad) });
      };
      after(IGNITE_MS, flashOnce);
      after(IGNITE_MS + FLASH_MS + 90, flashOnce);
      return clear;
    }

    // Device dropped: random-order dropout to a single dim ember, hold, resume radar.
    flashOp.value = 0;
    fillP.value = withTiming(EMBER, { duration: DROP_MS, easing: Easing.out(Easing.quad) });
    fillOp.value = withTiming(EMBER_DIM, { duration: DROP_MS, easing: Easing.out(Easing.quad) });
    after(DROP_MS + EMBER_HOLD_MS, () => {
      fillOp.value = withTiming(0, { duration: 250, easing: Easing.out(Easing.quad) });
      searchOp.value = 1;
      startChase();
      after(260, () => {
        fillP.value = 0;
        fillOp.value = 1;
      });
    });
    return clear;
    // Shared values are stable refs; only the state inputs re-run the machine.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, reduceMotion]);

  const searchStyle = useAnimatedStyle(() => ({ opacity: searchOp.value }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: fillOp.value }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: flashOp.value }));

  return (
    <View style={{ width: size, height: size }} pointerEvents="none">
      {/* Rest grid (all 25 cells, empty centre included). */}
      <LedGrid shades={RING} order={NO_CELLS} progress={one} size={size} unlitColor={REST} />
      {/* F — searching radar. */}
      <Animated.View style={[StyleSheet.absoluteFill, searchStyle]}>
        <LedGrid shades={RING} order={chaseOrder} progress={chaseP} size={size} mode="trail" trail={2} renderBase={false} />
      </Animated.View>
      {/* G — ring fill: ignite / steady / dropout-to-ember. */}
      <Animated.View style={[StyleSheet.absoluteFill, fillStyle]}>
        <LedGrid shades={RING} order={dropOrder} progress={fillP} size={size} renderBase={false} />
      </Animated.View>
      {/* F — handshake double flash at light. */}
      <Animated.View style={[StyleSheet.absoluteFill, flashStyle]}>
        <LedGrid shades={RING_LIGHT} order={dropOrder} progress={one} size={size} renderBase={false} />
      </Animated.View>
    </View>
  );
}
