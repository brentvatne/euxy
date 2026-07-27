/**
 * useScreenFocused — true while this screen is focused OR only covered by one
 * of its own form sheets.
 *
 * Motion principle 6 says a stopped screen produces zero animation frames; the
 * same logic applies to a screen nobody can SEE. The playhead is meant to keep
 * running while a form sheet the Sequencer itself opened (Lane Editor, Tempo,
 * New Pattern, Change Icon, Share Pattern) covers it, and only actually stop
 * while another tab is up. `useFocusEffect` alone can't tell those apart: all
 * of those sheets are siblings of `(tabs)` in the root Stack (see
 * app/_layout.tsx), so pushing any one of them blurs the Sequencer route
 * exactly like switching tabs would (the tester's report, TestFlight build 33
 * — dragging the Lane Editor sheet to dismiss showed a dead grid until the
 * dismiss settled). Every route below is only ever opened from this screen, so
 * "still on one of them" is enough to tell the two cases apart without a
 * global active-tab store.
 *
 * Call this ONCE per screen and pass the result down: a per-lane focus
 * subscription would add two navigation listeners per row.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, usePathname } from 'expo-router';

const OWN_SHEET_ROUTES = new Set([
  '/lane-editor',
  '/tempo',
  '/new-pattern',
  '/change-icon',
  '/share-pattern',
]);

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
  const pathname = usePathname();
  return focused || OWN_SHEET_ROUTES.has(pathname);
}
