# euxy — Build Order & Acceptance Criteria

Build in this order. It mirrors `ROADMAP.md`: **prove the risky MIDI/timing
plumbing on a single lane before building the full UI.** Don't build all screens
up front. Each step lists a concrete, hardware-touchable acceptance check.

Design values: pull from Paper nodes (see `docs/design/README.md`) or
`src/theme/tokens.ts`. Behavior rules: the "Behavior redlines" section of the spec.

## Phase 0 — Foundation

1. **Scaffold** Expo Router app shell. Load `expo:expo-project-structure`.
   - `app/_layout.tsx` → `NativeTabs` (Sequencer / Patterns / MIDI).
   - Shared Stack per tab. Dark, monochrome theme wired from `src/theme/tokens.ts`;
     override the system tint to `white`.
   - ✅ Three tabs render; large titles on Patterns/MIDI; app is all-grayscale.
2. **Tokens + primitives.** Step block, lane-row shell, segmented control
   (`@expo/ui` Picker), stepper, status pill, SF Symbol wrapper.
   - ✅ A storybook-ish screen shows each primitive matching the tokens.

## Phase 1 — PoC (single lane, both clock modes) — the critical path

Follow ROADMAP §9. Node refs: `7A-0` (Sequencer), `12E-0`/`DR-0` (editor),
`MC-0` (MIDI).

3. **Euclidean engine** (`core/euclid.ts`) — Bresenham; rotation at read time.
   Unit-tested incl. edge cases (k=0, k=n) and dual-gen OR/AND/XOR/A>B combine.
   - ✅ Tests green; `euclid(4,16)` → hits at 0/4/8/12.
4. **Engine + scheduler** (`core/engine.ts`, `sequencer.ts`) — 24-PPQN global
   tick, lookahead scheduler (100ms/25ms), step derived from tick. Plain module,
   **off the render path**.
   - ✅ Logs timestamped tick/note events at a stable tempo.
5. **Web MIDI layer** (`midi/midi.web.ts` + `parse.ts` + `midi/types.ts`) with
   device enumeration behind the `MidiPort` interface.
   - ✅ Enumerates and connects to the OP-XY over USB-C (Chrome).
6. **Sequencer screen — one lane** + **Lane Editor sheet (Steps default)**.
   Playhead on the **UI thread** (Reanimated shared value), blocks rendered once.
   "Listen for note" captures an inbound note-on.
   - ✅ One lane plays; playhead is smooth (no per-tick re-render); Listen works.
7. **Jam mode** — app sends clock (`0xF8`) + `Start`/`Stop` + lane notes;
   transport owns Play/Stop + tempo.
   - ✅ OP-XY plays the lane in time, driven by the app.
8. **Record mode** — app slaves to inbound `0xF8`; `Start` resets tick to 0;
   passive "Recording" transport (no app arm). Mode toggle on MIDI tab.
   - ✅ Arming Record+Play on the OP-XY records the lane grid-aligned.
9. **Mode toggle + Panic** in the shared engine
   (`CC120`+`CC123`+note-offs on stop/switch/disconnect/beforeunload).
   - ✅ Panic silences all notes; mode switch never hangs a note.
10. **iOS stub** (`midi.ios.ts`) so the app builds on device.
    - ✅ App builds and runs on iOS (MIDI no-op).

**Phase 1 done when:** a single dual-capable lane plays tightly in both modes,
note capture works, and Record-mode capture into the OP-XY is grid-aligned.

## Phase 2 — Multi-lane UI (ROADMAP §10)

Node refs: `7A-0`, `1OO-0` (64-lane), `1DU-0` (64 editor), `DR-0` (Graph view),
`GR-0` (Patterns), `29L-0` (device picker).

11. Multiple lanes: add / remove / **mute / solo** (44pt), free drag-reorder
    (cosmetic — see redline). Empty state `22T-0`.
12. Step sizing: fit-to-width → min-size → horizontal scroll for long lanes
    (verify at 16 / 12 / 24 / **64**). Editor views always fit-to-width.
13. **Graph view** (`DR-0`) — dot-matrix pixel ring, dual concentric generators.
14. **Overview** map (segmented toggle already present; content still to design).
15. Track-to-channel mapping UI; latency-offset control; device picker sheet.
16. Patterns library + New Pattern sheet (`2AH-0`).
    - ✅ 8 lanes across tracks play simultaneously on channels 1–8; long lanes
      scroll; Graph ↔ Steps toggle swaps in place.

## Phase 3 — Persistence & Mobility (ROADMAP §10)

17. Pattern save / recall (Patterns tab functional).
18. Bluetooth MIDI.
19. **Native iOS CoreMIDI module** — real `midi.ios.ts`. Load
    `expo:expo-module`; requires `expo prebuild` + config plugin + dev client
    (not Expo Go).
    - ✅ Patterns persist; iOS drives the OP-XY over CoreMIDI.

## Hardware to confirm (ROADMAP §12) — verify against the real OP-XY

Full drum-pad → note map (only 53/55/49 known), default track→channel map,
SPP/Continue support, slave-clock drift, ~120-note-per-track cap. Treat as
refinements, not blockers — the design already locks the record-arm assumption
(physical button only).
