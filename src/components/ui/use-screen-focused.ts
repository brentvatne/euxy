/**
 * useScreenFocused — true while this screen is the focused route.
 *
 * Motion principle 6 says a stopped screen produces zero animation frames; the
 * same logic applies to a screen nobody can SEE. The playhead keeps running
 * while a full-detent form sheet (the Lane Editor) covers the Sequencer or
 * while another tab is up — NativeTabs and the root Stack both keep the screen
 * mounted — so anything painting off the playhead has to stop on blur.
 *
 * Call this ONCE per screen and pass the result down: a per-lane focus
 * subscription would add two navigation listeners per row.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export function useScreenFocused(): boolean {
  // Starts true: the screen's first render IS its focused render (the
  // Sequencer is the launch route), and starting false would blank the
  // playhead layer for a frame on cold boot — this app has been bitten by
  // first-render animation races twice already.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  return focused;
}
