# Euclidean OP-XY Sequencer — Roadmap

**Status:** for review · **Date:** 2026-07-21

**First-build objective:** a 1-lane proof-of-concept that generates a Euclidean rhythm and plays it cleanly to the OP-XY over USB-C MIDI, with a working clock-mode toggle.

---

## Phases

### Phase 1 — PoC Validation (§9, Build Order)

Eight sequential checkpoints validate the risky timing and MIDI plumbing before expanding the UI:

1. Scaffold Expo (TypeScript, expo-router)
2. Euclidean engine + unit tests
3. Web MIDI layer (`midi.web.ts` + `parse.ts`) with device enumeration
4. "Listen for note" via `onInbound` callback
5. Jam mode — lookahead scheduler sends clock (`0xF8`) and lane notes
6. Record mode — app slaves to incoming device clock
7. Mode toggle + panic behavior in shared engine
8. iOS stub (`midi.ios.ts`) for build proof

**Completion criterion:** single Euclidean lane plays tightly in both modes, note capture works, and "Record mode" recording into the OP-XY confirms grid alignment.

### Phase 2 — Multi-Lane UI (§10)

- Multiple lanes (add, remove, mute, solo)
- Stacked lanes within and across tracks
- Paged pattern views for long sequences (exceeding 16 steps)
- Global pattern overview
- Track-to-channel mapping UI
- Latency-offset control

### Phase 3 — Persistence & Mobility (§10)

- Pattern save/recall
- Bluetooth MIDI support
- Native iOS CoreMIDI module (via `expo prebuild` + config plugin; requires dev client, not Expo Go)

---

## Architecture Layers

### `core/` — pure TypeScript, platform-agnostic

- `euclid.ts` — Euclidean pattern generation; rotation applied at read time
- `engine.ts` — global 24-PPQN tick counter; lookahead scheduler (100ms window, 25ms interval)
- `sequencer.ts` — lane-to-note scheduling; step derived from global tick
- `types.ts` — `Lane`, `ClockMode` definitions

### `midi/` — platform-resolved via Expo

- `types.ts` — shared `MidiPort` interface (the contract)
- `parse.ts` — inbound byte parsing to typed `InboundEvent`
- `midi.web.ts` — Web MIDI API implementation
- `midi.ios.ts` — CoreMIDI stub (built later)
- `index.ts` — re-export; Expo resolves `.web`/`.ios` at build time

### `app/` — UI screens

- `index.tsx` — PoC single-lane screen
- Controls, pattern display (paged 16-step rows), MIDI activity log

### State management

Zustand store; engine reads fresh `getState()` every tick (no stale closures). Playhead animation via `requestAnimationFrame` + ref (outside store, avoiding per-tick re-renders).

---

## Clock Modes — the timing contract

### Jam (app clock master)

- App generates tempo and sends `MIDI Clock (0xF8, 24 PPQN)` + `Start (0xFA)` / `Stop (0xFC)`
- Lookahead scheduler advances global tick from app tempo
- **Use case:** live auditioning, experimentation
- **Caveat:** OP-XY's slave clock has reported drift (~½-beat wander; offset comp caps at 120ms) — not trustworthy for tight recording

### Record (device clock master)

- App receives `0xF8` clock from OP-XY and advances global tick
- `Start (0xFA)` resets tick to 0; `Stop (0xFC)` halts scheduling
- App feeds notes locked to the device's own recording clock → tightest alignment
- **Use case:** reliable multi-take recording into the OP-XY
- **UX:** no app-side arming; user presses Record+Play on device; app auto-begins on incoming Start

**Record arming assumption (§3, locked):** app cannot remotely trigger record. The physical Record+Play button on the OP-XY is the only record initiator. Simplifies the design and is consistent with observed OP-XY behavior.

---

## MIDI Data Model & Polymeter

### Lane definition

```
Lane = {
  id, track, note, channel,
  steps, hits, rotation,
  ticksPerStep (resolution), velocity, gateMs, muted
}
```

### Polymeter logic

Single global tick counter; each lane's step is **derived**, not stored:

```
laneStep = floor(globalTick / lane.ticksPerStep) % lane.steps
hit = pattern[(laneStep + rotation) % steps]
```

Editing a lane mid-play takes effect on the next tick — no re-sync. Lanes of different lengths (e.g. 16 & 12) re-align only at their LCM (48 steps). Don't force lanes to a common bar length.

### Multi-timbral track addressing

- **Fixed default map:** track N receives on MIDI channel N (tracks 1–8 = ch 1–8)
- **Live triggering:** all 8 tracks simultaneously on channels 1–8 ✅
- **Within-track multi-note:** separate notes on one channel (kick 53 / snare 55 / hat 49 all on ch 1, for example)
- **Recording:** evidence leans **one track per pass** (notes land on the active-track channel); cross-track simultaneous recording remains unconfirmed (§12 item 2)

### Note-off & panic

- Default gate ~25 ms (per-lane override optional)
- On Stop / mode-switch / device-disconnect / `beforeunload` / Panic button: send `CC120 (All Sound Off)` + `CC123 (All Notes Off)` on active channels, plus explicit note-offs for outstanding notes

---

## Euclidean Rhythm Engine (§4)

Generate via either the `euclidean-rhythms` npm package or a ~15-line Bresenham algorithm (identical musical output, zero dependencies).

```ts
function euclid(hits: number, steps: number): number[] {
  const out: number[] = [];
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += hits;
    if (bucket >= steps) { bucket -= steps; out.push(1); }
    else out.push(0);
  }
  return out;
}
```

**Rotation** applied at read time, not baked into the pattern — enables live pattern twist without re-generation. Unit-tested including edge cases (k=0, k=n).

---

## PoC Screen Specification (§6)

- **Enable MIDI button** — requires user gesture, prompts for permission, shows connection status
- **Device pickers** — output + input selection with live status
- **Clock mode toggle** — Jam / Record; BPM field active only in Jam
- **Transport controls** — in Jam the app owns Start/Stop; in Record the app displays "waiting for device… / running" (no arm control)
- **Single lane controls:**
  - Note field + **"Listen for note"** button (captures next inbound note-on)
  - Parameters: steps, hits, rotation, resolution, velocity, gate
  - **Pattern display:** dots (filled = hit) with playhead marker; **paged in 16-step rows** for long patterns
- **MIDI activity log** — shows raw inbound/outbound bytes (hex) for debugging
- **Unsupported-browser fallback** — via `isSupported()` feature-detect
- **No in-app audio** — OP-XY is the sole sound source

---

## Scheduler Timing Details (§3)

**Lookahead approach (Chris Wilson's "two clocks"):**

- ~25 ms `setInterval` looks ahead ~100 ms
- Every tick/note in that window fires with an exact `performance.now()`-relative timestamp via `MIDIOutput.send(data, timestamp)`
- Native scheduler honors future timestamps; JS-timer jitter never reaches MIDI output

**Resolution:** 24 PPQN → 1/16 = 6 ticks, 1/8 = 12, 1/8T = 8, 1/16T = 4, 1/32 = 3, 1/4 = 24

**Timestamp domain:** `DOMHighResTimeStamp` (~100 µs quantization, inaudible)

**Background throttling risk:** keep window foregrounded to avoid stalled timers (future: Worker-driven tick mitigation)

---

## Web MIDI Specifics (§7)

- **Permissions:** `requestMIDIAccess({ sysex: false })` requires secure context (HTTPS/localhost), prompts user (Chrome 124+), must be called from a click. Rejection throws `SecurityError`; show fallback UI. `sysex:false` avoids heavier prompts.
- **Inbound framing:** one parsed message per `onmidimessage` event; system real-time bytes (`≥0xF8`) arrive standalone. `parse.ts` filters clock/transport separately.
- **Hotplug:** `access.onstatechange` event; match device by stable `id` (fallback: name); re-lookup in live maps; re-`open()` on reconnect. Avoid holding port references.
- **Browser support:** Chromium (Chrome/Edge/Brave) + desktop Firefox (108+). No Safari or iOS Safari. Feature-detect via `typeof navigator.requestMIDIAccess === 'function'`.

---

## MIDI Interface Contract (`midi/types.ts`)

```ts
export type InboundEvent =
  | { type: "noteon"; note: number; velocity: number; channel: number }
  | { type: "noteoff"; note: number; channel: number }
  | { type: "clock" }                    // 0xF8
  | { type: "start" }                    // 0xFA
  | { type: "continue" }                 // 0xFB
  | { type: "stop" }                     // 0xFC
  | { type: "songpos"; position: number }; // 0xF2

export interface MidiPort {
  isSupported(): boolean;
  init(): Promise<void>;
  listInputs(): MidiDevice[];
  listOutputs(): MidiDevice[];
  selectInput(id: string | null): void;
  selectOutput(id: string | null): void;
  sendNoteOn(note, velocity, channel, time?): void;
  sendNoteOff(note, channel, time?): void;
  sendClock(time?): void;
  sendStart(): void; sendContinue(): void; sendStop(): void;
  allNotesOff(channel?): void;           // panic: CC120 + CC123 + note-offs
  setLatencyOffsetMs(ms: number): void;
  onInbound(cb: (e: InboundEvent) => void): () => void;
  onStateChange(cb: () => void): () => void;
  onRaw(cb: (bytes, time) => void): () => void;
}
```

---

## iOS Implementation Note (§11)

Web is plain Expo web. iOS requires a **custom CoreMIDI native module** → `expo prebuild` + dev client + config plugin. **Cannot run in Expo Go.** The `.ios.ts` stub keeps the app building today; real iOS is a genuine native-module phase later. Web MIDI is a dead end on Safari/iOS.

---

## Hardware Validation Checklist (§12)

Remaining OP-XY behaviors to confirm before or at build start:

1. ~~Remote record-arm via MIDI Start~~ — **Decided: assume NO** (locked in design; a bonus if possible)
2. Multi-timbral receive on all 8 tracks (sub-question: simultaneous multi-track recording or one-per-pass?) — live all-8 confirmed; record behavior leans one-track-at-a-time
3. Full drum pad → note-number map (only 53/55/49 documented; ~20 pads total)
4. Default track-to-MIDI-channel map (expected track N = ch N) and recording-capable channels
5. SPP / Continue (0xFB) support, or Start-from-zero only
6. Real-world slave-clock stability (drift reported) and multi-out MIDI reliability
7. ~120-note-per-track recording cap; per-pattern or per-track

---

## Recommended Defaults (§13)

| Parameter | Default |
|-----------|---------|
| Step resolution | 1/16 (6 ticks); options: 1/4, 1/8, 1/8T, 1/16, 1/16T, 1/32 |
| Global PPQN | 24 |
| Lookahead window | 100 ms |
| Scheduler interval | 25 ms |
| Euclidean generator | `euclidean-rhythms` npm or ~15-line Bresenham |
| Rotation | separate lane param (applied at read-time) |
| State mgmt | Zustand; `getState()` in loop |
| Playhead animation | `requestAnimationFrame` + ref |
| Gate duration | ~25 ms (per-lane override optional) |
| Panic sequence | CC120 + CC123 on active channels + explicit note-offs |
| MIDI permissions | `sysex:false`, user gesture, handle `SecurityError` |

---

## Key Constraints (§1)

- **Platform:** Expo (one codebase); desktop web (Chrome) first, native iOS later
- **Connection:** USB-C class-compliant MIDI initially
- **Sequencing:** per-note granularity; lane = (track, note) pair with own Euclidean params
- **Note capture:** "Listen for note" button → captures incoming OP-XY pad press
- **Sound:** none in-browser; OP-XY is sole sound source; app is pure MIDI controller
- **MIDI abstraction:** identical interface across web and iOS; no platform-specific logic above the MIDI layer

---

## ⚠️ NEXT STEPS — TestFlight fixes (2026-07-24) — IMPORTANT, do these first

Real bugs from TestFlight testing of 1.2.0 (6). Both live in the Lane Editor;
fix them before cutting the next build (which also carries the already-committed
title-truncation fix b9cf360 and the in-progress LED work).

### 1. CRASH — Steps slider at minimum kills the app (crash-loop)

Verified native crash (TestFlight crash AAo2eIIfGzcb1BzuUv3xrh4): SwiftUI
`Slider.init` asserts in `Normalizing.init(min:max:stride:)` — an EMPTY RANGE.
Root cause: `src/app/lane-editor.tsx:139`

```ts
const maxRot = Math.max(0, lane.length - 1);
```

Drag Steps down to 1 → `maxRot = 0` → the three rotate sliders (Gen A/B
"Rotate", "Track rotate") render `min={0} max={0}` → `@expo/ui` Slider hands
SwiftUI `0...0` with step 1 → hard assert. Because `length: 1` is persisted,
reopening Edit Lane on that lane crashes again every time — a crash loop.

**Fix in `src/components/lane-editor/slider-row.tsx`** (one guard covers all
call sites, current and future):

```ts
const empty = max <= min;
<Slider
  minimumValue={min}
  maximumValue={empty ? min + step : max}  // never give SwiftUI an empty range
  disabled={empty}                          // prop exists on @expo/ui Slider
  ...
/>
```

Keep Steps min at 1 — a 1-step lane is fine once rotate sliders degrade to a
disabled thumb at 0 (nothing to rotate).

### 2. Velocity/Gate sliders — always visible, fix layout

TestFlight feedback (2 screenshots): the tap-to-toggle inline slider duplicates
the label+value readout ("Velocity127" mashed against the row above that
already reads "Velocity — 127"), and the slider should not toggle at all.

**Fix in the "More" section, `src/app/lane-editor.tsx:338-377`:** delete the
two `Pressable` toggle rows and the `expanded` state; render Velocity and Gate
each as ONE permanent cell containing a `SliderRow` (label left, value readout
right, slider beneath) — the exact layout the Generator sections already use
for Pulses/Rotate. Every continuous param in the editor becomes a visible
slider, consistently.

### 3. Title truncation — DONE, just needs to ship

"Four on…" truncating with free space is already fixed on main (`b9cf360`,
`patternTrigger: { flex: 1 }` in `header.tsx`). No action beyond the next build.

### 4. Header title sometimes floats toward center (side-effect of fix 3)

With `flex: 1` on the MenuView host, short/medium titles show a left gap:
SwiftUI centers the Menu label inside the host when the label is smaller
than the host (`@expo/ui` community MenuView wraps children in
`RNHostView matchContents` — the reported content size is just the title
row because `pattern` has `alignSelf: 'flex-start'`, and SwiftUI centers
the smaller view; RN's flex-start never wins). One-line fix in
`src/components/sequencer/header.tsx:83`:

```ts
pattern: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'stretch' },
```

`'stretch'` makes the label fill the host so SwiftUI has nothing to center;
text left-aligns via normal RN layout. Side effect (fine/good): the whole
strip left of the pill becomes the menu tap target. While in this file, also
add the pattern glyph chip to the header — see "Sequencer header chip" under
"Preset icon picker" below (28px chip left of the title, mocked on the
"01 · Sequencer" Paper board).

### 5. Preset library v2 shipped in code — follow-ups (2026-07-24)

`src/state/presets.ts` now has TEN new percussion-only presets (PRESETS_VERSION
bumped to 2, append-only seeding): Bembé, Bossa Nova, Dembow, Motorik,
Two-Step, Halftime, Shuffle, Aksak, Three Over Four, Samba. Every lane's
onsets were verified against `core/euclid.ts` (script: session scratchpad
`verify_presets.ts`). Notable recipes: dembow snare = `E(3,8) A>B E(1,8)`
(tresillo minus downbeat); bembé bell = `E(7,12) r7`; bossa clave =
`E(5,16) r10`; two-step kick = two single-pulse gens OR'd; halftime roll =
12-step lane at 1/32 resolution (36-tick polymeter). v1 presets de-tonalized:
Ambient Drift + Broken Machine's melodic lanes moved to kit percussion
(lowTom/triangle/chi/metal, ch 0); the two remaining ch-2 lanes are
single-pitch subs (note 36, renamed "Sub") — rhythmic on any patch.
TODO: audition all 15 presets on the OP-XY (velocities/gates especially the
1/8T lanes and the 1/32 roll); assign glyphs when `Pattern.icon` lands.

### 6. Icon picker — design simplified + MUST scroll (2026-07-24)

Paper designs updated: the Change-icon sheet lost its "Icon" header title and
pattern-name subtitle (now just Cancel/Done + the grid); the grid card lost
its ICON label row and the Shuffle affordance (creation still shuffles the
default silently). IMPLEMENTATION REQUIREMENT: the glyph grid is NOT
scrollable in the current design/mock and must be — 30 glyphs now, 6 per row
= 5 rows; the sheet shows 2. Make the grid a horizontally paged or vertically
scrollable region inside the sheet (the "swipe for more" hint stays).

### 7. Six new glyphs — extend the registry (2026-07-24)

"Preset icons — assortment" Row 5 adds: 25 bell, 26 motorik, 27 two-step,
28 aksak, 29 three-four, 30 samba (same language: greys + one #F6F4F4 pixel).
`presetGlyphs.ts` should ship all 30; hash fallback becomes `% 30`.
Preset→glyph mapping: bembé→bell · bossa→clave 3–2 · dembow→dembow ·
motorik→motorik · two-step→two-step · halftime→roll · shuffle→swing ·
aksak→aksak · three-over-four→three-four · samba→samba · house→four-on-floor.

---

## Backlog — future features (2026-07-24)

### Melodic sequencing (research, 2026-07-24)

Figure out how euxy can do melodic sequencing without giving up the
generative core. The presets are now deliberately tonality-free; melody
should arrive as a designed feature, not an accident. Directions to evaluate:

- **Note-per-step lane variant:** a lane gains a pitch sequence (scale-locked
  degree list) that the Euclidean hits index into — hit N plays degree N.
  The rhythm stays generative; pitch becomes a parallel loop (à la
  arpeggiator/SH-101 style). Rotation then shifts rhythm against melody.
- **Euclidean pitch walks:** map a second generator to pitch movement
  (e.g. up a degree on genB hits, reset on bar) — fully generative melody.
- **Scale/key as pattern-level setting** so all melodic lanes agree; OP-XY
  tracks are multi-timbral so a lane keeps targeting one track/channel.
- **Chord stabs:** one lane triggering fixed intervals (root+5th, triads) —
  cheapest melodic win, no per-step pitch data.

Constraints: keep the lane data model append-only (persisted patterns must
survive), keep randomize/mutate meaningful for pitch (lockable via the
Randomize lock modal), and keep the step-strip visualization honest (pitch
could ride the existing key-ramp fills).

### Pattern sharing via barcode

Share a pattern by generating a scannable code that encodes ALL of its
parameters (name, bpm, per-lane: length, genA/genB pulses+rotation, op,
trackRot, note, channel, velocity, gate, resolution). The full parameter set
is tiny (~30–60 bytes binary), so it fits comfortably in a QR code — and even
a Code-128-style 1D barcode is feasible for single lanes. Flow: Patterns →
share sheet renders the code (on-brand: dot-matrix QR echoes the app icon);
scanning (camera or photo import) imports the pattern. Encode as versioned
compact binary → base45/base64url, so codes stay dense and future fields can
be appended without breaking old codes. No server, no account — patterns
travel as pixels.

### Latency calibration

Today `latencyOffsetMs` is a manual slider. Candidate auto-calibration paths:

1. **MIDI round-trip (automatic):** enable the OP-XY's MIDI thru (or target an
   aux track that echoes), send a marker note, timestamp the echo's wire
   arrival (we already carry wire timestamps for BPM estimation), and set the
   offset to round-trip/2 minus native send latency. Repeat N times, take the
   median, discard outliers.
2. **Flam-null by ear (assisted):** play a steady metronome note from euxy and
   the same from the OP-XY's own sequencer at the same BPM; the user drags the
   offset until the flam disappears. Works even when thru is off — this is the
   Rocksmith/audio-engine calibration pattern adapted to MIDI.
3. **Record-loopback check:** in record mode, quantize-record one euxy lane
   into the OP-XY and read back where its notes landed relative to the grid
   (the device reports positions via recorded playback); the systematic bias
   IS the latency. Requires no user judgment, but needs a recording pass.

Ship 2 first (zero hardware assumptions), then 1 as "auto" where thru is
available.

### Manual step overrides

Let the user tap individual steps to force a hit ON or OFF on top of the
generated pattern (per-lane override mask: `forced: Set<step>`,
`suppressed: Set<step>` applied after the generator combine). The euclidean
engine stays the source of the groove; overrides are surgical exceptions —
add the one snare drag a track needs, or kill a collision, without giving up
generative editing. Overrides rotate with trackRot, clamp/clear when the lane
length changes, and randomize/mutate leaves them alone (they're deliberate).
UI: tap a step in the Lane Editor's combined card (add = forced light,
remove = dimmed slot); a "clear overrides" affordance appears when any exist.

### LED motion system (designs ready in Paper)

Bring the LED-grid language to life across the app. Designs live on the Paper
board **"LED motion — UI concepts"** (concepts A–I, storyboarded in frames),
plus **"Splash v2 — LED boot 1024"** (new splash asset) and
**"Preset icons — assortment"** (24 pixel-art preset chip glyphs).

**Motion principles (locked):**

1. LEDs attack instantly (0ms to light) and decay slowly (250–400ms
   ease-out) — never fade in.
2. Anything rhythmic is driven by the sequencer clock, not wall time — one
   column/cell per 16th, pulses on quarters.
3. Grey palette only: `#2C2C2E` rest · `#45454B` dim · `#6E6E76` trail ·
   `#AFAFB3` lit · `#F6F4F4` light. Brightness is the only channel that
   animates — no color (exception: REC red), no movement of cells.
4. Idle motion is rare and slow (one twinkle every few seconds); playing
   motion is dense and synced. Never both at once.
5. Reduced Motion: freeze to settled frames.

**The concepts:**

- **A · Pattern list now-playing sweep** — playhead column walks the playing
  pattern's chip glyph, one column per 16th, lit cells flash + decay.
- **B · Tab bar beat pulse** — Sequencer tab icon bars snap to light on each
  quarter, ease back over the beat. (Requires the custom JS tab bar — not
  animatable on a native tab bar.)
- **C · Splash LED type-on** — see Splash v2 below.
- **D · Empty-state idle twinkle** — placeholder grids breathe one random
  cell every few seconds; paused while playing and on blur.
- **E · Transport LED beat ticker** — 4-cell strip beside BPM walks beats
  1–4 with a trail fade; active cell blinks 8ths while recording.
- **F · MIDI searching sweep** — while disconnected, a light chases the grid
  perimeter with a 2-cell trail (radar); device found = ring flashes full
  twice (handshake), then settles.
- **G · MIDI disconnect dropout** — on disconnect the connection glyph loses
  cells in random order over ~400ms down to a single dim ember; reverse plays
  on reconnect. Pairs with the CONNECTED → OFFLINE badge swap.
- **H · Pressables: key travel + LED ack** — every button press-in: 80ms
  travel (scale 0.94, face one shade darker); release: spring back + one-shot
  thin light ring blooming out. Play/pause/stop/reset share it; reset adds a
  leftward light tick, stop a 150ms icon power-down.
- **I · JAM & REC armed states** — JAM breathes its border on a 2s cycle
  while on; REC armed blinks its dot at 8ths on the sequencer clock (the one
  red animation); disarm decays instead of cutting.
- **J · Randomize/Mutate reroll wash** — pressing Randomize sweeps a light
  curtain across the affected lane's step strip (~350ms); cells flicker under
  it and settle into the new pattern behind it (slot-machine reveal), wash
  fades out past the last column. Mutate skips the curtain — only nudged
  steps flicker-bloom in place. Undo replays the wash right-to-left.

**Splash v2 — LED boot:** replace the euclid-ring splash with the dim unlit
5×5 grid on near-black (asset in Paper). The app's first screen renders the
identical grid, hides the native splash (`expo-splash-screen`), types the
dot-matrix "e" on cell by cell (30ms stagger), then fades the UI in — one
continuous power-on with no visible handoff. Reversed on background.

**Implementation architecture (agreed):** everything derives from the
existing `playheadTick` / `playheadPlaying` shared values
(`src/core/playhead.ts`) on the UI thread — React never re-renders on the
tick. Quantize first (`useDerivedValue` → integer step/column/beat) so styles
re-run per musical event, not per frame; animate opacity/transform only;
stacked pre-lit layers or moving overlays instead of per-cell color animation
(the `step-strip.tsx` TravellingLight recipe); trails via `useAnimatedReaction`
→ `withTiming` (no JS round-trips); plain Views for animated cells (not
react-native-svg); mount live animation only where active (playing chip,
focused screen); state-machine animations (F/G/H/I) trigger off zustand
connection/press state, not the clock, except REC blink which reads the tick.
Build order: E → A → D → C, with B pending the tab-bar decision.
Verify with expo-observe frame metrics + zero-re-render check.

**Animation tech notes (evaluated 2026-07-24):**

- **react-native-ease** (AppAndFlow) — declarative one-shot animations that
  run entirely on Core Animation / Android Animator, zero JS during the
  animation. Candidate for the state-driven one-shots (H press/ack, JAM
  breathe, G dropout, splash type-on) where it removes UI-thread contention
  with the per-16th worklets. NOT for clock-synced concepts (A/B/E/REC
  blink) — those must read `playheadTick` per event, which is Reanimated
  territory. Needs new arch (we're on RN 0.86 ✓). Young library — spike on
  concept H first; adopt only if the API earns its place next to Reanimated.
- **Skia shaders (@shopify/react-native-skia)** — for effects Views can't
  do: real emissive LED bloom/glow (replacing iOS-only shadowRadius), the
  phosphor trail behind the playhead light, and the J reroll wash as a
  single RuntimeEffect (uniforms: progress + seed; soft curtain edge +
  per-cell flicker noise) drawn in one pass. Uniforms bind directly to
  Reanimated shared values, so the existing `playheadTick` stays the one
  clock and nothing re-renders. One Canvas per lane card (a 64-step lane
  becomes ONE native view instead of ~130). Costs: binary size, and web
  needs CanvasKit wasm (~2MB, deferred load) — fine for the Chrome-first
  target. Prototype: StepStrip glow + playhead trail behind a feature flag,
  measured with expo-observe before rollout.

### Preset icon picker (designs canonical in Paper)

Patterns get a chooseable pixel-art glyph. Canonical designs: **"Sheet ·
New Pattern"** (now includes an ICON group between Name and Tempo — 44px
chips, 6 per row, selected = 2px #F6F4F4 ring, "Shuffle" affordance in the
label row) and **"Sheet · Change icon"** (Cancel / Icon / Done + pattern-name
subtitle + the same grid). The 24 glyphs live on "Preset icons — assortment".

- **Creation:** new pattern defaults to a shuffled glyph (every pattern gets
  a distinct icon with zero effort); the grid lets you pick deliberately.
- **Editing:** two entry points — "Change Icon…" in the pattern-title menu
  (right after Rename) and long-press on a Patterns-list row (Rename /
  Change Icon / Delete context menu). Deliberately NOT tap-on-chip in the
  list (38px target beside the row's navigation tap = constant mis-taps).
- **Implementation:** static glyph registry (`presetGlyphs.ts`, 24 named
  5×5 bitmaps rendered as Views — animatable by the concept-A sweep later);
  `Pattern.icon: GlyphName` persisted field; existing patterns fall back to
  `hash(pattern.id) % 24` so old data gets stable icons without migration;
  one `IconPicker` component shared by both sheets.
- **Sequencer header chip (mocked on ALL sequencer boards 01/01b/01c/01d,
  2026-07-24):** the
  pattern's glyph also shows in the sequencer header, left of the title —
  28px chip, #2C2C2E, radius 7, 16px glyph (same 5×5 SVG, viewBox 22), 8px
  gap to the title (title↔chevron gap also 8). Identity continuity with the
  Patterns list, and it de-fangs title truncation. The chip lives INSIDE the
  pattern-menu trigger (one element, one behavior — tap opens the pattern
  menu; icon editing stays in the menu / long-press). Later: a subtle
  beat-synced pulse on this chip while playing (LedGrid, playheadTick-driven,
  static when stopped) is the cheapest "app is alive" signal on this screen.
  Board story: 01/01b/01c share "Four on the Floor" + four-on-floor glyph
  (same pattern, different states); 01d Empty shows "Untitled 04" + note
  glyph (a fresh pattern gets a shuffled glyph before it's even named).
  Also fixed on 01d: the floating action bar is REMOVED from the empty-state
  mock — the app already hides it when there are no lanes (index.tsx
  `lanes.length > 0` gate), the mock was just out of sync.

### Splash boot sequence (spec'd frame-by-frame in Paper)

Board **"Splash — boot sequence"** shows the five states: static splash PNG
(unlit grid) → rows 1–2 typed on (~150ms) → crossbar (~300ms) → "e" settled
(~450ms, holds 150ms) → UI fades in while the grid decays out (250ms); total
boot ≈ 850ms. Timing spec (on the board): cells light row-by-row left-to-
right, 14 cells × 30ms stagger, instant attack per cell; one progress shared
value drives everything (cell i lights when progress × 14 > i); backgrounding
plays the reverse at 2× speed; Reduced Motion skips straight to the
crossfade. The splash PNG and the app's first frame must be pixel-identical:
grid 276px wide, centered, 44px cells, radius 9, gap 14, #1A1A1F on #08080A.
Asset: "Splash v2 — LED boot 1024". Native change (splash swap) → needs a
build; the boot component itself is JS.

**Boot glyph = the SELECTED PATTERN'S icon (supersedes "random per launch",
2026-07-24):** the typed glyph is the icon of the pattern the app will open
on — read from persisted state before the boot animation starts (fall back
to a random glyph on first launch / missing icon). This costs nothing:
frame 0 (the splash PNG) is the unlit grid and therefore glyph-agnostic —
the PNG never changes, only the JS type-on target does. Backgrounding
reverses with the same glyph.

**Handoff into the header chip:** as the big grid decays out and the UI
fades in, the SAME glyph relights inside the sequencer-header chip with a
quick type-on (start the chip's type-on as the big grid starts decaying,
~150ms overlap). A RELIGHT, not a flight — no shared-element scale/translate;
LEDs don't move, they light up (motion principle: brightness is the only
animated channel). The boot animation thereby reads as the pattern's
identity arriving in its header slot. Both ends are the same `LedGrid`
primitive at different sizes.

**Generic glyph animator (the shared primitive):** one `LedGrid` component
renders any 5×5 bitmap from the glyph registry and animates it from a single
`progress` shared value plus a precomputed ORDER ARRAY — each cell derives
its state on the UI thread from `(progress, orderIndex)`. Every LED concept
is then just a mode = a different order array + palette mapping:

- `type-on` — row-major order (boot splash, concept C)
- `decay` — shuffled order, reversed (MIDI disconnect G; boot exit)
- `sweep` — order = column index (now-playing chip A)
- `chase` — order = perimeter ring walk (MIDI searching F)
- `twinkle` — order = shuffled, one cell at a time on a slow loop (empty
  states D)
- `blink` / `static` — trivial cases (REC dot, list chips)

Order arrays are plain precomputed number[25]s — no randomness in worklets
(seed picked JS-side). One implementation to test, and new animation ideas
become one-line order-array recipes.

### Randomize lock modal

Randomize currently re-rolls the rhythm wholesale. Add a modal (iOS form
sheet, matching the New Pattern sheet) opened from Randomize — or long-press
Randomize for instant re-roll with last settings — that lets the user LOCK
parameters before rolling: per-generator pulses / rotate, combine op, steps,
track rotate, note, velocity, gate, resolution. Locked params survive the
roll; unlocked ones re-roll. Lock set persists per lane (and shows a subtle
lock count on the Randomize row when non-default). CTA: "Roll" + a "roll
again" affordance that keeps the sheet open for rapid auditioning. Manual
step overrides (see below) are always left alone. Design the sheet in Paper
first — lock chips should read as the LED grid language (locked = lit cell).

### Light on/off micro-animation

The step LEDs currently snap between states. Add a subtle turn-on/turn-off
animation — a quick brightness bloom on ignition (~80–120ms ease-out, slight
glow-radius overshoot) and a softer decay when a light goes out (~150–250ms
fade, like a real LED's phosphor tail). Applies to: sequenced-step lights when
a pattern edit adds/removes them, the travelling playhead light entering a
step, and the M/S light bars. Reanimated on the UI thread; must stay
zero-re-render like the rest of the playhead path.

### Onboarding flow

First-run onboarding is currently nothing — the app drops you on the
Sequencer with a seeded pattern. Design a real flow: research onboarding
patterns from comparable apps (music tools, hardware companions, MIDI
utilities) using the Mobbin MCP (`search_flows` / `search_screens` for
"onboarding"), distill what fits euxy — likely candidates: a 2–3 screen
intro (what euxy is, connect your OP-XY, pick a preset to start from),
an inline "enable MIDI" moment tied to the permission gesture, and
progressive disclosure of Listen/mutate/record rather than a tutorial
dump. Then mock the chosen flow in Paper plus a couple of alternatives
(e.g. zero-screen "learn by doing" with coach marks vs. a device-first
pairing wizard) before implementing.

Guiding rule: the onboarding must explain everything in the app that is
NON-OBVIOUS. Current inventory of non-obvious things:

- Step fills are the OP-XY key ramp — position, not state; the LEDs
  alone show what's sequenced (and the travelling light is the playhead,
  going dark when it crosses a hit).
- Two generators per lane and what the combine ops mean (especially XOR:
  both generators hitting = silence); the attribution dots in the editor.
- Listen: play a note from the OP-XY aux track to set it — the channel
  you send on selects the track, and euxy echoes it back so you hear the
  target track; it stays engaged for browsing.
- Solo = everyone else muted (the M lights say so), and touching mute
  while soloing dissolves the solo into plain mutes.
- Jam vs Record clock modes (who is the clock master), count-in.
- Polymeter: lanes of different lengths drift apart and realign at the
  LCM — that's a feature, and the preset "Ambient Drift" shows it off.
- Mutate nudges ~60% of lanes one small step (KeyStep-style) with undo;
  Randomize re-rolls the rhythm only — note & track stay.
- Track · Channel maps a lane to an OP-XY track (channel n = track n).
- Panic lives on the MIDI tab.
