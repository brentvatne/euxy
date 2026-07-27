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
 * dismiss settled).
 *
 * Lane Editor, Tempo, and Share Pattern are only ever pushed from this screen,
 * so the route alone identifies them. New Pattern and Change Icon are ALSO
 * pushed from the Patterns tab (its + button and row long-press) — for those
 * two, the route isn't enough, so callers on this screen tag their push with
 * `?from=sequencer` (see (tabs)/(sequencer)/index.tsx) and this hook checks
 * that global param before treating the sheet as its own.
 *
 * Call this ONCE per screen and pass the result down: a per-lane focus
 * subscription would add two navigation listeners per row.
 */
import { useCallback, useState } from 'react';
import { useFocusEffect, useGlobalSearchParams, usePathname } from 'expo-router';

const OWN_SHEET_ROUTES = new Set(['/lane-editor', '/tempo', '/share-pattern']);
const SHARED_SHEET_ROUTES = new Set(['/new-pattern', '/change-icon']);

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
  const { from } = useGlobalSearchParams<{ from?: string }>();
  const onOwnSheet =
    OWN_SHEET_ROUTES.has(pathname) || (SHARED_SHEET_ROUTES.has(pathname) && from === 'sequencer');
  return focused || onOwnSheet;
}
