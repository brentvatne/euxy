import { Slot } from 'expo-router';
import Head from 'expo-router/head';
import { StyleSheet, View } from 'react-native';
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
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </Head>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: color.ground,
    // @ts-expect-error web-only unit
    minHeight: '100vh',
  },
});
