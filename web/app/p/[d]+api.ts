/**
 * GET /p/<payload> — the crawler-facing page for a shared pattern.
 *
 * This exists because deployed Expo SSR returns an empty <head> on EAS Hosting
 * (generateMetadata and <Head> both produce nothing, though the body renders;
 * works under local `expo serve`). An API route is a worker we control end to
 * end, so we write the head ourselves and sidestep head injection entirely.
 *
 * Humans are moved along to the real interactive page at /p?d=<payload> with a
 * 200 + client-side redirect, NOT a 302 — some link previewers follow
 * redirects, and they'd land on the static page's generic card. A 200 whose
 * head already carries the per-pattern tags makes them stop and read.
 */
import { decodePattern } from '@/core/share-codec';

const SAFE = /^[A-Za-z0-9_-]+$/;

/**
 * The worker sees the PER-DEPLOYMENT hostname in `request.url`
 * (euxy--<id>.expo.app) even when the request arrived via euxy.expo.app — so
 * deriving the origin from the request makes shared links advertise a URL that
 * the next deploy rotates away from. Pin the canonical origin instead, the same
 * way app/_layout.tsx hardcodes its tags. Localhost still self-references so
 * `expo serve` works, and EXPO_PUBLIC_SITE_ORIGIN (inlined at build time) lets
 * a preview deploy point at itself.
 */
const CANONICAL_ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://euxy.expo.app';

function siteOrigin(request: Request): string {
  const origin = new URL(request.url).origin;
  const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  return (isLocal ? origin : CANONICAL_ORIGIN).replace(/\/$/, '');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET(request: Request, { d }: { d: string }) {
  // The payload is echoed into HTML and a URL; only ever accept the codec's
  // own alphabet.
  if (!SAFE.test(d)) return new Response('Not found', { status: 404 });

  const origin = siteOrigin(request);
  const target = `${origin}/p?d=${d}`;
  const image = `${origin}/og/${d}.png`;

  let title = 'Someone sent you a euxy pattern';
  let description = 'Play it in your browser — no app needed.';
  try {
    const p = decodePattern(d);
    const steps = Math.max(...p.lanes.map((l) => l.length));
    title = `${p.name} — a euxy pattern`;
    description = `${p.lanes.length} lanes · ${p.bpm} BPM · ${steps} steps. Play it in your browser — no app needed.`;
  } catch {
    // Undecodable payload still gets a sane generic unfurl.
  }

  const html = `<!DOCTYPE html>
<html lang="en" style="background-color:#000">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<!-- Same canvas as the rest of the site (color.ground) declared before any
     paint, so the hand-off to /p?d= never flashes white. -->
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<style>html,body{background-color:#000;margin:0}</style>
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="euxy">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:url" content="${escapeHtml(`${origin}/p/${d}`)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<link rel="canonical" href="${escapeHtml(target)}">
</head>
<body style="color:#98989F;font-family:ui-monospace,Menlo,monospace">
<noscript><p style="padding:24px">Open <a style="color:#F6F4F4" href="${escapeHtml(target)}">${escapeHtml(target)}</a> to play this pattern.</p></noscript>
<script>location.replace(${JSON.stringify(target)})</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // Content-addressed like the image: this payload always yields this HTML.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
