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

### 8. Splash → app handoff is not clean (Brent, on device 2026-07-24)

The native splash currently dismisses before our first view is actually
ready. Required sequence: keep the native splash up (expo-splash-screen
`preventAutoHideAsync`) until the sequencer view has RENDERED AND LAID OUT
(fire on the root view's onLayout + first commit — e.g. hide inside a
`runAfterInteractions`/`onLayout` gate, not on JS mount), THEN hide the
splash and run the boot animation. The rest of the app must already be
rendered BEHIND the boot overlay — the overlay is a full-screen layer over
the live UI, so when it decays out the app is simply there (this is also
what the pixel-identical frame-0 contract in "Splash boot sequence"
assumes). The post-dismiss animation can take ~500ms — it should look cool,
not fast: type-on of the selected pattern's glyph, hold, decay + header-chip
relight per the boot spec.

### 9. Sheet · New Pattern — header padding + name/icon affordances

- Header padding is insufficient (title row too close to the sheet edges) —
  match the Edit Lane sheet's header metrics.
- New pattern names should be RANDOMLY GENERATED (fun two-word style, e.g.
  "Velvet Tresillo" — build a small word bank; never "Untitled N"), with a
  CLEAR button (×) and a REGENERATE button (dice/refresh) inline in the name
  field row.
- The icon must be selectable in this sheet too — the ICON grid is already
  in the canonical Paper design; implement it with the shuffled default +
  scrollable grid (see item 6).

### 10. Tap BPM to edit tempo + base resolution

The BPM readout in the sequencer transport should be tappable: opens a small
sheet/popover editing BPM (stepper + slider or number pad) and BASE
RESOLUTION (the 1/4·1/8·1/16·1/32 segmented control from the New Pattern
sheet). Today those are only settable at creation. Keep the transport's
big-number readout as the trigger (hit target = the whole BPM block).

### 11. BUG — Patterns-list swipe actions vanish instead of revealing

On the Patterns list, swiping a row should reveal the swipe-action buttons
(then tap the one you want). Instead the swipe makes the row/menu DISAPPEAR
— the actions never become visible/selectable. Likely the swipeable is
executing the destructive full-swipe action immediately (or the row unmounts
on swipe). Fix: reveal actions on partial swipe, require an explicit tap
(or a deliberate full-swipe) to trigger; verify with the standard
SwipeableListItem/ReanimatedSwipeable reveal behavior.

### 12. Lane-row subtitle — drop the euclid params (Brent 2026-07-24)

Sequencer lane rows currently subtitle with `C1 · E(4,16) ⇥0 · 12 steps`.
The E(k,n)/rotation/steps notation is engine-speak and the step strip
already SHOWS the rhythm. New format: **note · Track N** (e.g.
`C1 · Track 1`, track = channel + 1) — the two facts you actually need when
scanning lanes. Paper boards 01/01b/01c already updated to the new format;
change `lane-row.tsx` to match. Euclid params remain visible in the Lane
Editor where they're editable.

---

## Backlog — future features (2026-07-24)

### Tab bar hide/show (ideas, 2026-07-24)

Reclaim the tab bar's vertical space while jamming. Candidate mechanisms:

1. **`minimizeBehavior="onScrollDown"`** on NativeTabs (iOS 26+, one prop):
   bar collapses to a compact pill on scroll — cheapest, fully native, but
   only helps on scrollable screens and isn't user-controllable.
2. **Toggle in the floating bar / function-key strip** (Brent's suggestion):
   a chevron/expand key that hides the tab bar (and maybe the transport
   grows). Explicit + discoverable; pairs naturally with floating-bar
   concept B or C. On NativeTabs, hiding = swapping to a hidden-bar
   appearance or moving off NativeTabs (see 4).
3. **Focus mode**: long-press play (or a JAM-mode side effect) hides tab bar
   + header chrome together; any edge swipe or tap on a revealed handle
   brings them back. Most immersive, least discoverable.
4. **Custom tab bar** (the standing concept-B decision): once the tab bar is
   ours, hide/show is trivial, it can be smaller than UIKit's, and it can
   carry the LED beat pulse. This item + "make the tab bar smaller" +
   concept B all point at the same fork: stay native vs own the bar —
   decide once.

Recommendation: prototype 1 immediately (one prop), and fold 2–4 into the
floating-bar + custom-tab-bar decision.

### Floating action bar rethink (concepts in Paper, 2026-07-24)

Brent: the current floating capsule (add · mutate · undo) "feels a bit off."
Four concepts on the Paper board "Floating bar — concepts":

- **A · Current** (reference): SF-symbol circles; generic-iOS, covers lane
  content on tall patterns, shuffle icon clashes with the Lane Editor's dice.
- **B · Docked function keys**: OP-XY-style labeled key strip (ADD · MUTATE ·
  UNDO) above the transport — never covers lanes, pairs with the concept-H
  key-travel press + LED ack dot.
- **C · Split**: "+ Add lane" returns as a ghost row after the last lane;
  floating shrinks to a single dice key; UNDO appears as a transient chip
  for ~5s after a mutate.
- **D · Transport-integrated**: dice + undo join the transport left of JAM;
  add lane is the ghost row; no floating layer at all.

**DECIDED (Brent, 2026-07-24): E — keep the capsule, make it ALIVE.** The
capsule beats the alternatives; the problem was staticness, not placement.
Full spec on the board ("E · CHOSEN" strip + gesture/animation card):

- **Dice roll** — mutate press: the 5 dice pips scatter to random cells over
  ~250ms (3–4 shuffled frames, instant attack each) and settle back with the
  light pixel landing last; concept J's reroll wash sweeps the lane grid
  FROM the capsule (origin-anchored) at the same moment. Dice glyph replaces
  the shuffle icon — one vocabulary with Lane Editor Randomize.
- **SNAPSHOT KEY — DECIDED (Brent 2026-07-24): tap = revert, long-press =
  keep.** First dice press snapshots the pattern silently (ONE deep copy in
  the store — no undo stack), then rolls; a third key with a GHOST dot
  (outline) appears in the capsule while a snapshot exists. TAP = revert:
  swaps live pattern ↔ snapshot. Because revert is a SWAP, a stray tap is
  never fatal — tap again to swap back. LONG-PRESS = keep: an LED ring fills
  clockwise around the key (~500ms, faint tick at each quarter); release
  early = ring drains back, nothing happens. Pattern switch/quit = keep
  whatever is live; dice press while engaged re-rolls the live side; manual
  edits ride the live side.
  **Resolution animations (both must be satisfying):** REVERT — key travel
  down, ghost dot fills solid for one beat, reverse reroll wash ripples the
  grid from the capsule outward (LEDs flip with phosphor decay trails), dot
  relaxes back to outline; light haptic. KEEP — on ring completion it POPS:
  bright ack flash, the ring's light drains into the dice key's light pixel,
  the key collapses and the capsule springs shut, and every sequenced LED on
  the grid does ONE synchronized soft pulse — the pattern is stamped;
  success haptic.
  (Evolution mocked on the board: 5s undo chip → temp key + revert/keep
  chips → A/B pill → this. "Ghost diff in the grid" survives as a
  display-only future companion: outline LEDs showing what revert would
  change.)
- **Key travel** (concept H) — every press: scale 0.96 + darken in,
  spring release + one-frame LED ack. The + rotates 90° while pressed and
  hands off to the existing lane slide-in.
- **Breathing while playing** — capsule dims to ~60% two beats after the
  last touch; the dice's light pixel ticks with the downbeat
  (playheadTick-derived). Touch re-lights instantly. Stopped = lit + still.
- **Gestures** — long-press dice: Randomize lock sheet. Drag: capsule lifts
  and snaps to bottom-left/right corners (user solves lane coverage;
  position persists). Flick down: tucks to a 12px LED sliver at the edge;
  tap/flick up restores (pairs with tab-bar hide/show focus mode — this
  could BE the tab-bar toggle surface).

Implementation: clock-synced bits derive from playheadTick on the UI thread;
one-shots (scatter, chip slide, travel) are state-driven — prime candidates
for the react-native-ease spike. Reduced Motion: travel + transient undo
only — no scatter, no breathing.

### Lane play modes — loop · once · every Nth (2026-07-24)

Per-lane playback behavior (applies in jam AND record mode; Brent's seed
idea was record-mode loop/play-once):

- `loop` — default, today's behavior.
- `once` — one full cycle from transport start, then silent. Re-arms on
  transport start; tap the lane to re-arm mid-play. Record-mode use case:
  punch a fill into the OP-XY in exactly one pass. Step strip dims a spent
  lane so the state is visible.
- `everyN` — play only every Nth cycle (+ phase offset, "cycle 3 of 4"):
  hardware-style fill lanes, call-and-response between lanes. Probably the
  most useful of the three for live jamming.

Implementation: pure function of the global tick — the engine already knows
the cycle number (`globalTick / (resolution × length)`), so this is a gate in
the scheduler, no timers. Data model append-only: `playMode?: 'loop' |
'once' | 'everyN'`, `everyN?: number`, absent = loop. UI: segmented row in
Lane Editor "More". Related-but-separate future idea: per-hit probability
(Elektron trig conditions) — different axis (which hits vs which cycles),
interacts with randomize locks, keep as its own item.

### Velocity/gate modulation — per-lane LFO (research, 2026-07-24)

Maybe-overkill flag from Brent: research before building. Instead of a fixed
velocity/gate per lane, an optional modulator: shape (sine · triangle ·
saw up/down · square · random S&H · drift) + a few params (rate synced to
lane cycles or bars, depth, phase). Why it fits: velocity and gate are
computed per-hit at schedule time, so an LFO is just another pure function
of the global tick — no timers, deterministic. Random shapes should use a
seeded hash of (lane, hit index) so a pattern always plays the same and
stays shareable/encodable later. Data model append-only: `velMod?` /
`gateMod?`, absent = fixed value (today). UI: expandable row under the
Velocity/Gate sliders in Lane Editor; mod params lockable in the Randomize
lock modal. Research questions: does the OP-XY respond audibly enough to
velocity on factory drum kits; is gate modulation musical on one-shot
samples (mostly note-off-insensitive) or only sustained patches; do 2 shapes
(sine + random) cover 90% of the value.

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
boot ≈ 900ms. Timing spec (UPDATED 2026-07-25): the type-on always completes
in a FIXED 500ms total — one cell (or a small group, pairs above ~14 lit
cells) per step, per-step interval = 500 / steps, so the rhythm adapts to the
glyph's density; instant attack per cell; one progress shared value drives
everything via a grouped order array; backgrounding plays the reverse at 2×
speed; Reduced Motion skips straight to the crossfade. IMPLEMENTED (wave2):
layout-gated native-splash hide (sequencer onLayout + 2s failsafe) and the
fixed-500ms adaptive type-on. The splash PNG and the app's first frame must be pixel-identical:
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

**RESEARCH DONE (2026-07-24): see `docs/design/onboarding-research.md`** —
Mobbin survey (hardware-companion + coach-mark apps; Mobbin has no pro
music apps, noted in the doc), teach-now-vs-defer table for the 9 concepts,
three flow candidates evaluated, and a recommendation: **hybrid — one
LedGrid welcome screen + coach-mark backbone with progressive one-shot
concept cards; the connect flow demoted to an on-demand sheet** (only
progressive disclosure covers all 9 concepts; the no-device reality kills a
mandatory wizard). Next step: the doc's 7-item Paper mock list.

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
