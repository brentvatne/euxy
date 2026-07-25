# Melodic sequencing research

Research for the "Melodic sequencing" item in `ROADMAP.md` (research, 2026-07-24):
how euxy does melody without giving up the generative core. Sources: WebSearch/
WebFetch survey of generative melodic sequencers, the official OP-XY guides, and
quantization practice in generative systems, July 2026. Code references:
`src/state/types.ts` (Lane), `src/core/euclid.ts`, `src/core/opxy.ts`.

## Summary

**Recommendation: a pattern-level Scale + a per-lane Pitch pool — an ordered list
of scale degrees that the lane's Euclidean hits index into (the SH-101/Torso T-1
model), stored as concrete degrees so playback stays a pure function of the
stored pattern.** Chord stabs ship alongside as a property of pool entries
(a degree can be a stack), not a separate mode. Pitch walks and play-time seeded
randomness are follow-ons that reuse the same fields. The MVP slice is: `scale`
on Pattern, `pitch` on Lane, a scale-filtered NotePads pool editor in a new Lane
Editor "Pitch" section, pool-aware Randomize/Mutate, and a "Pitch" chip in the
Randomize lock modal (default locked).

Two findings anchor everything:

1. **The OP-XY does not scale-correct incoming MIDI.** Its scale intelligence is
   the "Brain" aux track, which diatonically transposes *routed instrument
   tracks* ([TE guide: auxiliary](https://teenage.engineering/guides/op-xy/auxiliary),
   [Sound On Sound](https://www.soundonsound.com/reviews/teenage-engineering-op-xy));
   nothing in the docs or forums describes external notes being snapped to a key.
   euxy must own quantization and send raw note numbers.
2. **Every credible prior-art system routes generated pitch through a scale, and
   the strong ones are degree-native rather than snap-after.** Storing melody as
   scale-degree indices (the Strudel `n` + `.scale()` model —
   [strudel.cc/understand/pitch](https://strudel.cc/understand/pitch/)) makes key
   and scale changes pure re-interpretation — no re-quantization ambiguity, and
   tiny to encode for pattern sharing.

## What melodic sequencing must respect (from the codebase)

| Constraint | Where it lives | Consequence for pitch |
|---|---|---|
| Determinism: pattern = pure function of stored params + global tick | `euclid.ts` (rotation at read time, polymeter derived), ROADMAP velocity-LFO section (seeded hash of (lane, hit index)) | No free-running randomness. Pitch is either stored data or `hash(seed, position)` |
| Append-only Lane model | `types.ts` header, persisted patterns must survive | New fields optional; absent = today's single-note behavior |
| Presets deliberately tonality-free | `presets.ts` ("NO preset depends on tonality, 2026-07-24") | Melody arrives as a designed feature; presets change only by explicit decision |
| Randomize/mutate must stay meaningful | `store.ts` `randomizeLane` (never touches note), Randomize lock modal (Note locked by default) | Pitch params need lock chips; rolls must produce musical results, not chromatic noise |
| Step strip stays honest | ROADMAP ("pitch could ride the existing key-ramp fills") | Whatever pitch shows must not lie about what plays |
| Sharing: versioned compact binary | ROADMAP "Pattern sharing via barcode" | Pitch fields must encode in a few bytes and never depend on unstable ids |

## OP-XY ground truth (external MIDI)

What the survey established, flagged confirmed vs needs-hardware:

- **Channel mapping — mostly confirmed.** 8-part multitimbral; tracks receive on
  separate channels (track n = channel n is the working model, matching euxy's
  `channel + 1` display) — corroborated by users driving all tracks from a DAW
  ([op-forums CC list thread](https://op-forums.com/t/op-xy-full-midi-cc-list/28939));
  CC 102 maps values 8–15 to aux tracks, implying aux on channels 9–16
  ([TE MIDI reference](https://teenage.engineering/guides/op-xy/midi-references)).
  **Hazard:** the "active track channel" (COM → M1) routes a chosen channel to
  whatever track is selected ([TE guide: com](https://teenage.engineering/guides/op-xy/com)) —
  a collision with euxy's per-lane channels mis-routes notes.
- **Polyphony — confirmed.** 24 voices dynamically allocated, ~8 per track;
  presets have poly/mono/legato play modes; external chords play as chords in
  poly mode ([SOS review](https://www.soundonsound.com/reviews/teenage-engineering-op-xy),
  [TE guide: how to](https://teenage.engineering/guides/op-xy/how-to)). Chord
  stabs from euxy are viable.
- **No scale quantization of incoming notes — inferred, needs hardware test.**
  Brain transposes routed tracks; whether that applies to *live incoming MIDI*
  (vs only sequenced steps) is unknown. If it does, euxy-quantized notes on a
  Brain-routed track get double-transposed. The safe design assumes raw
  pass-through and documents the Brain caveat.
- **Velocity & pitch bend — confirmed.** Engines are velocity-sensitive; bend/
  mod/aftertouch are assignable mod sources with per-preset bend range
  ([TE guide: instrument](https://teenage.engineering/guides/op-xy/instrument)).
  Note: the COM devices view can disable notes/velocity per device — a
  troubleshooting-checklist item for the connect sheet.
- **Drum vs synth tracks.** Drum tracks map note numbers to slots (the F2-anchored
  map already in `core/opxy.ts`, per [opxy-drum-tool](https://buba447.github.io/opxy-drum-tool/));
  synth tracks pitch normally. A lane only becomes melodic by user intent, so no
  auto-detection needed — but the Pitch section should hint when the lane's note
  sits in the drum-kit range.

## Prior-art survey

| System | Generates | User controls | Deterministic? | Maps to euxy |
|---|---|---|---|---|
| [Torso T-1](https://docs.torsoelectronics.com/t1/core-concepts/pitch-chords/generating-melodies/) | Euclidean rhythm; pitch = note pool walked by fixed "phrase" shapes | Note pool, scale/root, voicing, range, phrase | Yes (random is opt-in, loopable) | **The** template: pool indexed by euclidean hits; 2–4 note pools recommended |
| [Marbles](https://pichenettes.github.io/mutable-instruments-documentation/modules/marbles/manual/) | Random voltages → progressive quantizer | Spread/bias; STEPS = one knob from chromatic → chord tones → octaves; DEJA VU loop lock | Loop-buffer (stateful), not seeded | The one-knob "gravity" macro for weighting; avoid its stateful loop model |
| [Metropolix](https://intellijel.com/downloads/manuals/metropolix_manual_v1.4_2022.04.04.pdf) | 8 pitch stages, scale-quantized; accumulator transposes per cycle | Stage sliders, scale/root, accum amount + wrap, order, prob | Yes except prob | Accumulator = the "pitch walk" candidate; degree-space arithmetic |
| [Hapax](https://squarp.net/hapax/manual/modefx/) | FX chain over notes: ARP, harmonizer (fixed intervals → chords), scaler, random | FX order, per-FX params | Random is free-running, unseeded | Harmonizer = chord stabs as interval offsets; scaler-last ordering |
| [Polyend Play](https://polyend.com/manuals/play/) | Per-step chance + random-note actions through a global scale filter | Chance %, actions, scale filter | No (re-rolled per pass) | Global scale filter = pattern-level scale; its non-determinism is the anti-goal |
| [Elektron](https://www.elektron.se/wp-content/uploads/2024/09/Digitone_User_Manual_ENG_OS1.41_231108.pdf) | Nothing — p-locked notes + trig conditions vary *when*, not *which* | Per-step note locks, A:B conditions, prob | Yes except prob | Confirms euxy's manual-step-overrides item is a separate axis; not the melodic engine |
| [OP-Z/OP-XY step components](https://teenage.engineering/guides/op-xy/step-components) | Per-step Random (in scale), Ramp (scale-aware accumulator), Tonality (diatonic transpose) | Component per step, range, every-N-bars | Ramp yes; Random free-running | The device's own vocabulary: scale-aware ramps and in-scale random — euxy should rhyme with it |
| [Ableton Live 12](https://www.ableton.com/en/live-manual/12/midi-tools/) | Seed (random in range, scale-aware), Shape (notes along a curve), Stacks (chords by degree) | Range, density, curve, scale awareness | Generate-then-freeze | "Bake the roll into stored notes" — exactly the roll-time-randomness model |
| [SH-101](https://rolandcorp.com.au/blog/roland-icon-series-sh-101-synthesizer) | Stored note list clocked by external trigger; live transpose | Step-recorded notes, clock source | Fully | Pool decoupled from rhythm; pool length ≠ hit count → phrases longer than the bar |
| Euclid→S&H patches ([Perfect Circuit primer](https://www.perfectcircuit.com/signal/learning-synthesis-quantizers)) | Euclidean gates sample a random/LFO source into a quantizer | Density, source, scale | No | The "second euclid layer drives pitch" folk recipe — candidate B/C territory |

(`o-o-o` could not be verified as a real product — TE's catalog is OP-Z/OP-XY/PO;
skipped.)

**Four recurring pitch models** fall out of the survey:

1. **Degree list indexed by hit** (T-1, SH-101, arps, Live Shape) — pitch loop
   decoupled from rhythm loop.
2. **Accumulator/walk** (Metropolix ACCUM, OP-XY Ramp) — deterministic rising/
   falling lines, reset on cycle.
3. **Random with reproducibility** — either loop-lock (Marbles, stateful) or
   position-hashed (Tidal/Strudel `rand` is a pure function of logical time —
   [tidalcycles.org/docs/reference/randomness](https://tidalcycles.org/docs/reference/randomness/) —
   the only model compatible with euxy's determinism).
4. **Fixed pitches + conditional firing** (Elektron) — orthogonal to euxy's
   generative rhythm; covered by the existing trig-condition roadmap idea.

## Design candidates

All candidates share one prerequisite: **Scale as a pattern-level setting**
(ROADMAP's third seed direction), so melodic lanes agree and the OP-XY's own
scale-aware features can match. Proposed:

```ts
// Pattern (append-only)
scale?: { root: number /* 0–11, 0 = C */; intervals: number[] /* e.g. [0,2,4,5,7,9,11] */ };
```

Named scale presets (major, minor, dorian, pentatonic maj/min, harmonic minor,
whole tone, chromatic) resolve to interval arrays at pick time; the stored form
is the array, so sharing never depends on a name table. Absent = no scale (today).

### A. Pitch pool — degrees indexed by hits (recommended)

A lane gains an ordered pool of scale degrees; hit *n* of the lane plays
`pool[n % pool.length]`, where *n* is the running hit count derived from the
combined pattern — pure function of the global tick (count hits per cycle ×
completed cycles + hits so far, all derivable from `euclid.ts` outputs).

```ts
// Lane (append-only)
pitch?: {
  degrees: number[];      // scale-degree offsets from `note` (can exceed 7 = next octave)
  perCycle: boolean;      // true = index resets each lane cycle; false = free-running (SH-101)
};
```

- `note` stays the root; degrees offset diatonically from it. No scale on the
  pattern → degrees read as semitones (chromatic), still deterministic.
- **Free-running is the sleeper feature:** a 3-degree pool against a 5-hit lane
  phrases over 3 cycles — melodic polymeter matching euxy's rhythm-side identity.
- **Rotation** (genA/genB/trackRot) re-times hits, and since the hit index is
  counted off the rotated pattern, rotation shifts rhythm against melody —
  exactly the interaction the ROADMAP seed wanted.
- **Randomize:** re-roll pool degrees (length 2–5, biased to chord tones —
  Live-Seed-style *roll-time* randomness, result stored, so determinism is free).
  **Mutate:** one small step = transpose one pool entry ±1 degree, or rotate the
  pool by one — stays "recognizably related" (the KeyStep model).
- **UI:** new "Pitch" section in the Lane Editor between Sound and More. Off by
  default (single-note lane); "Add melody" affordance expands it: scale-filtered
  NotePads (out-of-scale pads dimmed to the sharps' darker shade), tapping
  appends to the pool; pool chips (degree name + remove) in a horizontal row;
  a per-cycle/free segmented; pads preview via `sendTestNote` as today.

### B. Pitch walk — generator-driven accumulator

Fully generative melody: genB (or a third virtual generator) stops gating rhythm
and instead *moves pitch* — each genB hit steps an accumulator ±1 degree, bounded
by a range, reset every N cycles (Metropolix ACCUM / OP-XY Ramp).

```ts
pitchWalk?: { stepDegrees: 1 | -1 | 2 | -2; range: number; resetCycles: number };
```

- Accumulator value at tick T = (signed count of walk-generator hits since last
  reset) clamped/folded — derivable without history, so deterministic.
- Musically strong (walks beat uniform random — the Brownian-vs-white-noise
  result, [rangakrish.com random-walk piece](https://www.rangakrish.com/index.php/2020/10/24/using-random-walk-principle-to-generate-music/)),
  but it *spends* genB: the lane loses dual-generator rhythm to gain melody, or
  the model grows a third generator (bigger UI + encoding surface).
- Verdict: great follow-on, wrong first move — it complicates the lane's core
  identity while A leaves it untouched.

### C. Seeded random-in-scale with a gravity macro

Play-time randomness done the Tidal way: `degree = hash(seed, laneIndex,
hitIndex) → weighted pick`, with one "gravity" macro sweeping chromatic →
diatonic → chord tones → root/5th (Marbles' STEPS knob as a slider).

```ts
pitchRand?: { seed: number; range: number /* degrees */; gravity: number /* 0–1 */ };
```

- Same seeded-hash mechanism the velocity/gate-LFO item already commits to;
  hash on **lane index, not lane id** (ids regenerate on import — hashing them
  would break share-exactness).
- Infinite non-repeating melody conflicts with euxy's "pattern = artifact you
  keep and share" framing less than it seems (the seed is stored), but it's
  harder to *see* on the step strip and harder to lock/mutate meaningfully.
- Verdict: ship after A, as a "roll forever" alternative pool source; the gravity
  macro is worth keeping regardless as the bias for A's roll-time randomize.

### D. Chord stabs

Cheapest melodic win: a hit plays a stack of intervals over `note`.

```ts
chord?: number[]; // degree offsets when scale set, semitones otherwise; e.g. [0,4,7]
```

- OP-XY polyphony confirmed (24 voices, poly presets) — 3-note stabs at 16th
  density are fine on paper; voice-stealing on mono/legato presets needs the
  hardware pass.
- **Better folded into A than shipped alone:** if a pool *entry* can be a stack
  (`degrees: (number | number[])[]`), stabs are one pool of length 1, and
  alternating chords are just a pool of stacks — one mental model, one encoder.
  UI: long-press a pool chip → interval picker (root+5th, triad, sus, octave).

## Interaction with existing features

- **Presets.** Stay tonality-free at ship (no forced migration, no accidental
  melody). Then a `PRESETS_VERSION` 3 append adds 2–3 melodic presets designed
  around the feature (e.g. a pentatonic free-running pool over "Ambient Drift"
  bones) — melody "arrives as a designed feature," per the ROADMAP's intent.
- **Randomize lock modal.** Add one "Pitch" chip (12th chip, 3-per-row grid gains
  a fourth row slot), **default locked** — consistent with the designed default
  set (Note · Velocity · Gate · Resolution locked; randomize never touches sound
  uninvited). Unlocked, a roll re-rolls pool degrees/length but never the
  pattern-level scale — scale is the user's harmonic contract, like BPM.
- **Mutate.** Pool-bearing lanes add pool nudges to `nudgeLane`'s move set (one
  entry ±1 degree / rotate pool by 1), same undo stack, same ~60% coverage.
- **Sharing/encoding.** Scale = 1 byte root + 12-bit interval mask; pool =
  length nibble + 4–6 bits per degree; walk/rand = a few bytes of params + seed.
  All appended to the versioned binary; old codes decode with pitch absent.
  Determinism holds because pools are stored data and any play-time randomness
  is position-hashed off a stored seed and lane *index*.
- **Record mode.** No engine change — melodic lanes emit notes the same way, so
  record mode gets more valuable for free: print a generated melody into the
  OP-XY's own sequencer in one pass ("once" play mode pairs perfectly).
- **Step strip / Lane Editor honesty.** Pitch rides the key-ramp fills: fill
  height = current pool degree within the lane's degree span. Caveat: fills
  currently mean *position* (an onboarding-inventory concept) — re-purposing
  height on melodic lanes only, with rhythm lanes unchanged, keeps the two
  readable but must be an explicit design decision in Paper, not a drive-by.
- **Listen flow.** Orthogonal (targets track/channel, not pitch) — but Listen's
  echo-back could later seed `note` + octave window from the played note.

## Recommendation

**Ship A on top of pattern-level Scale, with D folded in as stack-entries; keep
B and C as designed follow-ons reusing the same fields.** Rationale:

1. A is the model the strongest melodic-generative hardware converged on (T-1's
   pool-plus-phrase, the SH-101 lineage), and it keeps euxy's division of labor
   clean: rhythm stays generative, pitch becomes a small, visible, editable loop.
2. It is deterministic *by construction* — no seeds needed in v1, because
   randomness happens at roll time and the result is stored (the Live 12 Seed
   "generate-then-freeze" model), which also makes the lock modal and mutate
   semantics obvious.
3. Rotation-against-melody and free-running pool polymeter fall out of the
   existing engine for free — they're the features that make this *euxy's*
   melodic sequencer rather than a bolted-on arp.
4. The append-only deltas are tiny (`scale` on Pattern, `pitch` + optional
   stacks on Lane) and encode in single-digit bytes for the barcode item.

**MVP slice (ships first):**

1. `scale` on Pattern + picker in the New Pattern sheet and pattern header menu.
2. `pitch.degrees` + `perCycle` on Lane; engine maps hit index → degree → note.
3. Lane Editor "Pitch" section: scale-filtered NotePads pool editor, pool chips,
   per-cycle/free toggle.
4. Randomize lock modal "Pitch" chip (default locked); pool-aware
   randomize/mutate.
5. Step-strip fill = degree height on melodic lanes.

Deferred: chord stacks (D) next, walk (B) and seeded gravity random (C) after —
each a pure append to the same model.

## Open questions for Brent (need OP-XY hardware)

1. **Brain vs live MIDI:** route an instrument track to the Brain aux, send
   external notes — are they diatonically transposed? (Decides whether euxy
   warns about Brain routing on melodic lanes.)
2. **Active track channel collision:** with euxy on channels 1–8, does the
   active-track-channel setting hijack any of them in practice?
3. **Poly/mono reality:** 3-note stabs at 16th-note density on factory synth
   presets — clean chords, or voice stealing/legato surprises per play mode?
4. **Gate on sustained patches:** is `gateMs` (tuned for drums) musical on pads/
   keys, or does melodic sequencing force per-lane gate rethink (ties into the
   velocity/gate-LFO research)?
5. **Scale mismatch UX:** if the OP-XY project is set to a key (device-side
   display/keyboard) and euxy's scale differs, is the confusion bad enough to
   warrant a "match device scale" hint anywhere?
6. **Pitch-bend slides:** bend range is per-preset — is a KeyStep/101-style slide
   (bend between pool degrees) feasible and worth a future `slide` flag?

## What to mock in Paper

1. **Lane Editor "Pitch" section** — collapsed ("Add melody") and expanded:
   scale-filtered NotePads (dimmed out-of-scale pads), pool chip row with
   degree labels, per-cycle/free segmented, drum-kit-range hint state.
2. **Scale picker** — New Pattern sheet row + the pattern-menu variant; stored-
   array model means the picker is presets-plus-custom-mask (12 toggle cells —
   naturally the LED grid language).
3. **Step-strip melodic fills** — one lane rhythm-only next to one melodic lane,
   validating that position-fills and degree-fills coexist readably.
4. **Randomize lock modal** — the 12th "Pitch" chip added to the designed sheet.
5. **Pool chip with a chord stack** — the long-press interval picker (root+5th,
   triad, sus4, octave) for the D follow-on.
