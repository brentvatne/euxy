/**
 * KeyEase — the `Key` pressable (LED-motion concept H) reimplemented with
 * react-native-ease for the wave2 spike (ROADMAP "Animation tech notes").
 * Same contract and same motion values as `key.tsx`:
 *   • press-in: 80ms travel to scale 0.94 (ease-out);
 *   • release: spring back (damping 14 / stiffness 320);
 *   • optional one-shot LED ack ring blooming out over 250ms.
 *
 * Differences by construction: the animations run on Core Animation /
 * Android Animator with ZERO JS or UI-thread work during the animation —
 * but the TRIGGER is React state, so every press-in/out costs one React
 * commit (Reanimated `Key` presses never re-render). The ack one-shot is
 * expressed as a keyed remount with `initialAnimate` → `animate`, ease's
 * idiom for fire-and-forget effects. Reduced Motion is handled manually
 * (`useReducedMotion` → `{ type: 'none' }`); ease has no built-in support.
 */
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { EaseView } from 'react-native-ease';
import { useReducedMotion } from 'react-native-reanimated';

import type { KeyProps } from './key';

const TRAVEL = { type: 'timing', duration: 80, easing: 'easeOut' } as const;
const SPRING = { type: 'spring', damping: 14, stiffness: 320 } as const;
const ACK = { type: 'timing', duration: 250, easing: 'easeOut' } as const;
const NONE = { type: 'none' } as const;

/** Drop-in for `Key` — identical public shape. */
export function KeyEase({ style, ack = false, onPressIn, onPressOut, children, ...rest }: KeyProps) {
  const reduced = useReducedMotion();
  const [down, setDown] = useState(false);
  // Monotonic shot id — each release remounts the ring so its
  // initialAnimate → animate one-shot replays.
  const [shot, setShot] = useState(0);

  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        setDown(true);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        setDown(false);
        if (ack && !reduced) setShot((n) => n + 1);
        onPressOut?.(e);
      }}
    >
      <EaseView
        animate={{ scale: down ? 0.94 : 1 }}
        transition={reduced ? NONE : down ? TRAVEL : SPRING}
        style={style}
      >
        {children}
        {ack && shot > 0 ? (
          <EaseView
            key={shot}
            pointerEvents="none"
            initialAnimate={{ opacity: 0.8, scale: 1 }}
            animate={{ opacity: 0, scale: 1.3 }}
            transition={ACK}
            style={styles.ring}
          />
        ) : null}
      </EaseView>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ring: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#F6F4F4',
  },
});
