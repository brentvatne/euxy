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
