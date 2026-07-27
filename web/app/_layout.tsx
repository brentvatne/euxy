import { Slot } from 'expo-router';
import Head from 'expo-router/head';
import { useSyncExternalStore } from 'react';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color } from '@/theme/tokens';
import { webAttrs } from '../components/ui';

const subscribeNever = () => () => {};

export default function Layout() {
  // False until hydration completes — the render where every page has its
  // real client state (e.g. ?preset= on home). Gating the reveal at the root
  // means the whole page comes up on ONE fade instead of shell → content pop
  // → player fade, which read as flicker. Client-side navigations keep the
  // layout mounted, so the fade runs once per document load, not per route.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  return (
    <View style={styles.root} {...webAttrs({ reveal: hydrated ? 'in' : '' })}>
      <Head>
        <title>euxy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <meta
          name="description"
          content="A generative euclidean sequencer for the Teenage Engineering OP-XY, on your iPhone over USB-C MIDI. Hear the factory presets in the browser."
        />
        <meta property="og:title" content="euxy — euclidean sequencer for the OP-XY" />
        <meta
          property="og:description"
          content="Generative euclidean rhythms for the OP-XY. Scan a shared pattern and hear it right here."
        />
        <meta property="og:image" content="https://euxy.expo.app/og.png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="The euxy dot-matrix chip glyph on black" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="euxy — euclidean sequencer for the OP-XY" />
        <meta name="twitter:image" content="https://euxy.expo.app/og.png" />
        {/* Space Mono self-hosted + preloaded so mono text renders in the
            right font from the FIRST paint — the Google-CSS route swapped
            the font in late and shifted every mono label (Brent's report). */}
        <link
          rel="preload"
          href="/fonts/space-mono-400.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link
          rel="preload"
          href="/fonts/space-mono-700.woff2"
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <style>{`
          @font-face {
            font-family: 'Space Mono';
            font-style: normal;
            font-weight: 400;
            font-display: swap;
            src: url(/fonts/space-mono-400.woff2) format('woff2');
          }
          @font-face {
            font-family: 'Space Mono';
            font-style: normal;
            font-weight: 700;
            font-display: swap;
            src: url(/fonts/space-mono-700.woff2) format('woff2');
          }
          body { -webkit-font-smoothing: antialiased; }
          a, [role="button"] { touch-action: manipulation; }
          [data-balance] { text-wrap: balance; }
          [data-illustration] { user-select: none; }
          /* Interaction feedback. react-native-web emits atomic classes (not
             inline styles), so these attribute selectors win on specificity. */
          [data-anim] { transition: transform 100ms ease-out, background-color 150ms ease; }
          [data-chevron] { transition: transform 200ms cubic-bezier(0.215, 0.61, 0.355, 1); }
          @media (hover: hover) and (pointer: fine) {
            [data-pill]:hover { background-color: #2C2C2E; }
            [data-cta]:hover { background-color: #dddbdb; }
          }
          [data-cta]:active { transform: scale(0.97); }
          @keyframes euxy-unfold {
            from { opacity: 0; transform: translateY(-4px); }
            to { opacity: 1; transform: translateY(0); }
          }
          [data-unfold] { animation: euxy-unfold 200ms cubic-bezier(0.215, 0.61, 0.355, 1); }
          /* Page fade-in, gated at the layout root: hidden (layout reserved)
             until hydration resolves real client state (e.g. ?preset=), then
             one fade for the whole page. The 150ms delay lets the eye settle
             after the browser's white→black canvas commit — animating the
             instant JS lands read as white → black → pop, three stutters. */
          [data-reveal] { opacity: 0; }
          [data-reveal="in"] { opacity: 1; transition: opacity 300ms ease-out 150ms; }
          @media (prefers-reduced-motion: reduce) {
            [data-anim] { transition: none; }
            [data-chevron] { transition: none; }
            [data-cta]:active { transform: none; }
            [data-unfold] { animation: none; }
            [data-reveal="in"] { transition: none; }
          }
        `}</style>
      </Head>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ground,
    // dvh, not vh: mobile Safari's 100vh is the LARGE viewport (URL bar
    // collapsed), which made the scroll container taller than the visible
    // area — the page rubber-banded back before reaching the bottom.
    // react-native-web accepts viewport units; RN's types don't know them.
    minHeight: '100dvh' as unknown as number,
  } satisfies ViewStyle,
});
