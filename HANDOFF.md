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
||||||| f35be04
# HANDOFF — MIDI tab (wave1/midi)

Agent D deliverable: MIDI screen (MC-0 / 1A8-0), Device-picker sheet (29L-0),
Enable-MIDI sheet (2BL-0), Activity-log screen, and the web MIDI test harness.
Built to exact Paper values (get_jsx on MC-0/1A8-0/29L-0/2BL-0). tsc clean.

## What I added (all under my scope)
- `src/components/midi/runtime.ts` — **singleton `MidiPort`** + ephemeral MIDI
  state (enable/permission, device lists, activity log, clock-RX indicator),
  `useMidiRuntime()` hook (useSyncExternalStore). Bridges selection to the store
  (setOutput/setInput/setLatencyOffsetMs). Mines the PoC logic: enable →
  enumerate → auto-connect to OP-XY by name → soft-thru → clock indicator.
- `src/components/midi/components.tsx` — grouped-form primitives (SectionHeader,
  Group, Cell w/ position-aware radii, ConnectionBadge, ValueRow, PushRow,
  ClockModeToggle, LatencySlider, LogPreview).
- `src/components/midi/icons.tsx` — cross-platform SVG icons (Paper paths).
- `src/components/midi/midi-screen.tsx` — the screen (used by the index route).
- `src/app/(tabs)/(midi)/index.tsx` (thin), `.../activity-log.tsx` (new, registered
  in `.../_layout.tsx`), `src/app/device-picker.tsx`, `src/app/enable-midi.tsx`.

## Requests / notes for other agents & owners

1. **Engine must reuse the runtime's port singleton.** The engine should
   `import { midi } from '@/components/midi/runtime'` rather than calling
   `createMidiPort()` itself, so device selection + activity log stay in sync.
   Also route engine sends through `outbound(() => …)` (exported concept in
   runtime) OR have the `MidiPort` tag send direction — otherwise the activity
   log labels engine sends as inbound (`←`). Today direction is derived from a
   synchronous `sending` flag set only around the runtime's own sends.
   Consider lifting this singleton into `src/midi/` if the engine owns the port.

2. **`Defaults` (track→channel) is not in Paper MC-0.** The brief requires it, so
   I built it in the same grouped-form style below Diagnostics, reading lanes
   from the store (label = lane.name/note, value = `Channel {channel+1}`). If the
   design adds a real node for it, reconcile.

3. **Clock-mode toggle is a MIDI-local component, not the shared `Segmented`.**
   MC-0 uses a compact **white-active** pill (black text); the shared
   `ui/Segmented` active state is gray (surface4). I matched the mockup exactly
   rather than approximate. If you want this in the shared primitive, add a
   `variant="solid"` (white active) to `ui/segmented.tsx`.

4. **`#98989F` is used directly** (section headers + secondary values), matching
   Paper — it is NOT in `theme/tokens.ts` (nearest are label2 `#afafb3` /
   label3 `#95959A`). `ui/transport-bar.tsx` already hardcodes the same value.
   Suggest adding it to tokens (e.g. `label25`) so it stops being a literal.

5. **Enable-MIDI amber warning** (`#241207`/`#5A3A12`/`#E08A2B`/`#D8B98A`) is a
   deliberate web-only exception to the monochrome rule, taken verbatim from
   Paper 2BL-0. Flagging since it's the only non-gray/green/red/cyan in the app.

6. **Large title ("MIDI") not rendering** on the (midi) tab in the current dev
   build — but the (patterns) tab behaves identically (same
   `headerTransparent + headerLargeTitle` config in the group `_layout`). This
   is a scaffold-wide header convention, not MIDI-specific. Whoever owns the
   shared stack-header setup should confirm large titles show. My
   `(midi)/_layout.tsx` mirrors `(patterns)/_layout.tsx` exactly.

7. **Latency range = ±120 ms** (ROADMAP "offset comp caps at 120ms"; mockup shows
   +12 ms). Adjust `LATENCY_MIN/MAX` in `midi-screen.tsx` if the engine expects a
   different domain.

## Not touched (per constraints)
- `src/state/{types,store}.ts`, `src/theme/*`, `src/components/ui/*`,
  `src/midi/{types,parse}.ts` — unchanged. No new native deps (slider is
  PanResponder). Unrouted PoC `src/components/screen{,.web}.tsx` left in place
  (mined for logic, not deleted).

## Sim verification
No MIDI hardware on the sim, so the real iOS port returns empty lists → the
**disconnected** state (1A8-0) is what renders live; verified. The **connected**
state (MC-0), device picker, and activity-log test-note were verified by
temporarily pointing the runtime at the stub port (reverted). Screenshots in the
session scratchpad.
||||||| f35be04
# HANDOFF — wave1/editor (Lane Editor sheet)

Agent B built the Lane Editor form sheet (`src/app/lane-editor.tsx`) with both
views (Steps `12E-0` default, Graph `DR-0`) and the shared controls. Nothing in
`src/state/{types,store}.ts`, `src/theme/*`, `src/core/euclid.ts`, or
`src/components/ui/*` was modified. New local components live in
`src/components/lane-editor/`.

## Notes for other agents / follow-ups

- **Temporary nav hook (please keep or replace):** `src/components/gallery.tsx`
  now wires `LaneRow.onPressTitle` → `selectLane(id)` + `router.push('/lane-editor')`
  so the sheet is reachable from the Wave 0 gallery. When the real Sequencer
  screen (Wave 2) lands, move this wiring there and drop it from the gallery.

- **"Listen" button is a stub.** The Note cell's Listen pill is rendered for
  fidelity but is a no-op. It needs the inbound note-on capture from the MIDI
  layer (`midi.web.ts` / `midi.ios.ts` + parse) which does not exist yet. Wire
  `updateLane(id, { note })` from the first captured note-on when available.

- **Playhead in the editor is a wall-clock approximation.**
  `src/components/lane-editor/use-playhead.ts` advances a local step index off
  `transport.bpm` + `resolutionTicks` while `transport.playing`, and parks at
  step 0 when stopped. There is no engine/tick source in the repo yet. When the
  engine + Reanimated shared tick land, replace this hook with the shared
  playhead so the editor and the Sequencer stay in lockstep.

- **Track · Channel** row cycles `channel` 0–15 on tap (wraps). There is no
  dedicated track/channel picker route yet; swap the tap handler for a push to
  that sheet when it exists. The chevron is already drawn.

- **Mono type.** The Graph readouts use `font.mono` (Menlo, per tokens). The
  Paper mockups use Space Mono; if Space Mono is added to the app fonts later,
  only `tokens.font.mono` needs to change — the editor reads the token.

- **Testing artifact (not a bug):** on the EAS simulator, argent `gesture-tap`
  near the very top of the form sheet (the Cancel/Done row and the Steps|Graph
  toggle) is consumed by the sheet's drag region. Real taps distinguish tap from
  pan and work; to drive the toggle in automation, drag the sheet content so the
  toggle sits lower, or set the `useState` default view. OP/Resolution/steppers
  lower in the sheet tap fine.
