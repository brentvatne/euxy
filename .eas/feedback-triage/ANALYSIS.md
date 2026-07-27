# Feedback triage — sequence animations pausing under the Lane Editor sheet

## Summary
The Sequencer's step-strip playhead was pausing (and lagging on resume) whenever
the Lane Editor sheet — or any other sheet opened from the Sequencer tab — was
presented, because the focus hook it relies on can't distinguish "a sheet I
opened is covering me" from "the user switched to a different tab."

## What I changed
`src/components/ui/use-screen-focused.ts:1-46` — `useScreenFocused()` previously
returned `false` as soon as `useFocusEffect`'s blur callback fired. The doc
comment already stated the intended behavior ("the playhead keeps running
while a full-detent form sheet... covers the Sequencer"), but the mechanism
didn't actually implement it: the Lane Editor (and Tempo, New Pattern, Change
Icon, Share Pattern) are all siblings of `(tabs)` in the root Stack
(`src/app/_layout.tsx:85-120`), so pushing any of them blurs the Sequencer
route in React Navigation exactly the same way switching tabs does — even
though the sheet is presented *over* the Sequencer, which stays visually
present/mounted underneath. That blur immediately unmounts the playhead
overlay (`src/app/(tabs)/(sequencer)/index.tsx:181-185` → `StepStrip active={screenFocused}` →
`src/components/sequencer/step-strip.tsx:207-219`), so the strips go dark the
instant the sheet opens and only repaint once the *next* focus event fires —
which, per the tester, lags noticeably behind a drag-to-dismiss gesture
settling.

The fix: `useScreenFocused` now also reads `usePathname()` (a global
subscription via `useSyncExternalStore`, so it updates even in a
blurred-but-mounted screen) and treats being on one of the Sequencer's own
sheet routes as "still focused." All five routes it checks
(`/lane-editor`, `/tempo`, `/new-pattern`, `/change-icon`, `/share-pattern`)
are, per `router.push` call sites, only ever opened from the Sequencer screen
(`src/app/(tabs)/(sequencer)/index.tsx:92,115,121,124,228`), so this can't
misfire by keeping animations alive on top of a different tab. Genuinely
switching tabs (Patterns, MIDI) still reports `pathname` outside this set, so
animations still pause there, matching "it's fine to pause ... on a different
tab entirely."

Also updated the stale/inaccurate comment at
`src/app/(tabs)/(sequencer)/index.tsx:77-79` to describe the corrected
behavior instead of the old (incorrect) claim.

## JS-only?
Yes — this is a pure logic change in a React hook (no native code, no new
dependencies, no config plugin changes). Safe to ship as an OTA EAS Update.

## How to verify
1. Launch the Sequencer tab with a pattern that has at least one lane and
   press Play so the step-strip playhead is animating.
2. Open the Lane Editor (tap a lane's title). While the sheet is up (including
   mid-drag while dismissing it), the step strips behind it should keep
   animating continuously — no dead/frozen grid, no lag on dismiss settling.
3. Repeat for the Tempo sheet (tap the BPM readout) and the pattern menu's New
   Pattern / Change Icon / Share Pattern sheets — same expected behavior.
4. Switch to the Patterns or MIDI tab while playing, then switch back to
   Sequencer — animation should still correctly pause while another tab is
   active and resume when the Sequencer tab regains focus.

## Feedback reference
> when you have the lane editor open we need to keep animating the sequences
> behind it. otherwise when you drag to dismiss you don't see the animations
> and it takes a while for the dismissal to settle and the animations to start
> again. it's fine to pause animations when on a different tab entirely, but
> as long as we are on the sequence tab it should keep running while playing

Build version: 33 (tester: Brent Vatne, iPhone17_3 / iOS 26.5.2).
