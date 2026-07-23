# euxy — Design Spec (build handoff)

This is the source of truth for building the euxy iOS app. Read this before the
screenshots. Screenshots are **visual reference only — never read measurements
or colors from them.** Pull exact values from the Paper file (below) or from
`src/theme/tokens.ts`.

- **Design file (Paper):** https://app.paper.design/file/01KY80MDKPNF9GAKHVF36TY2GJ/1-0 (file: "euxy")
- **Tokens (code):** `src/theme/tokens.ts` — colors, type scale, spacing, radii, tap target
- **Styling:** React Native `StyleSheet` consuming `src/theme/tokens.ts` (+ `Color` from expo-router for semantics). **Do NOT use NativeWind / Tailwind.**
- **Product spec / phases:** `ROADMAP.md`
- **Build order + acceptance criteria:** `docs/design/build-order.md`

## How to consume the designs (do this, in order)

1. **If the Paper MCP is connected** (preferred, highest fidelity): for each
   screen below, open its node and pull exact values with
   `get_jsx` / `get_computed_styles` / `get_fill_image`. Use the
   **`paper-desktop:design-to-code`** skill — it translates a node into *this
   project's* conventions rather than generic markup. Build one node at a time.
2. **If Paper is not available:** build from `src/theme/tokens.ts` + the redlines in
   this doc. The screenshots pin layout/hierarchy; tokens pin exact values.
3. Load the Expo skills named per-component below before writing that component.

## Platform priority

**iOS-native is the product.** Web exists only to test the MIDI connection.
Build for iOS first; do not spend fidelity on web beyond a functional MIDI test
harness. (Web MIDI is unsupported on Safari/iOS anyway — see the Enable-MIDI
sheet.)

## Screen & state index (Paper node IDs)

| Screen / state | Node | Notes |
|---|---|---|
| 01 · Sequencer (default) | `7A-0` | Home. 5 lanes, mixed lengths, Jam/playing |
| 01b · Sequencer · 64-step lane | `1OO-0` | Long lane → min block size + horizontal scroll |
| 01c · Sequencer · Record mode | `1WK-0` | Passive "Recording · locked to device clock" transport |
| 01d · Sequencer · Empty | `22T-0` | First-run empty state, dimmed transport |
| 02 · Lane Editor · Steps (default) | `12E-0` | **Default editor view** |
| 02b · Lane Editor · Graph | `DR-0` | OP-XY dot-matrix pixel ring (dual-generator) |
| 02c · Lane Editor · 64 steps | `1DU-0` | Rows auto-shrink to fit length |
| 03 · Patterns | `GR-0` | Library: search + swipe-to-delete |
| 04 · MIDI | `MC-0` | Connection / Timing / Diagnostics / Defaults / Panic |
| 04b · MIDI · Disconnected | `1A8-0` | No device / OFFLINE / dimmed Panic |
| Sheet · Device picker | `29L-0` | Output/input selection |
| Sheet · New Pattern | `2AH-0` | Name / tempo / base resolution |
| Sheet · Enable MIDI | `2BL-0` | Web permission explainer + Safari/iOS fallback |
| (Roadmap board) | `1-0` | Non-app: the product roadmap document |

## Information architecture

3 bottom tabs (NativeTabs). Each tab is its own native Stack.

- **Sequencer** — the instrument (home). Compact custom header (pattern name +
  chevron menu, live BPM, connection dot). Pinned transport bar above the tab
  bar. Segmented **Lanes / Overview** toggle at top.
- **Patterns** — large-title list + search bar. Tap to load; swipe to delete.
- **MIDI** — large-title grouped form: Connection, Timing, Diagnostics
  (→ activity-log push), Defaults, and a destructive Panic button. This tab is
  also the entire web experience.

Sheets (form sheets, not full screens): **Lane Editor**, **Device picker**,
**New Pattern**, **Enable MIDI**.

## Component → Expo API mapping

Load the referenced skill before building each.

| UI | Build with | Skill |
|---|---|---|
| Bottom tabs | `NativeTabs` (`expo-router/unstable-native-tabs`), SF icons | `expo:expo-router` (references/tabs.md) |
| Per-tab navigation | `Stack` (`expo-router/stack`); `headerLargeTitle` for Patterns/MIDI; custom compact header for Sequencer | `expo:expo-router` |
| Lane Editor / all sheets | `Stack.Screen` `presentation: "formSheet"`, `sheetGrabberVisible`, `sheetAllowedDetents` | `expo:expo-router` (references/form-sheet.md) |
| Patterns search | `Stack.SearchBar` + `useSearch` | `expo:expo-router` (references/search.md) |
| Pattern row context menu / preview | `Link.Menu` + `Link.Preview` | `expo:expo-router` |
| Segmented controls (Lanes/Overview, resolution, OP, clock mode) | `@expo/ui` universal `Picker` (segmented) | `expo:expo-ui` (references/universal.md) |
| Sliders (velocity, gate, latency) | `@expo/ui` `Slider` | `expo:expo-ui` |
| Grouped forms (MIDI, New Pattern fields, device list) | `@expo/ui` native `List`/`Form` (SwiftUI Form) for the true grouped look | `expo:expo-ui` |
| Steppers (steps/pulses/rotation/tempo) | custom (± buttons + value); ≥44pt targets | — |
| SF Symbols (icons) | `expo-symbols` `SymbolView` | `expo:expo-native-ui` |
| Semantic colors / light-dark | `Color` from `expo-router` + `src/theme/tokens.ts` | `expo:expo-native-ui` |
| Step grid + playhead | **custom + Reanimated** (see Performance) | `expo:expo-native-ui` (animations) |
| Haptics (record start, drop, panic) | `expo-haptics` | — |

Note: the design is committed to **dark, monochrome**. `@expo/ui` native Forms
render with system chrome — verify they respect the OP-XY grayscale and don't
introduce the system tint (blue). Override tint to `white` (`color.label`).

## Behavior redlines (what screenshots can't show — get these right)

- **Polymeter is derived, never stored.** Each lane's active step =
  `floor(globalTick / lane.ticksPerStep) % lane.steps`; hit =
  `pattern[(laneStep + rotation) % steps]`. Lanes of different lengths (16, 12,
  24, 64) re-align only at their LCM. **Do not force a common bar length.**
- **Lane order is cosmetic.** Reordering never affects timing (step is derived
  from the global tick, not row position). Safe to allow free drag-reorder.
- **Step block sizing:** blocks are `flex: 1` (fit-to-width) down to a minimum
  width; past that the lane **scrolls horizontally** with an auto-following
  playhead and an edge fade + length badge (see 01b at 64). The Lane Editor
  views always fit-to-width (see 02c) — no scroll, blocks just shrink (~5px @ 64).
- **Dual-generator Euclidean (Digitakt model):** a lane = `{ length,
  genA:{pulses,rot}, genB:{pulses,rot}, op, trackRot }`. `op` ∈ OR/AND/XOR/A>B
  combines the two generators into the played pattern. Single-generator (PoC) is
  just `genB.pulses = 0`.
- **Two editor views, same slot, toggle Steps | Graph (Steps is default):**
  - *Steps* — linear: Combined row + Gen 1 + Gen 2 sub-rows.
  - *Graph* — the OP-XY dot-matrix "device screen": two concentric pixel rings
    (Gen 1 outer, Gen 2 inner) combined by the center OP badge.
- **Clock modes change the transport:**
  - *Jam* — app owns Play/Stop and tempo; app is clock master.
  - *Record* — app is a slave; **no app-side transport** — it shows a passive
    "Recording · locked to device clock". User arms record on the OP-XY itself
    (physical Record+Play). Mode toggle lives on the **MIDI** tab, not the
    transport (the transport BPM label just reads `· JAM` / `· REC`).
- **Playhead** is one bright element (white outline on the step; faint cyan in
  the Graph view). At most one playhead position per lane at a time.
- **Panic** (`CC120`+`CC123`+note-offs) is always reachable from the transport
  and the MIDI tab; it is the one red destructive control.
- **Tap targets ≥ 44pt** everywhere (Mute/Solo, steppers, transport). Visual
  glyphs may be smaller with padded hit areas.
- **Color discipline:** grayscale only; `white` = active/primary; the *only*
  hues are `playhead` cyan, `connected` green, `danger` red. No per-lane colors.

## Performance (non-negotiable for the sequencer)

- **Never re-render on the tick.** The engine runs a lookahead scheduler
  (~25ms interval, ~100ms window) and sends timestamped MIDI; it must live in a
  plain module, off the React render path.
- **Playhead animates on the UI thread** via a Reanimated shared value (or a
  `requestAnimationFrame` + ref), driven by the global tick — **not** component
  state. Render the step blocks once; move a playhead overlay over them. Deps
  already present: `react-native-reanimated`, `react-native-worklets`.
- **State:** Zustand; the engine reads `getState()` fresh each tick (no stale
  closures). Editing a lane mid-play takes effect next tick, no re-sync.
- **Lists:** memoize lane rows; use `FlatList`/FlashList if lane count grows.
  Long lanes scroll their own strip — don't re-layout the whole list.
- **No in-app audio.** The OP-XY is the only sound source; the app is a pure
  MIDI controller.

## MIDI layer (contract the UI depends on)

Platform-resolved `MidiPort` interface (`midi/types.ts`), implemented per
platform (`midi.web.ts` now, `midi.ios.ts` CoreMIDI native module later). The UI
talks only to this interface — no platform branching above the MIDI layer. Full
interface + inbound event types are in `ROADMAP.md`. iOS requires a custom
CoreMIDI native module → `expo prebuild` + dev client (not Expo Go); see the
`expo:expo-module` skill when building it.
