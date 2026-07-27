/**
 * GET /og/<payload>.png — the per-pattern unfurl card, rendered on demand.
 *
 * The payload lives in the PATH, not a query string, on purpose: EAS Hosting's
 * CDN cache key is query-blind, so `?d=A` and `?d=B` would collide on one
 * cached entry. A path segment varies the key, and since a payload
 * deterministically produces one card the URL is content-addressed — so we
 * lean into the cache with `immutable` rather than fighting it with no-store.
 *
 * The codec emits unpadded base64url (A-Za-z0-9-_), which is already a legal
 * path segment, so no escaping is involved.
 */
import { decodePattern } from '@/core/share-codec';

import { sharedPatternCard } from '../../lib/og-cards';
import { IMMUTABLE_CACHE, renderCard } from '../../lib/og-render';

export async function GET(_request: Request, { d }: { d: string }) {
  // Tolerate the .png suffix so the URL looks like an image to humans/crawlers.
  const payload = d.replace(/\.png$/, '');

  let pattern;
  try {
    pattern = decodePattern(payload);
  } catch {
    // Corrupt or truncated link — fall back to the build-time generic card
    // rather than serving a broken image.
    return Response.redirect(new URL('/og-p.png', _request.url).toString(), 302);
  }

  try {
    const png = await renderCard(sharedPatternCard(pattern, []));
    return new Response(png as BodyInit, {
      headers: {
        'content-type': 'image/png',
        'cache-control': IMMUTABLE_CACHE,
        'content-length': String(png.length),
      },
    });
  } catch (error) {
    console.error('og render failed', error);
    return Response.redirect(new URL('/og-p.png', _request.url).toString(), 302);
  }
}
