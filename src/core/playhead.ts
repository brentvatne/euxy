/**
 * Playhead — the global tick position, held as Reanimated shared values so the
 * UI thread can animate a playhead overlay WITHOUT any React re-render on the
 * tick (see docs/design/README.md "Performance").
 *
 * These are module-level mutables (`makeMutable`) rather than `useSharedValue`
 * so the plain engine module (off the render path) can drive them directly and
 * any component can read them in a worklet. Never store the playhead in React
 * state — read these in `useAnimatedStyle` instead.
 */
import { makeMutable } from 'react-native-reanimated';

/** Current global tick (fractional — interpolated between scheduler wakes). */
export const playheadTick = makeMutable(0);

/** 1 while the transport is running, 0 when stopped. Drives overlay opacity. */
export const playheadPlaying = makeMutable(0);

/** Engine → UI: push the current (fractional) global tick. JS-thread safe. */
export function setPlayhead(tick: number, playing: boolean) {
  playheadTick.value = tick;
  playheadPlaying.value = playing ? 1 : 0;
}

/** Reset the playhead to the start (tick 0). */
export function resetPlayhead() {
  playheadTick.value = 0;
}
