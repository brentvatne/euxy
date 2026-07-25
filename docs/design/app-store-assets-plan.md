# App Store submission — assets & metadata plan (2026-07-25)

What euxy needs to go from TestFlight to the App Store. Mechanics are already
in place (deploy.yml builds + auto-submits; `ascAppId 6794186602` in eas.json;
buildNumber auto-increments) — this is the ASSET and METADATA work.
Metadata ships as `store.config.json` + `eas metadata:push` (preview,
Apple-only) so the store presence is versioned in the repo like everything
else.

## 1 · Identity (mostly done)

- **App icon** — ✔ dot-matrix "e" (`assets/euxy.icon` Icon Composer format +
  1024 PNG). Verify the .icon renders in all iOS 26 appearance modes
  (default / dark / clear / tinted) before submission — Icon Composer
  preview or a device check.
- **Name availability** — "euxy" as the ASC app name (30 chars max). Already
  registered with the ASC app record, so done.
- **Copyright** — `2026 Brent Vatne` (see LICENSE note in the open-source
  audit: the repo LICENSE currently says 650 Industries).

## 2 · Screenshots (the real work) — iPhone-only, one size class

App is iPhone-only (no `supportsTablet`), so ONE set covers everything:
**6.9" portrait, 1320×2868** (up to 10; 3–6 is the sweet spot; the first
2–3 do all the conversion work).

Recommended set, in order:

1. **Sequencer, playing** — gradient lanes, LEDs lit, playhead dark-dot on a
   hit, capsule visible. The money shot; caption on the money message
   ("euclidean rhythms for your OP-XY").
2. **Lane editor** — pinned combined card + generator sliders (caption:
   "two generators per lane — combine, rotate, mutate").
3. **Dice / temp mode** — capsule with armed green-traced… (armed rim +
   caption "experiment safely: temp mode + dice").
4. **Patterns list** — 15 presets with their glyphs (caption: "15 factory
   rhythms from tresillo to motorik").
5. **MIDI screen, connected** — the hardware story (caption: "USB-C MIDI ·
   jam or record").
6. Optional: record mode transport (count-in ticker).

**Production path (all tooling exists in-repo):** capture raw screens on the
6.9" sim (`xcrun simctl io … screenshot`), then build a **Paper board per
screenshot** — device frame, caption typography in the app's dot-matrix
language, exact 1320×2868 artboards — export at 1x. Same pipeline as the app
icon. Design once, re-capture cheaply per release.

**App preview video (optional, do later):** 15–30s sim capture of a dice →
temp → keep → pattern-switch flow. Skip for v1; screenshots first.

## 3 · `store.config.json` (drafts to refine)

- **Title (≤30):** `euxy — euclidean sequencer` (16+ alt: `euxy · OP-XY
  sequencer` — see trademark note below)
- **Subtitle (≤30):** `Polymeter MIDI for OP-XY`
- **Keywords (≤100, comma-separated, no spaces):**
  `euclidean,sequencer,midi,op-xy,opxy,teenage,engineering,drum,rhythm,polymeter,step,generative`
- **Description (≤4000):** front-load 3 lines — what it is (a euclidean
  polymeter sequencer that drives the OP-XY over USB-C MIDI), that it works
  standalone too (presets + editor), the jam/record clock story. Bullets for
  lanes/generators/dice/temp/presets/haptics. No accounts, no ads, no
  tracking — say so.
- **Promo text (≤170, updatable without a binary):** launch line.
- **Category:** primary `MUSIC`; secondary `UTILITIES`.
- **Age rating advisory:** everything `NONE` → 4+.
- **Release:** `automaticRelease: false` for v1 (manual trigger),
  phased later.

**Trademark caution:** "OP-XY" and "teenage engineering" are TE marks.
"for OP-XY" phrasing (compatibility statement) is the defensible form —
Apple guideline 5.2.5 allows referencing hardware you're compatible with,
but putting the mark FIRST in the title is asking for a rejection. Keep the
brand in subtitle/keywords, lead with "euxy".

## 4 · Required URLs — all land on euxy.expo.app (the web app!)

- **Privacy policy URL (required):** `euxy.expo.app/privacy` — static page;
  honest one-pager (no accounts, no personal data; diagnostics via EAS
  Observe/updates if enabled).
- **Support URL (required):** `euxy.expo.app/support` or the GitHub repo
  (pairs with the open-source plan).
- **Marketing URL (optional):** `euxy.expo.app`.

Add both routes to the web/ app backlog — they're one screen each in the
existing page language.

## 5 · App Privacy (ASC questionnaire, blocking)

With expo-updates + expo-observe in the build: declare **Diagnostics**
(crash/performance data), *not linked to identity, not used for tracking*.
Nothing else is collected — no accounts, no analytics SDKs, no ads. If
Observe is disabled at submission time, the answer can be "no data
collected" — decide before filling it in, it's annoying to walk back.

## 6 · Review information (the OP-XY problem — biggest rejection risk)

Reviewers do not own an OP-XY. Guideline 2.1 (completeness) risk. Mitigate
in review notes:

- State plainly: the app is fully usable WITHOUT the hardware — browse the
  15 presets, edit lanes, dice/temp, watch playback on the LED grid; the
  OP-XY is the sound engine when connected over USB-C MIDI.
- Include a **demo video link** (unlisted) showing the app driving a real
  OP-XY — record once during a hardware session.
- Contact info: name/email/phone.
- No demo account needed (no auth) — say so explicitly.

## 7 · Order of operations

1. Screenshot captures on sim → Paper frame boards → export set. (agent-able)
2. Draft `store.config.json` + description copy. (agent-able)
3. `web/`: privacy + support routes, deploy. (agent-able)
4. Demo video on real hardware. (Brent)
5. ASC: App Privacy questionnaire + age rating. (Brent, 10 min)
6. `eas metadata:push`, verify in ASC, then promote a production build.
