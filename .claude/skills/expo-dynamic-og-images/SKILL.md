---
name: expo-dynamic-og-images
description: Give every shared link its own preview image — a card rendered per item at request time with satori + resvg, from an Expo Router API route on EAS Hosting / Cloudflare Workers. Use when someone says "every shared link unfurls with the same image", "I want the pattern/document/profile in the link preview", "dynamic og:image", or "@vercel/og but on Expo"; also when debugging "Wasm code generation disallowed by embedder", a deployed route whose <head> comes back empty though the body renders, link previews that all show whichever item was cached first, or Unmatched Route on a path an API route serves. Covers the wasm, head-injection, CDN-cache, canonical-origin, and client-routing traps — each of which looks like a platform limitation and isn't.
---

# Dynamic OG Images on Expo + EAS Hosting

Generate a unique `og:image` per item (a shared document, a pattern, a profile) from an Expo Router API route, rendered on demand in the EAS Hosting worker.

The naive version of this fails three times, and each failure looks like a platform prohibition when it's actually a solvable shape problem. This skill is mostly about those three.

Verified end to end on Expo 57.0.8 / Metro 0.84.4, deployed to EAS Hosting (Cloudflare Workers).

## The stack

`satori` (element tree → SVG) + `@resvg/resvg-wasm` (SVG → PNG). This is what `@vercel/og` wraps; the wrapper itself is edge-runtime-specific, so use the two libraries directly.

Keep the card design in a **pure module** — no `fs`, no `fetch`, no Node builtins — so the same element tree renders at build time (static fallback cards) and at request time (per-item cards).

## Wall 1: Metro has no wasm pipeline

Both libraries need wasm. The intuitive fix — a static `import wasm from './x.wasm'`, which is the documented Cloudflare approach — **cannot be expressed in Metro**:

- `wasm` is in neither `assetExts` nor `sourceExts`, so the import doesn't resolve at all.
- Push it into `assetExts` and it resolves, but as an *asset*: the imported value is a URL **string**, not a `WebAssembly.Module`.
- Worse, the `.wasm` is never emitted — nothing lands in `dist/`, and that URL 404s.

Putting the file in `public/` does not rescue this. It fixes the 404, but you're then back to fetching bytes and compiling them, which is the thing the worker refuses.

### The rule that makes it work

Workers refuse wasm codegen **at request time**, but permit it **in module top-level scope**:

```js
// module scope — ALLOWED
const MODULE = new WebAssembly.Module(bytes);

// inside a request handler — throws
// CompileError: WebAssembly.Module(): Wasm code generation disallowed by embedder
```

Instantiating an already-compiled `WebAssembly.Module` at request time is fine. Only *compilation* is gated.

So: **ship the binaries as base64 source, compile at import, instantiate lazily.** A base64 string in a `.ts` file is just source — it never touches the asset pipeline that drops `.wasm`.

### Generate the base64 modules at build time

Write them to a gitignored directory and chain the generator into export/deploy.

```js
// scripts/generate-wasm-modules.mjs
const SOURCES = [
  { name: 'resvg-wasm',   from: 'node_modules/@resvg/resvg-wasm/index_bg.wasm', export: 'RESVG_WASM_B64' },
  { name: 'yoga-wasm',    from: 'node_modules/satori/yoga.wasm',                export: 'YOGA_WASM_B64' },
  { name: 'font-regular', from: 'assets/og-fonts/YourFont-Regular.ttf',         export: 'FONT_REGULAR_B64' },
];
for (const src of SOURCES) {
  const b64 = readFileSync(join(root, src.from)).toString('base64');
  writeFileSync(join(outDir, `${src.name}.ts`),
    `// @generated — do not edit, do not commit.\nexport const ${src.export} = '${b64}';\n`);
}
```

Fonts get the same treatment: satori needs font `data` and there's no filesystem in a worker. Use **TTF** — satori cannot read woff2.

### The renderer

```ts
import { initWasm, Resvg } from '@resvg/resvg-wasm';
import satori, { init as initYoga } from 'satori/standalone';

/** Backed by a real ArrayBuffer so it satisfies both BufferSource and satori's font data. */
function decode(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buffer = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buffer);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Top-level scope — the only place the worker lets us compile wasm.
const YOGA_MODULE = new WebAssembly.Module(decode(YOGA_WASM_B64));
const RESVG_MODULE = new WebAssembly.Module(decode(RESVG_WASM_B64));
const FONT = decode(FONT_REGULAR_B64).buffer;

let ready: Promise<void> | null = null;
function ensureReady() {
  // Instantiation only — safe per request, memoized so a warm isolate pays nothing.
  ready ??= (async () => {
    await initYoga(YOGA_MODULE);
    await initWasm(RESVG_MODULE);
  })();
  return ready;
}

export async function renderCard(element: unknown): Promise<Uint8Array> {
  await ensureReady();
  const svg = await satori(element, {
    width: 1200, height: 630,
    fonts: [{ name: 'Your Font', data: FONT, weight: 400, style: 'normal' }],
  });
  return new Resvg(svg).render().asPng();
}
```

Use `satori/standalone`, not the default entry — the default bundles yoga's wasm and compiles it lazily at runtime, which lands in the forbidden window.

## Wall 2: deployed SSR returns an empty `<head>`

With `web.output: "server"`, per-request head metadata (`generateMetadata`, `<Head>`) renders correctly under local `expo serve` but comes back **empty from the deployed worker** — the body renders, the head doesn't. A perfect image endpoint is useless if no tag points at it.

Bypass it: serve the crawler-facing HTML from an **API route**, which is a worker you control end to end. Write the head yourself.

```ts
// app/p/[id]+api.ts
export function GET(request: Request, { id }: { id: string }) {
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return new Response('Not found', { status: 404 });
  const origin = new URL(request.url).origin;
  const target = `${origin}/p?d=${id}`;   // the real interactive page

  return new Response(`<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<meta property="og:image" content="${origin}/og/${id}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
</head><body>
<noscript><a href="${escapeHtml(target)}">Continue</a></noscript>
<script>location.replace(${JSON.stringify(target)})</script>
</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
```

**Send a 200 with a client-side redirect, never a 302.** Some link previewers follow redirects and would land on the destination's generic card. A 200 whose head already carries the tags makes them stop and read.

Always validate the param before echoing it into HTML — it's untrusted input on a page you're hand-assembling.

Note: static routes stay *prerendered* under `output: "server"`, so their build-time heads are unaffected. This bug only hits per-request metadata.

## Wall 3: the CDN cache key is query-blind

EAS Hosting caches HTML with a cache key that ignores the query string, so `?d=A` and `?d=B` collide on one entry — every item unfurls with whichever cached first.

**Put the payload in a route param, not a query param.** `/og/[id]` and `/p/[id]` vary the key by path.

This is strictly better than defeating the cache with `no-store`: an id deterministically produces one card, so the URL is *content-addressed*. Lean in:

```ts
'cache-control': 'public, max-age=31536000, immutable'
```

Each item then renders exactly once, ever, and the CDN serves every subsequent hit (`cache-status: EAS; hit`).

If your payload is an encoded blob, check its alphabet is path-safe. Unpadded base64url (`A-Za-z0-9-_`) already is; standard base64 is not (`/`, `+`, `=`).

## Wall 4: `request.url` is the deployment hostname, not your domain

Inside the worker, `new URL(request.url).origin` reports the **per-deployment**
host (`yoursite--<id>.expo.app`) even when the request arrived via your
production domain. Build `og:image` from it and every shared link advertises a
hostname the next deploy rotates away from — the unfurl works today and breaks
later, which is the worst failure shape.

Pin the canonical origin instead:

```ts
const CANONICAL_ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://yoursite.com';

function siteOrigin(request: Request): string {
  const origin = new URL(request.url).origin;
  const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  return (isLocal ? origin : CANONICAL_ORIGIN).replace(/\/$/, '');
}
```

Localhost keeps self-referencing so `expo serve` works, and the
`EXPO_PUBLIC_*` var (inlined at build time) lets a preview deploy point at
itself. Apply it to `og:image`, `og:url`, canonical, *and* the redirect target
— it's easy to fix one and miss the others.

Catch it by asserting on the value, not just the presence of the tag:

```bash
curl -s "$PROD/p/$PAYLOAD" | grep -oE 'og:image" content="[^"]*"'
```

## Wall 5: a URL is either a server route or a client page — never both

This one falls out of wall 2 and catches you twice.

`/p/[d]` has to be an **API route**, because that's the only way to get
per-request `<head>` tags. Which means there is no *client* route matching that
path. Expo Router's client router doesn't know the path exists.

**Trap A — in-site links.** Update your own pages to link the path shape (a
link copied off your homepage should unfurl like a real share link, and the
query form can't — wall 3). But if you use the router's `<Link>`, clicking it
does client-side navigation, matches nothing, and renders **Unmatched Route
without ever making a network request**. Pasting the same URL works fine, which
makes this maddening to diagnose.

Use a real anchor — but don't actually let it navigate. Following the href
costs **two full document loads** (head-only HTML, then the redirect), which
visibly blinks even with the canvas pre-painted, because the browser tears down
and rebuilds twice. Keep the shareable href for copy-link and cmd-click, and
intercept the plain click into a client-side navigation:

```tsx
{/* Not expo-router's <Link>: this path is served by an API route and has no
    client route, so SPA nav would match nothing and render Unmatched Route. */}
<Text
  accessibilityRole="link"
  {...({
    href: `/p/${payload}`,               // the real, shareable URL
    onClick: (event) => {
      // Leave modified clicks alone — they should open the real URL.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      router.push(`/p?d=${payload}`);    // one in-app navigation, no teardown
    },
  } as object)}
  style={[styles.button, styles.buttonLabel]}
>
  Open an example shared link
</Text>
```

react-native-web renders `accessibilityRole="link"` + `href` as an `<a>`, and
container and text styles can be merged onto the one element. You get the
shareable URL on right-click-copy, a new tab on cmd-click, and an instant
in-app transition on a normal click — the redirect path stays reserved for
people arriving from outside.

**Trap B — humans need somewhere real to land.** Your API route returns
head-only HTML, so a person following the link has to be moved to a URL the
client app actually has a route for — the legacy `/p?d=<payload>` page. Hence
the 200 + `location.replace` from wall 2. Crawlers stop at the head; humans
continue.

The cost is one extra round trip, and the URL bar normalizing to `?d=` after
landing. If that matters, the upgrade is to return the *real* prerendered app
shell from the API route with your head injected, plus a synchronous
`history.replaceState(null, '', '/p?d=' + payload)` in `<head>` before the
bundle loads — the router then boots already matching, with no second request.
You'll need the shell embedded as a generated string module, since Metro won't
import `.html` as source any more than it will `.wasm`.

### The hand-off flashes white unless you pre-paint the canvas

Two cold page loads back to back makes this impossible to miss on a dark site.
**Expo Router's default root HTML sets neither `color-scheme` nor a background
on `<html>`**, so the browser paints its default *white* canvas before a single
byte of CSS is parsed — once per navigation.

Fix it in both documents. For the app, add `app/+html.tsx` (defining it
replaces the default document wholesale, so reproduce the rest):

```tsx
import { ScrollViewStyleReset } from 'expo-router/html';

const FIRST_PAINT = `html,body{background-color:${color.ground};}`;

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="color-scheme" content="dark" />
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: FIRST_PAINT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
```

Give the interim page the same treatment inline — `<html style="background-color:#000">`,
`<meta name="color-scheme" content="dark">`, and a `<style>` rule — and check
the value actually matches your app's background token. It's easy to reach for
a near-black from a design file (`#08080A`) when the app itself renders
`#000000`; the mismatch reads as a flicker even when nothing is white.

`color-scheme: dark` earns its place beyond the canvas: it also keeps form
controls and scrollbars from rendering light.

## Deploying

```bash
npx expo export -p web
npx eas-cli@latest deploy            # preview URL
npx eas-cli@latest deploy --prod     # production
```

Verify on the preview URL before production:

```bash
curl -sD- -o card.png "$URL/og/$PAYLOAD.png" | head -5   # 200 + image/png
curl -s "$URL/p/$PAYLOAD" | grep -oE '<meta property="og:[^>]*>'
curl -so /dev/null -D- "$URL/og/$PAYLOAD.png" | grep -i cache-status   # 2nd hit → hit
```

Also confirm existing pages kept their meta — grep for `og:image` allowing for `data-rh="true"` appearing *before* the `property` attribute, or you'll diagnose a regression that isn't there.

## Budget

Real numbers from a working deployment (1200×630 card, satori + resvg):

| | |
|---|---|
| resvg wasm | 2.4 MB → 3.2 MB base64 |
| yoga wasm | 70 KB → 93 KB base64 |
| two TTFs | ~193 KB → ~257 KB base64 |
| built API route | 4.1 MB raw, ~1.3 MB gzipped |
| startup compile (both modules) | ~19 ms |
| render (satori 22 ms + resvg 44 ms) | ~70 ms |

Comfortably inside Workers' script-size and CPU limits, and `immutable` means you pay the render once per item.

## Build-pipeline traps

The generated base64 directory is gitignored, which means **every entry point
must run the generator** — `start`, `export`, `typecheck`, and `deploy` each
have their own chain, and missing it from one produces an unresolvable import
on a clean checkout. It's easy to wire `export` and forget `deploy`, which
fails only in CI or on someone else's machine.

Make your deploy guard prove the wasm actually landed, not just that a bundle
exists — a build that skipped the generator yields a route that resolves but
cannot render:

```js
const ogFn = join(dist, 'server', '_expo', 'functions', 'og', '[d]+api.js');
if (statSync(ogFn).size / 1048576 < 3) throw new Error('embedded wasm missing');
```

Note the built filename keeps the `+api` suffix (`[d]+api.js`), and switching
to `web.output: "server"` **moves prerendered HTML from `dist/` into
`dist/server/`** — any existing guard checking `dist/index.html` will start
failing for reasons unrelated to what it was written to catch. Static assets
(`public/`, `.well-known/`) still land in `dist/` and `dist/client/`, so
universal-link files keep working.

## Checklist

- [ ] Card design in a pure module, shared by build-time and request-time renderers
- [ ] Binaries generated as base64 source into a gitignored dir, chained into export
- [ ] `WebAssembly.Module` built at module top level, instantiated lazily
- [ ] `satori/standalone` (not the default entry)
- [ ] TTF fonts, not woff2
- [ ] Payload in a route param; `immutable` cache headers
- [ ] Crawler HTML from an API route; 200 + client redirect, never 302
- [ ] Route param validated before being echoed into HTML
- [ ] Canonical origin pinned — never derived from `request.url`
- [ ] In-site links keep the shareable path in `href` but intercept plain clicks into `router.push` — a real `<a>`, never the router's `<Link>`, and never an actual navigation
- [ ] `+html.tsx` sets `color-scheme` and an `<html>` background, and the interim page matches the app's real background token
- [ ] Generator wired into *every* script: start, export, typecheck, deploy
- [ ] Deploy guard asserts the embedded wasm size, and knows HTML moved to `dist/server/`
- [ ] Undecodable payload falls back to a static card rather than erroring
- [ ] Verified on a preview deploy before `--prod`, asserting tag *values* not just presence

## Debugging locally without deploying

`expo serve` runs the export in Node, so top-level wasm compiles trivially there and it will **not** reproduce the worker restriction. To test the real semantics, run the route under `workerd` via wrangler — the same binary Cloudflare deploys:

```
npx wrangler dev --local
```

That reproduces `Wasm code generation disallowed by embedder` faithfully, and is the cheapest way to confirm the top-level-scope trick before spending a deploy.
