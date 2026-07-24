# HANDOFF — Patterns tab (Agent C, branch wave1/patterns)

## What was built

- **Patterns list (GR-0)** — `src/app/(tabs)/(patterns)/index.tsx`
  - Large-title list from `usePatterns()`; each row shows the dot-matrix badge,
    name, and `N lanes · BPM · <resolution>` metadata, with a green active dot +
    chevron.
  - Native header search via `Stack.SearchBar` (filters by name;
    `hideWhenScrolling={false}` so it stays visible like the mockup).
  - `+` header button → `router.push('/new-pattern')`.
  - Row tap → `loadPattern(id)` then `router.navigate('/(tabs)/(sequencer)')`
    (switches to the Sequencer tab). Verified live.
  - Swipe-to-delete (`ReanimatedSwipeable`) → `deletePattern(id)`; disabled for
    the final remaining pattern (store already keeps ≥1). Screen is wrapped in a
    `GestureHandlerRootView` (the app root does not provide one).
- **Empty state (2NR-0)** — rendered when `patterns.length === 0` (dot-matrix
  glyph, "No saved patterns", body copy, "New pattern" button). Also a lighter
  "No patterns matching …" state when a search filter yields nothing.
- **New Pattern sheet (2AH-0)** — `src/app/new-pattern.tsx`
  - Name field (auto-suggests `Untitled NN`), Tempo inline stepper (20–300),
    Base-resolution segmented (1/4·1/8·1/16·1/32 → ticks 24·12·6·3).
  - Cancel dismisses; both header "Create" and the "Create pattern" button call
    `newPattern({ name, bpm, baseResolutionTicks })` then `router.back()`.
    Verified the sheet renders and Create is wired.

New local files (no shared primitives were modified):
- `src/components/patterns/pattern-glyph.tsx` — dot-matrix badge (react-native-svg).
- `src/components/patterns/pattern-row.tsx` — swipeable row.
- `src/components/patterns/resolution-picker.tsx` — white-pill segmented (the
  Paper reference uses a bright active pill with black text, distinct from the
  shared gray-active `Segmented`, so it is built locally per the fidelity rule).
- `src/components/patterns/resolution.ts` — tick⇄note-value helpers.

Also edited `src/app/(tabs)/(patterns)/_layout.tsx`: set `headerTransparent:false`
+ explicit white large-title color. With `headerTransparent:true` the large title
rendered invisibly (present in the a11y tree but not painted). The header
background is still `color.ground` (black), so the look is unchanged but the
title now shows. NOTE: the MIDI tab layout (`(midi)/_layout.tsx`) has the same
`headerTransparent:true` and the same invisible-large-title symptom — that agent
may want the same one-line fix.

## BLOCKER for the store owner (needs a decision) — NOT a bug in this tab

`store.newPattern()` creates a pattern with `lanes: []` and makes it active.
The current Sequencer placeholder `src/components/gallery.tsx:97` does
`patternForLane(lanes[0])` with no empty-guard, so the moment an empty pattern
becomes active the Sequencer subtree throws
`Cannot read property 'genA' of undefined` (red screen) — it re-renders even
while the Patterns tab is foregrounded because the tab stays mounted.

Because of this, **the Create flow currently crashes the app** in the integrated
build, and I could not live-test the actual swipe-delete deletion (getting a 2nd
pattern requires `newPattern`, which triggers the crash before a 2-row list is
viewable). The Patterns list, search, empty/no-match states, sheet rendering,
Create wiring, and row-tap→Sequencer navigation were all verified live.

I did not touch `store.ts` or `gallery.tsx` (both out of my edit scope). Pick one:
1. **Preferred:** `newPattern` seeds one default lane (`makeLane()`), so new
   patterns are never empty. One line in `store.ts`.
2. Guard the real Sequencer (and the placeholder) against `lanes.length === 0`.

Once either lands, swipe-to-delete should be re-verified live.

## Notes
- The blue floating gear on the sim is the expo-dev-client dev-menu launcher
  (dev builds only); it overlaps the `+` in the header on the sim but is not app
  code and will not ship. Drag it aside to tap `+`.
- `npx tsc --noEmit` is clean.
