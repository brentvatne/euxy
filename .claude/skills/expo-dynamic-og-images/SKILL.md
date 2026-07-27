---
name: expo-dynamic-og-images
description: Give every shared link its own preview image — a card rendered per item at request time with satori + resvg, from an Expo Router API route on EAS Hosting / Cloudflare Workers. Use when someone says "every shared link unfurls with the same image", "I want the document/profile/item in the link preview", "dynamic og:image", or "@vercel/og but on Expo"; also when debugging "Wasm code generation disallowed by embedder", a deployed route whose <head> comes back empty though the body renders, link previews that all show whichever item was cached first, or Unmatched Route on a path an API route serves.
---

# Dynamic OG Images on Expo + EAS Hosting

Render a unique `og:image` per item — a shared document, a profile, a saved
pattern — on demand in the EAS Hosting worker, so every shared link unfurls
with its own card.

Verified end to end on Expo 57.0.8 / Metro 0.84.4, deployed to EAS Hosting
(Cloudflare Workers).

## What you're building

```
lib/og-card.tsx                  the card design (pure module)
lib/og-render.ts                 wasm setup + satori → resvg → PNG
scripts/generate-binaries.mjs    wasm + fonts as base64 source modules
app/og/[id]+api.ts               GET → image/png
app/share/[id]+api.ts            GET → HTML whose <head> points at the image
app/view/[id].tsx                the actual app page people land on
```

The stack is `satori` (element tree → SVG) + `@resvg/resvg-wasm` (SVG → PNG) —
what `@vercel/og` wraps. Its wrapper is edge-runtime-specific, so use the two
libraries directly.

API routes require server output, so set that first:

```json
{ "expo": { "web": { "output": "server" } } }
```

### Two facts that drive every odd decision below

1. **Workers refuse wasm compilation at request time, but allow it in module
   top-level scope.** Instantiating an already-compiled `WebAssembly.Module`
   per request is fine — only compilation is gated.
2. **A URL is either a server route or a client page, never both.** The
   shareable URL must be a server route to emit per-item `<head>` tags, so it
   can't also be the page your app renders. Hence `/share/[id]` and
   `/view/[id]` being separate.

## 1. The card design

Keep it a **pure module** — no `fs`, no `fetch`, no Node builtins — so it can
also render at build time if you want a static fallback card. satori takes
plain objects, so JSX or literals both work.

## 2. Generate the binaries as base64 source

Both libraries need wasm, and **Metro has no wasm pipeline**: `wasm` is in
neither `assetExts` nor `sourceExts`. Forcing it into `assetExts` makes the
import resolve to a URL *string* rather than a `WebAssembly.Module`, and the
file is never emitted, so that URL 404s. Putting it in `public/` doesn't help
either — you'd be back to fetching bytes and compiling them at request time,
which is the thing the worker refuses.

A base64 string in a `.ts` file is just source, so it always bundles.

```js
// scripts/generate-binaries.mjs — output is gitignored
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

Fonts get the same treatment — there's no filesystem in a worker. Use **TTF**;
satori cannot read woff2.

## 3. The renderer

Compile at import, instantiate lazily.

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

// Top-level scope — the only place the worker permits wasm codegen.
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

Import `satori/standalone`, **not** the default entry — the default bundles
yoga's wasm and compiles it lazily at runtime, landing in the forbidden window.

## 4. The image route

Put the id in a **route param, not a query param**: EAS Hosting's CDN cache key
ignores the query string, so `?id=A` and `?id=B` collide on one cached entry
and every item unfurls with whichever cached first.

A path param also makes the URL *content-addressed* — one id always produces
the same card — so lean into the cache rather than fighting it with `no-store`:

```ts
// app/og/[id]+api.ts
export async function GET(request: Request, { id }: { id: string }) {
  const item = await lookup(id);
  if (!item) return Response.redirect(new URL('/og-fallback.png', request.url).toString(), 302);

  const png = await renderCard(card(item));
  return new Response(png as BodyInit, {
    headers: {
      'content-type': 'image/png',
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
```

Each item then renders exactly once, ever. If your id is an encoded blob, check
its alphabet is path-safe: unpadded base64url (`A-Za-z0-9-_`) is, standard
base64 is not (`/`, `+`, `=`).

## 5. The shareable route

This is the URL you hand out. It must be an API route, because **deployed SSR
returns an empty `<head>`** — `generateMetadata` and `<Head>` work under local
`expo serve` but come back empty from the worker, body intact. An API route is
a worker you control end to end, so write the head yourself and send people on
to the real page.

```ts
// app/share/[id]+api.ts
export function GET(request: Request, { id }: { id: string }) {
  // Untrusted input on a page you're hand-assembling — validate before echoing.
  if (!/^[A-Za-z0-9_-]+$/.test(id)) return new Response('Not found', { status: 404 });

  const origin = siteOrigin(request);          // see below
  const target = `${origin}/view/${id}`;

  return new Response(`<!DOCTYPE html>
<html lang="en" style="background-color:#000">
<head>
<meta charset="utf-8">
<meta name="color-scheme" content="dark">
<style>html,body{background-color:#000;margin:0}</style>
<title>${escapeHtml(title)}</title>
<meta property="og:image" content="${origin}/og/${id}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
</head>
<body>
<noscript><a href="${escapeHtml(target)}">Continue</a></noscript>
<script>location.replace(${JSON.stringify(target)})</script>
</body></html>`, { headers: { 'content-type': 'text/html; charset=utf-8' } });
}
```

**Send 200 + a client-side redirect, never a 302.** Some link previewers follow
redirects and would land on the destination's generic card. A 200 whose head
already carries the tags makes them stop and read.

### Pin the canonical origin

Inside the worker `new URL(request.url).origin` reports the **per-deployment**
host (`yoursite--<id>.expo.app`) even for requests that arrived via your
production domain. Derive `og:image` from it and every shared link advertises a
hostname the next deploy rotates away from — works today, breaks later.

```ts
const CANONICAL_ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://yoursite.com';

function siteOrigin(request: Request): string {
  const origin = new URL(request.url).origin;
  const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  return (isLocal ? origin : CANONICAL_ORIGIN).replace(/\/$/, '');
}
```

Localhost keeps self-referencing so `expo serve` works, and the `EXPO_PUBLIC_*`
var (inlined at build time) lets a preview deploy point at itself. Apply it to
`og:image`, `og:url`, canonical, **and** the redirect target — easy to fix one
and miss the others.

## 6. Linking to it from your own pages

A link copied off your own site should unfurl like any other share link, so
link `/share/[id]`, not the internal page. But that path has no client route,
so the router's `<Link>` would match nothing and render **Unmatched Route
without making a network request** — while pasting the same URL works fine,
which makes it confusing to diagnose.

Use a real anchor, and don't let it navigate: following the href costs two full
document loads (head-only HTML, then the redirect), which visibly blinks.

```tsx
<Text
  accessibilityRole="link"
  {...({
    href: `/share/${id}`,                // the real, shareable URL
    onClick: (event) => {
      // Leave modified clicks alone — they should open the real URL.
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      if (event.button !== undefined && event.button !== 0) return;
      event.preventDefault();
      router.push(`/view/${id}`);        // one in-app navigation, no teardown
    },
  } as object)}
  style={[styles.button, styles.buttonLabel]}
>
  Open an example
</Text>
```

react-native-web renders `accessibilityRole="link"` + `href` as an `<a>`, and
container and text styles merge onto the one element. You get the shareable URL
on copy-link, a new tab on cmd-click, and an instant transition on a normal
click.

## 7. Hand the address bar back to the canonical URL

The client redirect in step 5 means every human ends up on the internal page —
`/view/[id]` is what the address bar shows, so it's what people copy. Re-shared,
it unfurls with the generic card, and the architecture guarantees it: *no one*
ever has the canonical URL in their address bar unless you put it back.

On the internal page, rewrite history to the shareable form once the item
actually loads. **A single `replaceState` silently loses a race**: expo-router's
linking layer re-syncs the address bar from navigation state after hydration —
twice in production, and the second sync lands ~20ms *after* a mount effect
(parent effects run after children's), stomping the rewrite back. It looks like
the code never ran. Re-assert briefly until the router goes quiet:

```tsx
// app/view/[id].tsx
useEffect(() => {
  if (!item || typeof window === 'undefined') return;
  const rewrite = () => {
    if (!window.location.pathname.startsWith('/share/')) {
      // Preserve history.state — the router stores {id} there for popstate.
      window.history.replaceState(window.history.state, '', `/share/${id}`);
    }
  };
  rewrite();
  const interval = setInterval(rewrite, 150);
  const stop = setTimeout(() => clearInterval(interval), 1600);
  return () => { clearInterval(interval); clearTimeout(stop); };
}, [item, id]);
```

Pure history rewrite — no navigation, router state untouched. A later reload
replays the (cached, `immutable`) share-route hop, the same two-load cost as
clicking a shared link. Rewrite only on successful load, so an error page keeps
the real broken URL for debugging.

To see the race for yourself (or verify the fix), trace URL writes with an
init script that wraps `history.replaceState` to log `(t, url, stack)` into
`window.__urlLog` before the page's scripts run — e.g.
`agent-browser --init-script trace.js open <share-url>`, then read the log.
The stomp shows up as router-originated writes bracketing yours.

**The rewrite leaves a trap in history: back/forward now dead-ends on
Unmatched Route.** `/share/<id>` sits in the history stack, but only the
*server* can answer that path. A same-document traversal (back or forward past
any in-app `<Link>` navigation) replays it through the client router — no
network request — which has no route for it. Catch it in `+not-found.tsx` and
bounce back to the routable form; the internal page then re-canonicalizes and
the loop self-heals on every traversal:

```tsx
// app/+not-found.tsx
const SHARE_PATH = /^\/share\/([A-Za-z0-9_-]+)$/;   // same alphabet the API route accepts

export default function NotFound() {
  const payload = SHARE_PATH.exec(usePathname())?.[1];
  useEffect(() => {
    if (payload) router.replace(`/view/${payload}`); // or the query form your page reads
  }, [payload]);
  if (payload) return <View style={{ flex: 1 }} />;  // no 404 flash while redirecting
  return <RealNotFoundPage />;
}
```

While you're in the share route, check its `rel="canonical"`: it must point at
the shareable URL itself, matching `og:url` — not at the redirect target. The
target is sitting right there in a variable, so pointing canonical at the
internal page is an easy slip, and it tells search engines the non-unfurlable
form is the real one.

## 8. Stop the first-paint flash

**Expo Router's default root HTML sets neither `color-scheme` nor a background
on `<html>`**, so the browser paints its default white canvas before a byte of
CSS is parsed — once per cold navigation, and people arriving from outside get
two in a row.

Add `app/+html.tsx`. Defining it replaces the default document wholesale, so
reproduce the rest:

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

Use your app's real background token here and the identical value in the
shareable route's inline styles — a near-miss between the two reads as a
flicker even when nothing is white.

## 9. Wire the build scripts

The generated directory is gitignored, so **every script that bundles must run
the generator** — `start`, `export`, `typecheck`, and `deploy` each have their
own chain. Wiring `export` and forgetting `deploy` fails only in CI or on
someone else's machine.

Make your deploy guard prove the wasm actually landed, since a build that
skipped the generator yields a route that resolves but cannot render:

```js
const ogFn = join(dist, 'server', '_expo', 'functions', 'og', '[id]+api.js');
if (statSync(ogFn).size / 1048576 < 3) throw new Error('embedded wasm missing');
```

The built filename keeps its `+api` suffix, and under server output prerendered
HTML lands in `dist/server/` while static assets go to `dist/` and
`dist/client/`.

## 10. Deploy and verify

```bash
npx expo export -p web
npx eas-cli@latest deploy            # preview URL
npx eas-cli@latest deploy --prod     # production
```

Check on the preview URL first, asserting on tag **values**, not just presence:

```bash
curl -sD- -o card.png "$URL/og/$ID.png" | head -5              # 200 + image/png
curl -s "$URL/share/$ID" | grep -oE 'og:image" content="[^"]*"' # right host?
curl -so /dev/null -D- "$URL/og/$ID.png" | grep -i cache-status # 2nd hit → hit
```

## Budget

Real numbers from a working deployment (1200×630 card):

| | |
|---|---|
| resvg wasm | 2.4 MB → 3.2 MB base64 |
| yoga wasm | 70 KB → 93 KB base64 |
| two TTFs | ~193 KB → ~257 KB base64 |
| built API route | 4.1 MB raw, ~1.3 MB gzipped |
| startup compile (both modules) | ~19 ms |
| render (satori 22 ms + resvg 44 ms) | ~70 ms |

Comfortably inside Workers' script-size and CPU limits, and `immutable` means
you pay the render once per item.

## Troubleshooting

| Symptom | Cause |
|---|---|
| `CompileError: Wasm code generation disallowed by embedder` | Compiling wasm inside a request handler. Move `new WebAssembly.Module(...)` to module top-level scope; instantiate per request. |
| The wasm import is a string, not a Module | Metro treated it as an asset. Ship it as base64 source instead (step 2). |
| Asset URL for the `.wasm` 404s | Metro never emitted it. Same fix. |
| Deployed page has an empty `<head>`, body renders fine | Deployed SSR drops per-request metadata. Write the head from an API route (step 5). |
| Every link unfurls with the same item's card | Query-blind CDN cache key. Move the id into a route param (step 4). |
| `og:image` points at `yoursite--<id>.expo.app` | Derived from `request.url`. Pin the canonical origin (step 5). |
| Unmatched Route clicking an in-site link, but pasting the URL works | The router's `<Link>` did SPA navigation to a path with no client route. Use a real `<a>` and intercept the click (step 6). |
| URL copied from the address bar unfurls with the generic card | Humans land on the internal page after the redirect and copy that. `replaceState` the shareable URL back on load (step 7). |
| White flash on navigation | No `color-scheme` / `<html>` background before CSS loads (step 8). |
| Works locally, unresolvable import in CI | The generator isn't wired into that script (step 9). |

## Testing locally without deploying

`expo serve` runs the export in Node, where top-level wasm compiles trivially —
it will **not** reproduce the worker restriction. For real semantics, run the
route under `workerd` via wrangler, the same binary Cloudflare deploys:

```bash
npx wrangler dev --local
```

That reproduces `Wasm code generation disallowed by embedder` faithfully, and
is the cheapest way to confirm the top-level-scope approach before spending a
deploy.

## Checklist

- [ ] `web.output: "server"`
- [ ] Card design in a pure module
- [ ] Binaries generated as base64 source into a gitignored dir
- [ ] `WebAssembly.Module` built at module top level, instantiated lazily
- [ ] `satori/standalone`, not the default entry
- [ ] TTF fonts, not woff2
- [ ] Id in a route param; `immutable` cache headers
- [ ] Head written by an API route; 200 + client redirect, never 302
- [ ] Route param validated before being echoed into HTML
- [ ] Canonical origin pinned — never derived from `request.url`
- [ ] Internal page rewrites the address bar back to the shareable URL on successful load
- [ ] Share route’s `rel=canonical` points at itself, matching `og:url`
- [ ] In-site links: real `<a>` with the shareable href, plain clicks intercepted into `router.push`
- [ ] `+html.tsx` sets `color-scheme` and an `<html>` background matching the app's real token
- [ ] Generator wired into every script: start, export, typecheck, deploy
- [ ] Deploy guard asserts the embedded wasm size
- [ ] Unknown id falls back to a static card rather than erroring
- [ ] Verified on a preview deploy before `--prod`
