# euxy.expo.app — unified web plan

**Date:** 2026-07-25 · **Status:** plan, awaiting Brent's go
**Supersedes the deployment/hosting sections of** `pattern-sharing-research.md`
(§2 landing page) **and** `web-opxy-placeholder.md` (§where it lives) —
those docs remain the deep references for their features; this doc is the
single architecture + sequencing plan for everything web.

## The one-liner

One minimal Expo app in `web/`, deployed to **euxy.expo.app** via EAS
Hosting, serving three jobs that share one playback engine:

1. **Home (`/`)** — the OP-XY placeholder: hear euxy without the
   hardware. Power key, IDAM connect instructions, standalone factory-
   preset playback through the CC0 sample kit, "get the app" CTA.
2. **Shared patterns (`/p?d=…`)** — the QR/universal-link destination:
   decode the payload, show the pattern (icon chip, name, stats, labeled
   lane grid), and **play it right there** — same sample engine, plus
   optional Web MIDI OUT to a real OP-XY. Installed-app users never see
   this page (universal link opens the app).
3. **App association (`/.well-known/…`)** — AASA + assetlinks.json, which
   is what makes the app's universal links work at all.

The integration is why both features get better: the sharing landing page
was going to be a static "get the app" card — now a scanned pattern is
*audible in one tap* for someone with no app and no hardware. And the
placeholder site was a destination without an inbound funnel — now every
shared QR code is an entry point to it.

## Why one app (decisions this resolves)

- `pattern-sharing-research.md` proposed a "tiny separate Expo web
  project"; `web-opxy-placeholder.md` proposed "`web/` — its own minimal
  Expo app, single route or plain entry." These are the same app. The
  router question is settled by integration: **expo-router** (static
  export), because we now need `/`, `/p`, and `public/.well-known/*`,
  plus typed `useLocalSearchParams` for `?d=`.
- The placeholder doc's open question 2 (domain) — **resolved:
  euxy.expo.app** (Brent 2026-07-25, free EAS Hosting subdomain,
  permanent once QR codes ship).
- The placeholder doc's open question 1 (speak to a real OP-XY via Web
  MIDI OUT) — was "scope creep for a placeholder"; **now in scope**,
  because Brent's sharing brief asks exactly for it: "show the pattern on
  the web, and make it playable through usb midi on desktop web (not the
  full editor, just playback)." Destination picker: **Sounds (samples,
  default)** / **OP-XY (Web MIDI out)** when an output device is present.
- Still explicitly NOT web: the editor, the sequencer UI, anything
  touching zustand/Reanimated/native modules. Playback only.

## Architecture

```
web/                      own package.json (react-native-audio-api lives
  app/                    HERE ONLY — never in euxy's; see the layered
    _layout.tsx           guards in web-opxy-placeholder.md)
    index.tsx             / — placeholder + presets
    p.tsx                 /p?d= — shared pattern view + play
  public/.well-known/
    apple-app-site-association     appID <TEAM_ID>.dev.brent.euxy, paths ["/p*"]
    assetlinks.json                (when an Android build exists)
  components/             power key, LED status row, lane grid (DOM/RN-web),
                          pattern player transport
  audio/                  voices.ts (standard Web Audio types), buffers.ts,
                          scheduler.ts (~40-line lookahead)
  assets/sounds/          ~24 CC0 one-shots + LICENSES.md
```

### Status: W0 SHIPPED + more (2026-07-25) — https://euxy.expo.app is LIVE

Built and deployed in one pass (uncommitted): `web/` scaffold, home page
with all 15 factory presets playable (synth voices — W1 sample kit still
pending), `/p` decoding + playing real shared patterns with the app's
playhead language, AASA served with `content-type: application/json`,
production deploy claiming euxy.expo.app. Also landed app-side:
`src/core/share-codec.ts` (round-trips all presets; 2000-iteration fuzz
clean; URLs 137–156 chars) and `src/core/lane-pattern.ts` (patternForLane
extracted from selectors, re-exported for compatibility). The app-side
native build (associatedDomains entitlement) is now UNBLOCKED.

**One repo-mechanics correction learned the hard way:** `expo export`
does NOT crawl out-of-root `watchFolders` (the dev server does — verified
on SDK 57 / Metro 0.84.4; feedback submitted to Expo). Shared modules are
therefore **copied, not watched**: `web/scripts/sync-shared.mjs` copies
the allow-list from `../src` into `web/shared/` (generated, gitignored)
before every start/export/typecheck; the `@/` alias maps to `web/shared/`
with src's layout so the shared modules' internal `@/` imports resolve
unchanged. Bonus: `web/` is self-contained at export time, which EAS
deploy workers want anyway. Purity stays self-enforcing (web tsc fails on
impure imports). The section below predates this — read "watchFolders"
as "the sync script".

### Repo mechanics (decided 2026-07-25, Brent's "does a web dir work?" question)

**Standalone nested app — NOT bun workspaces.** Workspaces would hoist
`react-native-audio-api` into the root `node_modules` (defeating
isolation guard #1) and force monorepo Metro config onto the MAIN app,
which today has NO metro.config.js at all (pure Expo defaults — keep it
that way). `web/` carries its own `package.json` + `bun.lock`.

Main-app footprint (the entire cost): root tsconfig gains `"web"` in
`exclude` (beside the existing `"example"`), and a root
`.watchmanconfig` ignores `web/node_modules` (perf only). Root
package.json untouched → **native fingerprint unchanged** (confirm once
with `npx @expo/fingerprint` before/after W0) → deploy.yml OTA/build
routing unaffected. Web deploys = separate workflow filtered on
`web/**`.

Inside `web/`: `metro.config.js` with `watchFolders = [../src]` (only
src, never the repo root) and `resolver.extraNodeModules['@'] = ../src`;
tsconfig maps `@/*` → `../src/*`. **The alias is `@/` with the same
meaning as the main app** (not `@euxy/*` as earlier drafted) — required
anyway because shared modules import each other via `@/`
(`state/lane.ts` → `@/theme/tokens`); web-local files use relative
imports. Own `app.json`: `web.output: "static"`, reuse euxy's EAS
projectId.

**Purity is self-enforcing:** if an impure import (zustand, Reanimated,
a native module) ever creeps into the shared closure, `tsc --noEmit` in
`web/` fails immediately — the package isn't installed there. Run web's
tsc beside the root's in CI and the allow-list needs no lint rule.

**expo-router in web/ (how it works):** `main: "expo-router/entry"`,
`plugins: ["expo-router"]`, `web.output: "static"`. Routes =
`web/app/{_layout,index,p}.tsx`; the root layout is fonts + dark bg +
`<Slot />` + `expo-router/head` defaults (URL-driven on web — no
stack/screen chrome). `expo export -p web` prerenders one HTML file per
route and copies `public/` verbatim into `dist/` — which is exactly how
the AASA ships. `/p` reads `useLocalSearchParams<{ d?: string }>()`
client-side (the payload never touches a server). The app's router and
web's router are separate installs that only agree on the URL shape —
both define `/p`, so no `+native-intent` rewriting is needed. Dev:
`cd web && bunx expo start --web` (auto-picks a free port beside the
app's Metro). KNOWN LIMIT of static output: link unfurls (iMessage/
Slack OG cards) are generic, not per-pattern — per-pattern meta needs
`web.output: "server"` on EAS Hosting later; same routes, flip the
output mode. Not a v1 need.

Shared pure modules from the main app (the allowed set from the
placeholder doc **plus the codec**), imported via the shared `@/` alias:

| Module | Used by web for |
| --- | --- |
| `core/euclid.ts` | step derivation for playback + lane-grid rendering |
| `core/share-codec.ts` (**new**, built in app chunk A) | decoding `?d=` |
| `core/opxy.ts` | drum-slot naming, MIDI-out notes |
| `state/presets.ts`, `state/lane.ts`, `state/types.ts` | standalone presets, Pattern/Lane types |
| `midi/parse.ts`, `midi/port.web.ts` | IDAM input mode + Web MIDI out |
| `theme/tokens.ts`, `components/patterns/chips.ts` | euxy look: keyRamp, colors, chip glyphs |

Rule stands: nothing in the allowed set may import zustand, Reanimated,
or a native module. `share-codec.ts` must be written dependency-free
anyway (it's also the untrusted-input boundary — clamps live in it).

### One playback engine, three sources

`PatternPlayer(pattern, destination)` — the lookahead scheduler
(`setInterval` ~25 ms / ~100 ms window on `ctx.currentTime`) walking
`step = floor(tick / resolutionTicks) % length` per lane:

- **source: factory preset** (home page picker) — patterns from `presets.ts`
- **source: decoded payload** (`/p`) — same `Pattern` shape by construction
- **source: live MIDI in** (IDAM mode) — no scheduler; inbound note-ons
  drive voices directly
- **destination: samples** (default) — `AudioBufferSourceNode` voices,
  velocity → gain, CH chokes OH; Sub/tonal channels synthesized
- **destination: Web MIDI out** — `port.web.ts` send with the same
  timestamps the app's engine uses; plays a real OP-XY from the browser

The lane grid on `/p` reuses the share-card language (52px lane labels,
keyRamp fills, LED dots) rendered as plain DOM/RN-web views — and gets a
travelling playhead light driven by the scheduler (rAF, brightness only,
the LED motion rules apply on web too).

## Sequencing (dependency-ordered)

- **W0 — scaffold + claim the domain (do first, tiny):** `web/` Expo
  scaffold, `@euxy/*` aliases, placeholder home stub, AASA in `public/`,
  `npx expo export -p web && eas deploy --prod` → **claims euxy.expo.app
  and unblocks the app-side native build** (associatedDomains needs the
  AASA to be live to verify). Nothing else blocks on design.
- **W1 — sound:** CC0 pack (pick/trim/encode + LICENSES.md), voices,
  scheduler, preset player on `/` with power key. (= placeholder MVP
  slices 1–4.)
- **W2 — shared patterns:** `/p` route — decode via `share-codec`
  (requires app chunk A to exist), preview card, play through the W1
  engine, "open in euxy / get euxy" CTA, malformed-payload error state.
- **W3 — hardware paths:** Web MIDI OUT destination picker; IDAM input
  mode + status LEDs; Brent's hardware verification pass (IDAM
  end-to-end, OP-XY out timing).

App-side chunks from `pattern-sharing-research.md` interleave: chunk A
(codec + import route) is W2's prerequisite and blocks on nothing; chunk
B (share sheet + Skia card) is independent; the app's native build
(expo-sharing/file-system/clipboard + associatedDomains entitlement)
should follow W0 so universal links verify on the first try.

End-to-end acceptance: share from the app → scan the PNG with a second
device → (no app) euxy.expo.app/p plays the pattern in the browser →
(app installed) the app opens and imports. Same URL, three outcomes.

## OG images — BUILT (2026-07-25)

Paper boards **"OG · home 1200×630"** + **"OG · shared pattern 1200×630"**,
implemented with **satori + @resvg/resvg-js at build time** (the stack
behind @vercel/og; the wrapper itself is edge-only). `bun run og` (chained
into export/deploy) renders `public/og.png` (home/brand) and
`public/og-p.png` (generic shared-pattern frame) from `lib/og-cards.ts` —
element trees built from the REAL shared modules (chip registry,
patternForLane, Four on the Floor preset). Fonts: vendored Space Mono
TTFs (OFL) in `assets/og-fonts/` — satori can't read woff2. Meta: layout
Head carries the site-wide og/twitter tags (Brent's wiring → /og.png);
/p's prerendered state carries the og-p variant.

**Per-pattern OG images: attempted, reverted — three walls** (feedback
ea3f4348): (1) runtime wasm compilation is refused ("Wasm code generation
disallowed by embedder"), which killed resvg-wasm; (2) SSR
(`web.output: "server"` + `unstable_useServerRendering`) renders head
metadata correctly under local `expo serve` but the deployed worker
returns an EMPTY head — no generateMetadata output, no <Head> tags (body
renders); (3) the CDN caches SSR HTML for 1h with a query-blind cache
key, so every `?d=` would unfurl with whichever pattern cached first. The
full working-locally SSR implementation (generateMetadata on /p +
/api/og+api.ts) lives in git history on this branch.

### Revised plan (2026-07-26) — route around all three

Wall (1) was misdiagnosed. Workers don't forbid wasm; they refuse runtime
*compilation of wasm bytes*, which is exactly what a Node-focused lib's
manual `WebAssembly.instantiate` does. A statically imported `.wasm` is
compiled at deploy time and runs fine. Both libraries already ship the
affordance — their package exports expose the wasm as an importable
subpath, precisely for this:

    @resvg/resvg-wasm  →  "./index_bg.wasm"
    satori 0.29.0      →  "./yoga.wasm"  (+ a ./standalone entry)

`yoga-wasm-web/asm` is additionally a pure-JS asm.js build, so satori's
layout half can avoid wasm entirely, leaving resvg as the only wasm
dependency to solve.

Walls (2) and (3) get bypassed at the app level rather than waiting on the
platform:

- **(2)** Serve the crawler-facing HTML from an API route, which is a
  worker we control end to end. Hand-write `<head>` there and Expo's
  broken head injection stops mattering.
- **(3)** Put the payload in a **route param**, not a query param, so the
  cache key varies. A payload deterministically produces one card, so the
  URL is content-addressed: serve
  `Cache-Control: public, max-age=31536000, immutable` and the 1h CDN
  cache becomes the delivery mechanism instead of the obstacle. This is
  strictly better than the `no-store` workaround, which would have
  re-rasterized a PNG on every crawler hit.

Shape:

    web/app/p/[d]+api.ts     worker writes <head> itself        → bypasses (2)
    web/app/og/[d]+api.ts    resvg-wasm via static .wasm import → bypasses (1)
    path param + immutable   correct cache key                  → solves (3)

The route param is nearly free: the codec is already unpadded base64url
over `A-Za-z0-9-_` (`base64urlEncode` breaks early rather than padding),
so a payload is a legal single path segment with no escaping — ~134 chars
for a 4-lane pattern. `shareUrl()` in core/share-codec.ts is the single
source of the URL shape, and the AASA already wildcards (`"paths":
["/p*"]`), so `/p/<payload>` needs no native config change.

Two things to get right:

- **Old `?d=` links must keep working** — QR codes are already generated
  and possibly printed. Keep the static `/p?d=` page, add `/p/<d>` as the
  new canonical, switch `shareUrl()` going forward. Native needs a
  `src/app/p/[d].tsx` too; today only `src/app/p.tsx` exists, reading
  `?d=`.
- **Serve the crawler HTML as 200 + meta/JS redirect, never a 302.** Some
  previewers follow redirects and would land on the static page's generic
  og-p.png. A 200 whose head carries the per-pattern tags makes them stop
  and read.

### Spike result (2026-07-26) — wall (1) stands, for a sharper reason

Spiked it: `web.output: "server"`, `assetExts.push('wasm')`, and an
`app/wasm-probe+api.ts` that statically imports
`@resvg/resvg-wasm/index_bg.wasm` and reports what it got. Expo 57.0.8 /
Metro 0.84.4. **The static-import path is not expressible through Metro
today**, on two counts:

1. `wasm` is in neither `assetExts` nor `sourceExts` by default, so the
   import doesn't resolve at all. Pushing it into `assetExts` makes it
   resolve — but as an *asset*, so the imported value is a URL string:

       { "typeof": "string", "isWebAssemblyModule": false,
         "serialized": "/assets/node_modules/@resvg/resvg-wasm/index_bg.9484…wasm" }

   A URL means `fetch` + `WebAssembly.instantiate` at runtime, which is
   exactly the manual dance the worker refuses. No `WebAssembly.Module`,
   no deploy-time compilation.
2. The `.wasm` isn't even emitted — no `.wasm` anywhere under `dist/`, and
   that asset URL 404s. So even the (already-doomed) runtime-fetch
   fallback dead-ends before reaching the wasm restriction.

So the diagnosis moves from "the worker forbids wasm" to **"Metro has no
wasm-module path"** — a much more actionable ask for ea3f4348: Expo needs
`.wasm` to bundle as a worker-bindable module, not an asset URL.

### Therefore: plan B is the path — drop resvg entirely

No wasm, no dependency, and it makes all three walls app-level:

- **PNG encoding is ~100 lines with zero deps.** Workers expose
  `CompressionStream('deflate')`, which emits zlib-wrapped deflate
  (RFC1950) — verified locally, first byte `0x78`, exactly what a PNG
  IDAT chunk wants. The rest is signature + IHDR + IDAT + IEND and a
  CRC32 table.
- **The design is already a pixel grid.** The card is dot-matrix cells and
  mono text, and `chips.ts` already stores glyphs as 5×5 shade strings.
  Rasterizing rectangles into a pixel buffer is not a compromise here, it
  is the design language — so a small bitmap font for the pattern name is
  on-brand rather than a downgrade.
- Satori and resvg both stop being needed on the dynamic path. Keep them
  for the build-time static cards (`resvg-js` is native there and fine).

With wasm out of the picture, wall (1) disappears rather than gets
worked around, and (2)+(3) fall to the API-route + route-param shape
above. Nothing then waits on EAS Hosting.

**Still untested:** whether an API route's hand-written `<head>` actually
survives the deployed worker (wall 2). That's the next spike, and it needs
a real `eas deploy` — local `expo serve` can't reproduce the empty-head
bug.

## Open questions

1. `/p` transport: auto-play on load, or require the tap anyway? (The tap
   is required regardless for AudioContext/Web MIDI — so "play arms on
   first tap" is really the only option; question is just whether the
   page *looks* ready-to-play. Recommend: big power/play key like home.)
2. Home page copy — is it "the OP-XY placeholder" or "euxy on the web"?
   Naming affects nothing technical, but the page is now the funnel
   target for every shared QR, so it should lead with euxy, not with the
   placeholder framing.
3. PR preview URLs (EAS Hosting gives them free) — worth wiring into
   deploy.yml for the web app once it exists?
