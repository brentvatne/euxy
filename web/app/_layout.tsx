import { Slot } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color } from '@/theme/tokens';

export default function Layout() {
  return (
    <View style={styles.root}>
      <Head>
        <title>euxy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#000000" />
        <meta property="og:title" content="euxy — euclidean sequencer for the OP-XY" />
        <meta
          property="og:description"
          content="Generative euclidean rhythms for the OP-XY. Scan a shared pattern and hear it right here."
        />
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
    // react-native-web accepts viewport units; RN's types don't know them.
    minHeight: '100vh' as unknown as number,
  } satisfies ViewStyle,
});
