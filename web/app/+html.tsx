/**
 * Root HTML for every statically rendered page. Node-only — no DOM, no browser
 * APIs, and no global CSS imports (those belong in _layout).
 *
 * It exists for one reason: without `color-scheme` and a background on <html>,
 * the browser paints its default WHITE canvas before any CSS applies. On a
 * pure-black site that's a visible flash on every cold navigation — most
 * noticeably when /p/<payload> hands off to /p?d=<payload>.
 *
 * Everything else here is Expo Router's default document, reproduced because
 * defining this file replaces it wholesale.
 */
import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

import { color } from '@/theme/tokens';

// Paint the canvas before a single byte of CSS or JS is parsed. `color-scheme`
// also makes form controls and scrollbars render dark instead of flashing light.
// zoom: RNW styles are absolute px, so a root zoom is the one knob that scales
// type, chips, the player, and spacing together ("everything, just a touch").
const FIRST_PAINT = `html,body{background-color:${color.ground};}html{zoom:1.08;}`;

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
