/**
 * GET /qr/<channel>.png — the QR code an agent workflow puts in a pull request
 * so a phone can join that PR's EAS Update channel by pointing a camera at it.
 *
 * A PNG rather than the SVG lib/qr.ts produces: GitHub proxies every remote
 * image through camo, and camo refuses SVG, so an <img> pointing at an SVG
 * renders as nothing in a PR body.
 *
 * The channel is a PATH segment, like /og/<payload>.png, because EAS Hosting's
 * CDN cache key ignores the query string — `?channel=a` and `?channel=b` would
 * collide on one cached image. One channel always yields one code, so the URL is
 * content-addressed and takes the immutable cache.
 */
import { channelUniversalLink, parseChannelLink } from '@/lib/channel-link';

import { qrSvg } from '../../lib/qr';
import { IMMUTABLE_CACHE, renderSvg } from '../../lib/og-render';

/**
 * 296px = 37 modules x 8px for the common case (a 29-module code plus its quiet
 * zone). Whole-pixel modules at the size PR bodies display, and big enough that
 * a longer channel name still scans after the code gains a version.
 */
const SIZE = 296;

export async function GET(_request: Request, { channel }: { channel: string }) {
  // Tolerate the .png suffix so the URL reads as an image to humans.
  const channelName = parseChannelLink(channel.replace(/\.png$/, ''));
  // No fallback image: a QR that encodes the wrong thing is worse than a broken
  // image, because it looks like it worked.
  if (!channelName) return new Response('Not found', { status: 404 });

  try {
    const png = await renderSvg(qrSvg(channelUniversalLink(channelName), { size: SIZE }));
    return new Response(png as BodyInit, {
      headers: {
        'content-type': 'image/png',
        'cache-control': IMMUTABLE_CACHE,
        'content-length': String(png.length),
      },
    });
  } catch (error) {
    console.error('qr render failed', error);
    return new Response('QR code unavailable', { status: 500 });
  }
}
