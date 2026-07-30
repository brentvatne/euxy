/**
 * GET /c/<channel> — what a channel link resolves to in a browser.
 *
 * With the app installed and `/c*` in .well-known/apple-app-site-association,
 * iOS hands this path straight to euxy and nobody sees this page. It exists for
 * every other case: no app on this device, a desktop browser, a link previewer,
 * or an association Apple has not fetched yet.
 *
 * There is no auto-redirect to `euxy://`. If iOS had wanted to open the app it
 * already would have; firing the scheme from here only produces "Safari cannot
 * open the page" on a device without the app. The page states the channel and
 * leaves the choice to whoever is reading — the same reason /p/<payload> hands
 * humans a real page instead of bouncing them.
 *
 * An API route, not a screen, because deployed Expo SSR returns an empty <head>
 * on EAS Hosting; see app/p/[d]+api.ts for the full account.
 */
import { channelLink, parseChannelLink } from '@/lib/channel-link';

import { TESTFLIGHT_JOIN_URL } from '../../lib/links';

const CANONICAL_ORIGIN = process.env.EXPO_PUBLIC_SITE_ORIGIN ?? 'https://euxy.expo.app';

function siteOrigin(request: Request): string {
  const origin = new URL(request.url).origin;
  const isLocal = origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1');
  return (isLocal ? origin : CANONICAL_ORIGIN).replace(/\/$/, '');
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function GET(request: Request, { channel }: { channel: string }) {
  // The name is echoed into HTML, a URL, and a scheme link. Only ever accept
  // what the app itself accepts as a channel.
  const channelName = parseChannelLink(channel);
  if (!channelName) return new Response('Not found', { status: 404 });

  const origin = siteOrigin(request);
  const safeChannel = escapeHtml(channelName);
  const title = `euxy · channel ${channelName}`;
  const description = `Opens euxy and switches this install to the ${channelName} preview channel.`;

  const html = `<!DOCTYPE html>
<html lang="en" style="background-color:#000">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="theme-color" content="#000000">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(description)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="euxy">
<meta property="og:title" content="${escapeHtml(title)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:image" content="${escapeHtml(`${origin}/qr/${channelName}.png`)}">
<meta property="og:url" content="${escapeHtml(`${origin}/c/${channelName}`)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escapeHtml(title)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
<meta name="twitter:image" content="${escapeHtml(`${origin}/qr/${channelName}.png`)}">
<link rel="canonical" href="${escapeHtml(`${origin}/c/${channelName}`)}">
<meta name="robots" content="noindex,nofollow">
<style>
  /* Border-box everywhere: main sets an explicit width, so under the default
     content-box its 1.25rem side padding lands OUTSIDE that width and the page
     is 2.5rem wider than the viewport on any screen under 34rem. */
  *,*::before,*::after{box-sizing:border-box}
  html,body{background-color:#000;margin:0;max-width:100%;overflow-x:hidden}
  /* A channel name is one unbroken token up to 64 characters (lib/channel-link
     CHANNEL), which no phone can fit on a line — break it rather than let the
     heading and the inline code spans push the page sideways. */
  body{color:#98989F;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;line-height:1.6;
       overflow-wrap:anywhere}
  main{width:min(34rem,100%);margin:0 auto;padding:3rem 1.25rem 4rem}
  h1{color:#F6F4F4;font-size:1.5rem;letter-spacing:-0.02em;margin:0 0 .25rem}
  .eyebrow{color:#6C6C71;font-size:.6875rem;letter-spacing:.12em;text-transform:uppercase;margin:0 0 1.25rem}
  code{color:#F6F4F4;background:#141416;border:1px solid #26262A;border-radius:.375rem;padding:.1rem .35rem}
  .card{border:1px solid #26262A;border-radius:.875rem;background:#0C0C0E;padding:1.25rem;margin:1.5rem 0}
  .open{display:block;padding:.9rem 1rem;border-radius:.75rem;background:#F6F4F4;color:#000;
        font-weight:700;text-align:center;text-decoration:none}
  a{color:#F6F4F4}
  .case{color:#6C6C71;margin-top:2rem}
  ol{padding-left:1.25rem;margin:.5rem 0 0}
  li{margin:.35rem 0}
  .qr{display:block;width:9rem;height:9rem;margin:0 auto 1rem;border-radius:.5rem}
</style>
</head>
<body>
<main>
  <p class="eyebrow">EAS Update channel</p>
  <h1>${safeChannel}</h1>
  <p>Opening this link in euxy switches this install to <code>${safeChannel}</code> and loads that channel's latest compatible update.</p>
  <div class="card">
    <img class="qr" src="${escapeHtml(`${origin}/qr/${channelName}.png`)}" width="144" height="144"
         alt="QR code for the ${safeChannel} channel link">
    <a class="open" href="${escapeHtml(channelLink(channelName))}">Open in euxy</a>
  </div>
  <p class="case">If that button does nothing, one of two things is true.</p>
  <p><strong>euxy is not on this device.</strong>
     <a href="${escapeHtml(TESTFLIGHT_JOIN_URL)}">Join the TestFlight beta</a>, install euxy,
     then open this link again. There is nothing to enter by hand until the app is installed.</p>
  <p><strong>euxy is installed, but iOS sent the link here instead of to the app.</strong>
     The app association can take a while to reach a device. Enter the channel by hand:</p>
  <ol>
    <li>Open euxy and go to the MIDI tab.</li>
    <li>Press and hold the <strong>MIDI Diagnostics</strong> header to reveal Channel Surf.</li>
    <li>Enter <code>${safeChannel}</code>.</li>
  </ol>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html; charset=utf-8',
      // A channel name always yields this page.
      'cache-control': 'public, max-age=31536000, immutable',
    },
  });
}
