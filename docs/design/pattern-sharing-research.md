# Pattern sharing via QR — research

**Date:** 2026-07-25 · **Status:** BUILT (app side JS complete 2026-07-25;
PNG export + universal links activate with the next dev build — until then
Share Card falls back to sharing the bare link, and links open via euxy://
only). Implemented: `src/core/share-codec.ts` + `lane-pattern.ts`,
`store.importPattern`, `src/app/{share-pattern,p}.tsx` sheets, ShareCard
Skia component (`components/patterns/share-card.tsx`, QR = pure-JS
`qrcode/lib/core/qrcode` byte-segment → rounded-module dot-matrix render),
"Share…" in the pattern menu, shims for expo-sharing/file-system/clipboard.
Web side live at euxy.expo.app (see web-plan.md).
**Roadmap origin:** ROADMAP.md backlog → "Pattern sharing via barcode"

Share a pattern from the pattern header menu: a "Share…" item opens a form
sheet showing a dot-matrix QR code (pattern icon embedded in the center)
drawn in a Skia canvas; the same canvas renders a share card exportable to
PNG via expo-sharing. The QR encodes an **https universal link** served by
EAS Hosting, so a recipient without the app lands on a web page that guides
them to it — and later that page can render/play the pattern on desktop web
over Web MIDI.

---

## 1. What the QR encodes — universal link + compact payload

### Link shape

```
https://euxy.expo.app/p?d=<base64url payload>
```

**Domain DECIDED (Brent 2026-07-25): `euxy.expo.app`** (free EAS Hosting
subdomain, no custom domain). The subdomain is claimed on the first
`eas deploy` of the web project — do that early, before any QR ships, to
lock the name.

- **https, not `euxy://`** — scanning with the iOS Camera opens the app
  directly when installed (universal link), and falls back to the web
  landing page when not. A bare custom scheme is a dead end for
  non-users. The `euxy` scheme (already in app.json) stays as a
  secondary/dev entry.
- **Query param, not fragment** — AASA path matching and expo-router param
  parsing both operate on path+query; fragments risk being dropped in the
  native handoff. The payload is not secret, so the query is fine (EAS
  Hosting is static — nothing meaningful logs it).
- **No server storage** — the pattern travels entirely in the URL
  (ROADMAP: "patterns travel as pixels; no server, no account").

### Payload codec

Patterns are pure parameters, not step arrays (`src/state/types.ts` —
`Pattern` = name/bpm/baseResolutionTicks/icon + `Lane[]`, lane = 13 scalar
fields + two `{pulses, rotation}` generators). Nothing to recompute on
import; `patternForLane()` re-derives the steps.

Measured sizes (Explore agent, realistic 4-lane pattern):

| Encoding | Size |
|---|---|
| Raw JSON | 1,064 B (way too big for a clean QR) |
| deflateRaw + base64url | ~320 chars |
| **Versioned compact binary + base64url** | **~100–130 chars** |

Recommendation: **versioned compact binary** (matches the ROADMAP note).
Byte-aligned, no bit-packing needed:

```
header:  version u8 · flags u8 · bpm×10 u16 · baseResolutionTicks u8 ·
         icon u8 (index into CHIP_NAMES; 255 = none) ·
         nameLen u8 + utf8 bytes
lane ×N: length u8 · pulsesA u8 · rotA u8 · pulsesB u8 · rotB u8 ·
         op u8 · trackRot u8 · note u8 · channel u8 · velocity u8 ·
         gateMs u16 · resolutionTicks u8 · nameLen u8 + utf8
```

≈ 13 B/lane + short names → a 4-lane pattern ≈ 80–100 B → base64url
~110–135 chars → full URL ~140–170 chars. Strip `id`/`updatedAt`
(regenerate on import), strip `muted`/`solo` (share clean; or 1 flag bit).
Version byte first so fields can be appended without breaking old codes
(future: playMode, velMod, pitch pools from the melodic-sequencing plan).

**QR density check (approximate):** a ~150-byte URL fits around QR
version 11–12 at EC level H (61–65 modules) or version 9–10 at EC Q.
Both scan easily from a phone screen. EC **H (30 %)** is required if we
carve out a center area for the icon; at these sizes that's comfortable.
Worst case (8 lanes, long names, ~230 B) is still only ~v16-H — fine.

No compression library needed at these sizes — deflate only wins over the
binary codec above ~8 lanes, and `CompressionStream` isn't in Hermes
(would need `fflate`/`pako`). Skip it; the codec lives in
`src/core/share-codec.ts` (pure TS, unit-testable, reusable by the web
landing page).

---

## 2. Universal linking + EAS Hosting

Per [Expo's universal-links docs](https://docs.expo.dev/linking/ios-universal-links/)
and the blog post ["How to configure iOS Universal Links and Android App
Links with Expo Router and EAS Hosting"](https://expo.dev/blog/universal-and-app-links)
(Brent-supplied; full recipe + [video](https://youtu.be/kNbEEYlFIPs) +
worked example repo [kadikraman/linking-example](https://github.com/kadikraman/linking-example),
live at linking-example.expo.app):

1. **AASA file** at `public/.well-known/apple-app-site-association` of the
   web project, served over https:

   ```json
   {
     "applinks": {
       "details": [{ "appID": "<TEAM_ID>.dev.brent.euxy", "paths": ["/p*"] }]
     }
   }
   ```

2. **app.json** (native change → entitlement → **new build**):

   ```json
   { "ios": { "associatedDomains": ["applinks:euxy.expo.app"] } }
   ```

3. **Android later:** `public/.well-known/assetlinks.json` (needs
   `package_name` + `sha256_cert_fingerprints` — preview keystore
   fingerprint from the EAS project credentials page, production from
   Google Play → App Signing) + `android.intentFilters` with
   `autoVerify: true` and `pathPrefix: "/p"`. Same web deploy; note for
   when an Android build exists. Verify on device: app icon long-press →
   App info → Open by default → "1 verified link".

4. **In-app route:** expo-router handles incoming universal links natively;
   we add `src/app/p.tsx` that reads `useLocalSearchParams<{ d: string }>()`
   (the blog confirms query params pass through universal links into
   `useLocalSearchParams`), decodes, calls a new
   `store.importPattern(pattern)`, and redirects to the sequencer (with a
   confirm sheet — see §6 open questions). Cold-start deep links render
   only the target route by default — the root layout's existing structure
   plus `initialRouteName` keeps the rest of the app behind it.

Deploy loop (from the blog): `npx expo export --platform web` →
`eas deploy --prod`, then confirm the AASA URL responds. **Testing
gotcha: iOS fetches the AASA at app-install time** — after changing the
file, delete and reinstall the app (and expect Apple CDN caching ~a day
on top).

Note on `*.expo.app`: it works fine as an associated domain (AASA is
per-subdomain). Switching domains later would orphan every previously
shared QR, so `euxy.expo.app` is permanent once codes are in the wild.

### Landing page: separate mini web app, not euxy's web export

> **SUPERSEDED BY THE UNIFIED WEB PLAN (2026-07-25):** the landing page
> is now a route (`/p`) of the single `web/` Expo app shared with the
> Web OP-XY placeholder — see `docs/design/web-plan.md` for the route
> map, shared-module list, playback engine, and W0–W3 build order. The
> reasoning below still holds (it's why the web app is separate from
> euxy's bundle); only "tiny static landing" is obsolete — the page now
> *plays* the shared pattern via the placeholder's sample engine.

Exporting euxy itself to web is risky today — the route graph pulls in
NativeTabs, `@expo/ui` (iOS/Android-only), and Skia (needs the ~2 MB
CanvasKit wasm); the shims in `src/lib/shims.ts` guard runtime, not
bundling. Recommendation: a **tiny separate Expo web project** (e.g.
`web/` in this repo, own package.json) deployed with
`npx expo export -p web && eas deploy`. The blog explicitly supports
this split ("Linking without Expo Router for Web"): the website need not
share the native app's codebase or navigation tree — the well-known
files just have to be served as `application/json`, and since our web
route and native route both live at `/p`, no `+native-intent` URL
rewriting is needed. The mini app:

- Deployed to **euxy.expo.app** (claim the subdomain on first deploy).
- Serves the AASA + assetlinks well-known files from `public/`.
- `/p` route: decodes `?d=` with the **same `share-codec.ts`** (relative
  import into the repo — that's why the codec must stay dependency-free
  and platform-pure), renders the pattern preview (name, icon glyph, lane
  step grid as plain divs — the dot-matrix look is trivial in CSS), and an
  App Store link / "open in app" button.
- **Future web playback is genuinely cheap here:** `src/midi/midi.web.ts`
  (Web MIDI, from the v1 PoC) and `src/core/euclid.ts` are pure TS the web
  app can import directly. Playback-only = the v1 scheduler + the codec —
  no editor. This validates the separate-app choice: it grows into the
  playback page without ever fighting the native bundle.

Verify after first deploy: `https://euxy.expo.app/.well-known/apple-app-site-association`
returns the JSON with a JSON content type (Apple's CDN fetches it; check
with `curl -I`). AASA is cached by Apple for ~a day — device-test with a
fresh install.

---

## 3. QR rendering in Skia — draw it ourselves

Two options evaluated:

- **[`react-native-qrcode-skia`](https://github.com/enzomanuelmangano/react-native-qrcode-skia)**
  (v0.4.0, pure TS, peer `skia >= 1.0.0` ✓, dep `qrcode ^1.5.3`): ready-made
  `<QRCode value size errorCorrectionLevel logo logoAreaSize shapeOptions>`
  with rounded/circle module shapes and center-logo carve-out. Fastest path,
  but it emits **one SkPath** — per-module shading (three-tone LED look),
  glow layers, and animation hooks are out of reach.
- **Draw it ourselves** (recommended): add only the pure-JS
  [`qrcode`](https://www.npmjs.com/package/qrcode) package for matrix
  generation and render modules as Skia `RoundedRect`s. ~40 lines:

  ```ts
  import QRCode from 'qrcode';
  const qr = QRCode.create(url, { errorCorrectionLevel: 'H' });
  // qr.modules: BitMatrix { size, get(r, c) } → map to rounded rects
  ```

  This matches the app's LED idiom exactly (`led-chip.tsx`:
  `borderRadius = cell * 0.3`, gap between cells, `CHIP_SHADE_COLORS`),
  lets the finder eyes render as dot-matrix clusters, supports a
  `BlurMask` bloom pass like `step-strip-skia.tsx` already does, and makes
  the center icon just more of the same drawing: skip modules under a
  center rect and draw the pattern's 5×5 chip glyph there (the `led-chip`
  geometry ports to Skia in ~15 lines; glyph data is already in
  `chips.ts` as 25-char shade strings).

**Contrast warning:** QR decoders want dark-on-light. On the app's black
theme, invert: draw the card panel near-white (`#F6F4F4` ramp top) with
near-black modules (`#08080A` displayBg), or keep dark background but make
the QR panel itself a light "device screen" inset. Light-modules-on-black
QRs *do* scan (iOS Camera handles inverted codes) but third-party scanners
are unreliable — safest is a light QR panel on the dark card. Prototype
both, test with iOS Camera + a couple of Android scanners before locking
the design.

Keep quiet zone ≥ 4 modules around the code; the icon carve-out should stay
≤ ~25 % of the code's width at EC H.

---

## 4. Share card + PNG export pipeline

### Design references (Mobbin)

- [Duolingo — QR profile card](https://mobbin.com/screens/3bda5baa-3f79-4bdc-8280-008f66bd04c7) —
  the closest analogue: card with avatar embedded in QR center, name above,
  Share link / Copy link actions below.
- [Binance — stat share card](https://mobbin.com/screens/fa184fc0-d47a-4ad5-a927-fd920bc4808f) —
  branded card with headline stats + small QR in the footer corner.
- [Any Distance — dark story card](https://mobbin.com/screens/ea30a33d-3d9b-4093-a867-56bad0d10248) —
  dark, minimal, big glyph + stats footer; closest to euxy's aesthetic.
- [Open — dark share card](https://mobbin.com/screens/c0be34ad-77bf-479c-81c2-056a0a97743f) —
  dark practice card, stats grid, app attribution bottom-left.
- [Slopes — card + share row](https://mobbin.com/screens/d3a22b7c-ad68-461d-9431-c945384e874f) —
  "Made with Slopes" attribution corner; Save / Messages / IG Story / More
  action row under the card.
- [Instagram — styled QR](https://mobbin.com/screens/a42deba1-4af8-4e98-b835-f724efaf1dfa),
  [Linktree](https://mobbin.com/screens/d678cf10-979a-4bd9-a46b-1c3f9d84a9cb) —
  QR-as-hero with caption + Save to Photos.

Common anatomy: **card = identity (icon + name) + a visual fingerprint +
stats row + QR + attribution**, with a Share CTA and optionally per-target
shortcuts beneath. For euxy the "visual fingerprint" writes itself: a mini
step-grid of the lanes (keyRamp gradient fills + white LEDs on sequenced
steps) — instantly recognizable as euxy and unique per pattern.

### Card + sheet — DESIGNED IN PAPER (2026-07-25)

Boards **"Sheet · Share Pattern"** and **"Share card — PNG export spec"**
(next to the Nav concepts row). Implementation values baked into the mock:

- Sheet: grabber (36×5 r3 #48484A, pt8) · header "Share Pattern" left +
  "Done" right (both 17/22 600 #F6F4F4, pt16 px20) · card wrap pt14 px16 ·
  actions row = two flex keys h50 r12 gap10 ("Share Card" #F6F4F4/#101014,
  "Copy Link" #2C2C2E/#F6F4F4) · footnote 12/16 #6E6E76 centered px32.
- Card: #08080A r12, padding 18/18/16, gap 14. Identity row = 28px chip
  (#2C2C2E r7, 16px glyph svg) + name 17/22 600 #F6F4F4 + stats line
  Space Mono 11/14 ls0.06em #98989F ("5 LANES · 124 BPM · 16 STEPS").
  Lane grid = one row per lane: 52px lane-name label column (Space Mono
  9/12 uppercase #6E6E76, nowrap — Brent's fix: without labels the
  stacked rows read as ONE wrapped 64-step sequence, since wrapped lanes
  and separate lanes look identical when every row restarts the key
  ramp) + 14×14 r4 cells gap2 (rows gap6), fills `keyRamp[(i%16)>>1]`,
  hits = 4px white LED top-center (top 2px, left-centered) with the
  standard glow; short lanes keep cell size + trailing space. Long lane
  names truncate to the 52px column (single line, never wrap).
  QR panel = #F6F4F4 r12 padding14, QR 240×240 centered (light panel on
  dark card — the contrast-safe orientation). Caption Space Mono 11
  #6E6E76 "EUXY.EXPO.APP · SCAN TO LOAD".
- The mock QR is REAL (segno, EC-H): `https://euxy.expo.app/p?d=` + a
  120-char payload → **version 12, 65×65 modules** — validating the
  capacity math below. Rendered rounded-module dot-matrix with a
  15×15-module center carve-out holding the pattern's chip glyph
  (asset: `docs/design/mockups/share-qr-panel.png`, PIL script).
- Export = the same card at 3× → 1080×1350 (4:5), per the spec note on
  the export board.

### Proposed card (portrait ~4:5, export 1080×1350)

```
┌──────────────────────────────┐
│  [chip glyph]  Pattern Name  │   led-chip + type.title
│  4 lanes · 124 BPM · LCM 48  │   footnote, label25, font.mono accents
│                              │
│  ── mini lane grid ───────── │   keyRamp fills + LED dots per lane
│  ── (one row per lane) ───── │
│                              │
│      ┌────────────────┐      │
│      │  QR (light     │      │   light panel inset, radius.cell
│      │  panel, icon   │      │   modules = rounded dot-matrix
│      │  center)       │      │
│      └────────────────┘      │
│                              │
│  e u x y   ·  scan to load   │   wordmark chip + micro caption
└──────────────────────────────┘
```

Monochrome per `tokens.ts` (no new hues); `font.mono` (Menlo) for the
stats/caption per the token file's "dot-matrix labels" rule.

### One component, two consumers

Build `ShareCard` as a Skia drawing parameterized by `scale`:

1. **Modal (live):** `src/app/share-pattern.tsx` form sheet
   (`sheetAllowedDetents: [0.75]`, registered in `src/app/_layout.tsx`
   beside the six existing sheets, copy the `change-icon.tsx` template —
   including its `grabberSpace` and `collapsable={false}` formSheet
   workarounds). Optional flourish later: LED type-on of the QR modules via
   the `LedGrid` order-array recipe (respect `useReducedMotion`).
2. **Export:** render offscreen at 3× rather than snapshotting the
   on-screen canvas — crisper and independent of the modal's layout:

   ```ts
   const surface = Skia.Surface.MakeOffscreen(1080, 1350);
   drawShareCard(surface.getCanvas(), pattern, url, scale);
   const image = surface.makeImageSnapshot();
   const b64 = image.encodeToBase64(ImageFormat.PNG);
   ```

   (Fallback if offscreen fights us: `useCanvasRef()` +
   `makeImageSnapshotAsync()` on the visible canvas — both APIs confirmed
   present in skia 2.6.2's typings; currently unused anywhere in src/.)

   Then hand to the share sheet (SDK 57 `File` API):

   ```ts
   import { File, Paths } from 'expo-file-system';
   import * as Sharing from 'expo-sharing';

   const file = new File(Paths.cache, `euxy-${slug(pattern.name)}.png`);
   file.write(b64, { encoding: 'base64' });
   await Sharing.shareAsync(file.uri, { UTI: 'public.png', mimeType: 'image/png' });
   ```

Skia text needs fonts: `matchFont` resolves system SF/Menlo on iOS — no
font assets needed for v1.

### Modal actions

Card preview + two buttons in the app's Key style: **Share** (the PNG via
share sheet) and **Copy link** (the bare URL via `expo-clipboard` — see
deps). "Save to Photos" via the share sheet covers the Photos case without
adding `expo-media-library`.

---

## 5. Receiving side (in scope: link handling; scanner UI: later)

- `src/app/p.tsx` route: decode → validate (version byte, bounds-check
  every field — this is untrusted input) → `store.importPattern(pattern)`
  (new action: fresh `uid()`s for pattern + lanes, `updatedAt: now`,
  clamp all values through the same clamps the editor uses) → select it →
  `router.replace('/(tabs)/(sequencer)')`. A malformed payload shows a
  friendly error, never a crash.
- iOS Camera scans the QR and opens the app via the universal link —
  **no in-app scanner is needed for v1.** An in-app "Scan pattern" entry
  (expo-camera) + import-from-photo are follow-ups.
- Cold start works out of the box: expo-router consumes the launch URL.

---

## 6. Dependencies & build implications

| Package | Type | Purpose |
|---|---|---|
| `qrcode` (+ `@types/qrcode`) | pure JS | QR matrix only; we render |
| `expo-sharing` | **native** | share sheet |
| `expo-file-system` | **native** | PNG → `file://` for sharing |
| `expo-clipboard` | **native** | Copy link (optional but cheap) |
| — | — | `@shopify/react-native-skia` 2.6.2, `expo-linking`, scheme `euxy` already present |

Native consequences, batched into **one new dev build** (the standing
rule: new native dep ⇒ fresh dev build before it works on sim):

1. Three expo modules above.
2. `ios.associatedDomains` entitlement.

Route the native imports through the `src/lib/shims.ts` try/require
pattern so the JS ships OTA-safe to builds that predate the modules
(Share button disabled with a console.warn, same as updates/observe).

---

## 7. Implementation plan

Roughly three independent chunks (parallelizable), then an integration
pass:

- **A. Codec + import (pure TS, no build dependency):**
  `src/core/share-codec.ts` (encode/decode + clamps + version byte),
  `store.importPattern`, `src/app/p.tsx` route, unit-style scratchpad
  verification (round-trip every preset, fuzz malformed payloads).
- **B. Share sheet + card (JS, Skia):** menu item (`header.tsx` action
  union + `index.tsx` handler + optional Patterns-row ActionSheet entry
  with `patternId` param), `share-pattern.tsx` sheet, `ShareCard` Skia
  component (QR renderer, chip glyph port, mini lane grid), offscreen
  export → file → share (gated behind shims until the build lands).
  Design the card in Paper first per [[build-ui-from-paper]].
- **C. Web landing (separate mini app):** `web/` project with `/p`
  preview page + well-known files, `eas deploy` to euxy.expo.app.
- **Integration:** app.json associatedDomains + deps → dev build →
  end-to-end: share from sim → scan PNG from a second device/Mac camera →
  app opens → import confirm; no-app path → landing page.

## 8. Open questions for Brent

1. **Domain:** `<something>.expo.app` free subdomain vs custom domain
   (paid) — decide before the first QR ships; old codes never re-point.
   Also: which subdomain name (it's user-visible in the QR caption).
2. **Import UX:** silent-import-and-switch, or a confirm sheet previewing
   the incoming pattern (name/icon/lane grid) with "Add to library"?
   (Confirm sheet recommended — untrusted input, and it's a nice moment.)
3. **Card format:** one portrait 4:5 card, or also a square/story variant
   (Any Distance/adidas offer format pickers — probably overkill for v1)?
4. **Payload contents:** include lane names + mute/solo state, or share
   the "clean" rhythm only? (Recommended: keep names, strip mute/solo.)
5. **Menu wording/placement:** "Share…" after "Change Icon…" in the
   pattern menu; also add to the Patterns-list long-press ActionSheet?
