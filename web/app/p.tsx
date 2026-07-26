/**
 * /p?d=<payload> — a shared euxy pattern. With the app installed this URL
 * never reaches the browser (universal link); here we decode the payload,
 * show the pattern, and play it. Decode failures get a friendly error —
 * the payload is untrusted input.
 */
import { Link, useLocalSearchParams } from 'expo-router';
import Head from 'expo-router/head';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { CHIPS } from '@/components/patterns/chips';
import { decodePattern, type SharedPattern } from '@/core/share-codec';
import { color } from '@/theme/tokens';
import { setFavicon } from '../lib/favicon';
import { PatternPlayer } from '../components/pattern-player';
import { LedChip, MonoLabel, SANS } from '../components/ui';

export default function SharedPatternPage() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  // The static prerender is built with NO query string, so rendering the
  // error state before hydration bakes a "didn't decode" flash into p.html.
  // Stay neutral until mounted on the client, where params are real.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  const pattern = useMemo<SharedPattern | null>(() => {
    if (typeof d !== 'string' || !d) return null;
    try {
      return decodePattern(d);
    } catch {
      return null;
    }
  }, [d]);

  useEffect(() => {
    if (pattern) setFavicon(CHIPS[(pattern.icon ?? 'euxy') as keyof typeof CHIPS] ?? CHIPS.euxy);
  }, [pattern]);

  if (!ready) return <View style={styles.blank} />;

  if (!pattern) {
    return (
      <View style={styles.errorPage}>
        <LedChip name="offbeat" size={64} />
        <Text style={styles.title}>This link didn’t decode</Text>
        <Text style={styles.body}>
          The pattern data in this URL is missing or damaged. Ask for a fresh QR code — the whole
          pattern lives inside the link, so a complete one always works.
        </Text>
        <Link href="/" style={styles.homeLink}>
          <Text style={styles.homeLinkLabel}>euxy home</Text>
        </Link>
      </View>
    );
  }

  const steps = Math.max(...pattern.lanes.map((l) => l.length));
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Head>
        <title>{`${pattern.name} — euxy`}</title>
        {/* Only crawlers that execute JS see these (the static export is
            built without query params) — a best-effort upgrade. */}
        <meta property="og:title" content={`${pattern.name} — a shared euxy pattern`} />
        <meta
          property="og:description"
          content={`${pattern.lanes.length} lanes · ${pattern.bpm} BPM · ${steps} steps. Play it in the browser, or open it in euxy on iPhone.`}
        />
        <meta property="og:image" content="https://euxy.expo.app/og-p.png" />
        <meta name="twitter:image" content="https://euxy.expo.app/og-p.png" />
      </Head>
      <View style={styles.column}>
        <View style={styles.identity}>
          <LedChip name={pattern.icon} size={50} />
          <View style={{ gap: 2, flexShrink: 1 }}>
            <Text style={styles.title}>{pattern.name}</Text>
            <MonoLabel>
              {pattern.lanes.length} LANES · {pattern.bpm} BPM · {steps} STEPS
            </MonoLabel>
          </View>
        </View>

        <PatternPlayer pattern={pattern} />

        <View style={styles.cta}>
          <Text style={styles.body}>
            Someone sent you a euxy pattern. Play it above — or open it in euxy on iPhone to load,
            tweak, and send it to an OP-XY.
          </Text>
          <MonoLabel dim>SCANNED WITH EUXY INSTALLED? THE APP OPENS INSTEAD OF THIS PAGE.</MonoLabel>
        </View>

        <Link href="/" style={styles.homeLink}>
          <Text style={styles.homeLinkLabel}>more patterns · euxy home</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1 },
  page: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 680, gap: 30 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  // -0.02em tracking: display sizes read too loose at default spacing.
  title: { fontFamily: SANS, fontSize: 28, fontWeight: '700', letterSpacing: -0.56, color: color.label },
  body: { fontFamily: SANS, fontSize: 17, lineHeight: 26, color: color.label2 },
  cta: { gap: 10 },
  errorPage: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingHorizontal: 32,
    maxWidth: 560,
    width: '100%',
    marginInline: 'auto',
  },
  homeLink: { paddingVertical: 8 },
  homeLinkLabel: { fontFamily: SANS, fontSize: 16, color: color.label25 },
});
