# Onboarding research

Research for the first-run onboarding flow described in `ROADMAP.md` ("Onboarding
flow"). Sources: Mobbin MCP (`search_flows` / `search_screens`, iOS), July 2026.

**Coverage note:** Mobbin has essentially no pro music-making apps — no Koala,
Endlesss, GarageBand, Moog, or Teenage Engineering apps. Its music coverage is
AI-music consumer apps (Suno, ElevenLabs, Duolingo Music). The most transferable
patterns instead came from **hardware-companion apps** (WHOOP, Spotify Car Thing,
Meta AI glasses, Solflare/Ledger, Tonal) and **coach-mark/interactive-tutorial
apps** (monday.com, My BMW, Craft, Arc Search). No WebSearch fallback was needed —
the hardware-companion corpus answered the core questions.

## What the onboarding must accomplish

The ROADMAP inventory of non-obvious concepts, sorted by when they should be taught:

| Concept | Teach when |
|---|---|
| Key-ramp fills = position, LEDs = what's sequenced, travelling light = playhead | First sight of the grid (minute one) |
| Track · Channel maps a lane to an OP-XY track | First connect / first lane edit |
| Jam vs Record clock modes, count-in | First press of play with a device connected |
| Dual generators + combine ops (XOR = both hitting → silence), attribution dots | First time opening the Lane Editor |
| Listen flow (aux-track note sets the target; channel selects track; echo-back; stays engaged) | First time tapping Listen |
| Solo = everyone else muted (M lights say so); mute during solo dissolves solo into mutes | First long-press/solo gesture |
| Mutate (~60% of lanes, one small step, undo) vs Randomize (rhythm only) | First tap of either |
| Polymeter drift/realign at LCM ("Ambient Drift" preset demos it) | Preset picker / first uneven lane length |
| Panic lives on the MIDI tab | MIDI tab first visit; connection troubleshooting |

Two structural implications, before any pattern research:

- **This is too much for an intro carousel.** Nine concepts, most of them only
  meaningful in context (XOR means nothing until you're in the Lane Editor).
  Whatever the flow, most of the inventory must be deferred to point-of-use.
- **Many users will first open the app away from their OP-XY.** The flow cannot
  gate on a connection, and the app must be fully explorable (and fun) unplugged.

## Pattern survey (Mobbin findings)

### Hardware-companion pairing flows

**WHOOP — Onboarding** ([flow](https://mobbin.com/flows/06390f2f-8598-4b94-88f5-0bcb7b65ece4), 15 screens)
- Dark, near-monochrome aesthetic — the closest visual cousin to euxy in the corpus.
- Explicitly designs for **device-not-present**: a "Your 4.0 is on the way!" screen
  offers educational articles ("WHOOP basics") *in the meantime*, with "Pair" as a
  button you press when ready — pairing is an exit ramp, not a gate.
- "Searching for strap…" screen shows a hero photo of the hardware with the serial
  number location annotated; success is a phone→green-check→device diagram
  ("WHOOP 4C0521039 CONNECTED"). Progress dots across the whole run.
- **Steal:** the "device on its way" branch; the connected-confirmation moment as a
  celebration. **Avoid:** 15 screens; account-creation ceremony euxy doesn't need.

**Spotify — Set up Car Thing** ([flow](https://mobbin.com/flows/bb40785b-d4ae-49da-80da-4d3184c67fac), 4 screens)
- Hero shot of the device + "Begin Setup", then a **numbered manual-steps screen**
  ("1. Open iPhone settings… 2. Choose Car Thing… 3. Return to the Spotify app")
  with inline mini-mockups of each system UI row.
- **Steal:** the numbered physical-steps card style — euxy needs exactly this for
  "plug USB-C into OP-XY → set OP-XY MIDI settings → euxy sees it". Physical-world
  instructions with tiny pictures of what you'll see beat prose.

**Meta AI — Setting up a Meta device** ([flow](https://mobbin.com/flows/d96cdd61-06ec-4785-a4d4-811e64e52e10), 12 screens)
- After "Paired!", a paged card series (1/6…) teaches **each physical control**:
  "Press the capture button once", with a close-up render and — notably — an
  explanation of **what the hardware LED means** ("The LED shows others when you're
  taking photos"). Ends with "Explore how you can use…" + Skip.
- **Steal:** the strongest precedent for teaching LED semantics one card at a time.
  euxy's playhead/M-S-light/key-ramp explanations fit this shape exactly, using the
  app's own LedGrid instead of product renders.

**Solflare — Connect Ledger** ([flow](https://mobbin.com/flows/4e0d598d-e87b-4986-b39b-7d5853daf78b), 4 screens)
- A dark "Select Ledger Device" scan screen with one persistent lifeline:
  **"Don't see your device?"** opens a sheet with a 6-item troubleshooting
  checklist (unlocked? app installed? Bluetooth on? in range?…).
- **Steal:** the single always-visible escape hatch on the connect screen, backed by
  a checklist sheet (euxy's version: cable is data-capable? OP-XY MIDI out enabled?
  correct channel? … plus Panic's location).

**Tonal — "Tonal Not Found"** ([screen](https://mobbin.com/screens/ea593c8a-c8d0-4f0e-b103-f59537038a8c))
- Dark full-screen not-found state: plain-language checklist prose + one
  "SEARCH AGAIN" action. Calm, not alarmist.
- **Steal:** tone. Not-found is a normal state, not an error.

### Coach marks and interactive tutorials

**monday.com — Browsing tutorial** ([flow](https://mobbin.com/flows/d35a64a4-8d5e-41f8-8656-c881c7b0b923), 6 screens)
- Seeds a "first board" with placeholder data, then a **3-step tooltip tour**
  ("2 of 3", Next, ×) pointing at real UI. Also keeps a persistent
  "Finish setting up — 33% completed" checklist card on Home.
- **Steal:** short numbered tooltip chains over *seeded content* (euxy already seeds
  a pattern — perfect substrate). The setup-checklist card is a good model for a
  "Connect your OP-XY" persistent nudge that survives skipping.

**My BMW — Tutorials** ([flow](https://mobbin.com/flows/c329076f-a46e-4ec7-9078-eda8f57a4e82))
- A **Tutorials hub** (list of restartable walkthroughs with per-item progress) plus
  a 6-step coach-mark tour ("2 of 6", Back/Next) that walks across tabs; final mark
  points back at the Tutorials section itself.
- **Steal:** replayability — every tour restartable from a help surface. euxy
  equivalent: a "Guide" list on the MIDI (or settings) tab so nothing is
  once-and-gone. **Avoid:** their tours are verbose paragraphs.

**Craft — Get started** ([flow](https://mobbin.com/flows/2d73c8ed-64a5-409f-b368-0ce4e52d3ae9), 11 screens)
- **Do-it-yourself tutorial**: the tutorial content is live UI — "Long press, and
  move me to the top", "Swipe ← or → on me, and change my style" — you perform the
  real gesture on real objects to advance. Skip/Reset always visible. Also ships a
  pre-seeded "Getting Started" doc in the user's space.
- **Steal:** the gold standard for teaching *gestures* (euxy: paint steps on the
  strip, long-press for solo, tap Mutate then Undo). Teaching-by-doing beats
  describing, and it inherently respects the "no device needed" constraint —
  everything is rehearsable silently.

**Arc Search — Onboarding** ([flow](https://mobbin.com/flows/4260d248-66f7-4b8a-952e-81446a19bbd6), 13 screens)
- Value-prop screens each contain a **live miniature demo** ("Try it!" arrow into a
  working search field inside a phone mock) rather than static art; Skip on every
  screen.
- **Steal:** intro screens whose illustration *is* a functioning widget — an intro
  card could contain a real, running 16-step LedGrid you can poke.

### Permission priming

**Viator — location permission** ([flow](https://mobbin.com/flows/247308cf-b335-49b7-9644-bb99eabc7217), 3 screens)
- Custom sheet appears at the moment of intent (tapping "Nearby"): explains the
  benefit, previews the exact system rows you'll see, then "Turn on location
  permission" / "No, thanks" — only after opt-in does the system dialog fire.
- **euxy relevance:** USB-C Core MIDI on iOS needs no runtime permission dialog, so
  classic priming mostly doesn't apply. It *does* apply if/when euxy adds Bluetooth
  MIDI (Bluetooth permission) or network MIDI (Local Network prompt). Same
  pattern regardless: prime on the gesture ("Enable MIDI"-style moment per
  ROADMAP), never at cold launch.

### Empty states as onboarding

- **NordVPN "Link your other devices"** ([screen](https://mobbin.com/screens/f7a291b9-425e-47fe-bde6-692e0e47bde0)) and
  **Superpower "Connect your wearables"** ([screen](https://mobbin.com/screens/4a9ddf72-cb16-49c9-98be-6b05401e038d)):
  the empty state itself carries the instructions + a single CTA with device imagery.
- **Duolingo Music — Live Piano Mode** ([flow](https://mobbin.com/flows/f801f2b5-a4e3-4529-82ea-615237d3de52)):
  the one music-app hardware moment on Mobbin — "You'll need a real piano to use
  this mode" as a friendly, illustrated gate on *that mode only*; the rest of the
  app works without hardware. Exactly euxy's situation: sequencing works dry,
  *sound* needs the OP-XY.
- **Raycast — welcome** ([flow](https://mobbin.com/flows/1c30eb52-9997-4a33-a50d-05dc3e7a8f09)):
  pure-black welcome screen, glowing app icon, two buttons. Aesthetic proof that a
  dark, minimal, logo-led welcome reads as premium — euxy's euclid-ring splash
  already does this.

### Cross-cutting lessons

- **Nobody good teaches everything up front.** The strong flows split into: short
  identity moment → connect (skippable) → contextual, point-of-use teaching.
- **Connection is an exit ramp, never a gate** (WHOOP, Duolingo Music).
- **Physical steps get numbered cards with pictures** (Car Thing, Solflare).
- **Gestures get performed, not described** (Craft).
- **Every tour must be skippable and replayable** (My BMW hub, Craft Reset,
  Arc Skip). One-shot onboarding punishes the "just let me poke around" user —
  which is most synth owners.
- **LED/hardware semantics precedent exists** (Meta glasses) and it's one card per
  light, with the light shown live.

## Three flow candidates for euxy

### A. Minimal intro — 3 screens

1. **What euxy is.** Black screen, live LedGrid glyph animation (reuse the
   euclid-ring splash motif morphing into a playing 16-step ring/strip). One line:
   "Euclidean rhythms for your OP-XY." The travelling playhead light is *running*
   on this screen — the playhead concept gets taught by ambient demonstration.
   CTA: Continue. Skip in the corner.
2. **Connect your OP-XY.** Car-Thing-style numbered card (plug USB-C → what to
   check on the OP-XY → "euxy is listening"). Live connection status LED that
   flips to lit if the device appears mid-screen (WHOOP's confirmation moment).
   Buttons: "Connected — let's go" (auto-highlights on detect) and
   **"I'm not near my OP-XY"** — equal visual weight, per the no-device reality.
   One line under the fold: "Sequencing works without it; you'll need it to hear
   sound. Lane n plays OP-XY track n." (plants track·channel early, cheaply).
3. **Pick a preset.** List seeded patterns ("Four on the Floor", "Ambient Drift" —
   tagged "polymeter: lanes drift & realign"…), each row with a micro LedGrid
   preview animating its rhythm. Selecting drops you on the Sequencer, playing
   (Jam mode) if connected, silent-scrolling playhead if not.

- **vs inventory:** teaches playhead (ambiently), track·channel (one line),
  polymeter (preset tag) — 3 of 9. Everything else untouched; needs contextual
  tips anyway or Listen/XOR/solo semantics stay dark.
- **vs no-device:** good — screen 2 is explicitly two-exit.
- **vs aesthetic:** excellent; every screen is LedGrid-native, Raycast-dark.

### B. Zero-screen "learn by doing" — coach marks + progressive disclosure

No modal flow at all. First run lands on the seeded pattern (as today) plus:

1. **First-land tooltip chain (3 marks max, monday.com-style):** ① "These LEDs are
   the rhythm — the moving light is the playhead" (pointing at the strip);
   ② "Fills are the OP-XY key ramp: position, not on/off" (pointing at a fill);
   ③ "Play runs in Jam mode — euxy is the clock" (pointing at transport). Dismiss
   any time; ×.
2. **Persistent "Connect OP-XY" LED-chip** in the header (monday.com checklist
   nudge): dim until a device is detected, tap opens the connect/troubleshoot sheet
   (Solflare checklist; mentions Panic on the MIDI tab). Disappears after first
   successful connect.
3. **One-shot contextual cards, each fired on first use** (Meta-glasses one-card-
   per-concept, Craft do-it style where a gesture is involved):
   - open Lane Editor → dual-generator/XOR card with a live two-ring demo and the
     attribution dots called out ("both generators hit = silence");
   - tap Listen → "play a note on the aux track; its channel picks the track;
     euxy echoes it back — it stays on while you browse";
   - first solo → "solo mutes everyone else — watch the M lights"; first mute-
     while-solo → "that dissolved your solo into mutes";
   - first Mutate → "nudged ~60% of lanes one step — Undo is right there" /
     first Randomize → "re-rolled rhythm only; notes & tracks kept";
   - first lane-length change creating polymeter → "lanes drift and realign
     at the LCM — that's the point";
   - first Record-mode switch → clock-master + count-in card.
   Every card is one screen-worth, LED-illustrated, "Got it" + never shows again;
   all replayable from a **Guide** list (My BMW hub) on the MIDI tab.
- **vs inventory:** the only candidate that covers all 9, each at the moment it
  matters. Risk: users who never tap Listen never learn it — acceptable
  (feature-gated knowledge) but the Guide hub is the backstop.
- **vs no-device:** perfect — nothing gates on hardware; the connect chip nags
  gently forever.
- **vs aesthetic:** good, but coach marks are the least LED-native artifact; they
  must be custom-drawn (dot-matrix caption bar + a lit "target" ring, not a stock
  blue bubble) or they'll read as foreign. More design surface than A.

### C. Device-first pairing wizard

1. **Welcome / detect.** Splash resolves into "Looking for your OP-XY…" with an
   animated scanning LED ring (WHOOP "searching for strap"). Found → name + big
   lit confirmation, Continue. Not found after ~5s → numbered how-to-connect card
   (Car Thing) + "Don't see it?" checklist sheet (Solflare) + "Skip — no OP-XY
   handy" (WHOOP's on-its-way branch).
2. **Sound check.** With device: pick a track, euxy sends a note, "did you hear
   it?" — teaches track·channel by *doing*, and primes Listen ("or play a note on
   your aux track and euxy will find the track for you" — Listen introduced as the
   hero of pairing). Without device: replaced by a silent LedGrid demo screen.
3. **Clock choice.** "Jam: euxy is the clock. Record: OP-XY drives, with count-in."
   Two big LED-styled cards; sets initial mode.
4. **Land on Sequencer** with preset picker sheet open.
- **vs inventory:** teaches connection, track·channel, Listen, clock modes — the
  MIDI half — deeply and by demonstration; teaches *none* of the sequencer half
  (ramps, XOR, solo, mutate, polymeter), which still needs candidate-B-style tips.
- **vs no-device:** its weakness. The wizard's best content (sound check, Listen)
  evaporates without hardware, so a large share of first runs see a degraded
  wizard. WHOOP can assume the strap is coming; euxy can't assume the OP-XY is
  within reach at install time.
- **vs aesthetic:** strong — scanning/confirmation states are natural LED theatre.

## Recommendation

**B as the backbone, with A's screens 1–2 compressed into a single skippable
welcome moment, and C's connect content demoted to a sheet.** Concretely:

1. One welcome screen (A①): LedGrid identity animation + one sentence + Continue/
   Skip. Cheap, sets tone, ambiently teaches the playhead.
2. Land on the seeded pattern with the 3-mark tooltip chain (B①) and the
   persistent Connect chip (B②). The chip's sheet *is* candidate C compressed:
   detect → numbered steps → sound-check → troubleshoot checklist (incl. Panic
   pointer) — so device-first users still get the wizard experience, on demand,
   at the moment they actually have the cable in hand.
3. Ship the full set of one-shot contextual cards (B③) + the replayable Guide hub.

Rationale: the inventory is the requirement, and only progressive disclosure covers
it; the no-device reality kills C as a mandatory path; and euxy's strongest asset —
a UI that is literally made of demonstration-ready LEDs — pays off most in
contextual, live-widget teaching (Arc Search's "try it" insight) rather than
static intro art.

## What to mock in Paper

Design-system note: coach marks/cards must be drawn in the app's own language —
dot-matrix type, lit-LED accents, no stock tooltip chrome (see
`build-ui-from-paper` + `dot-matrix-styling` memory notes).

1. **Welcome screen** — LedGrid identity animation frame(s), copy, Continue/Skip.
2. **Coach mark component** — the euxy-native tooltip: dot-matrix caption bar,
   target highlight (lit ring around the referenced control), step dots (● ○ ○),
   dismiss ×. Mock one pointing at the step strip and one at the transport.
3. **Contextual concept card** — one master layout + two instances: the
   dual-generator/XOR card (two mini rings + attribution dots, "both hit =
   silence" shown as a dark cell) and the solo/M-lights card.
4. **Connect sheet, all states** — scanning (animated LED ring), found/confirmed,
   numbered how-to steps, "Don't see it?" troubleshooting checklist (with Panic
   pointer), sound-check step, and the header Connect chip (dim/lit).
5. **Preset picker rows** with micro-LedGrid rhythm previews; "Ambient Drift" row
   carrying the polymeter tag.
6. **Guide hub list** on the MIDI tab — replayable walkthrough rows with
   done/undone LED dots.
7. *(Alternative to keep alive per ROADMAP: one artboard sketching candidate C's
   scanning + confirmation screens, in case the connect sheet wants to grow into a
   full-screen first-run path later.)*
