/**
 * Client-side 404 — and the safety net for the canonical share URL. p.tsx
 * rewrites the address bar to /p/<d>, a path only the server (p/[d]+api.ts)
 * can answer. Same-document history traversal (back/forward past an in-app
 * navigation) replays that path through the client router, which has no
 * route for it and lands here. Bounce it straight back into the routable
 * query form; everything else gets a real not-found page.
 */
import { Link, router, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { color } from '@/theme/tokens';
import { LedChip, SANS } from '../components/ui';

// Same alphabet p/[d]+api.ts accepts — anything else is a genuine 404.
const PATTERN_PATH = /^\/p\/([A-Za-z0-9_-]+)$/;

export default function NotFound() {
  const pathname = usePathname();
  const payload = PATTERN_PATH.exec(pathname)?.[1];

  useEffect(() => {
    if (payload) router.replace(`/p?d=${payload}`);
  }, [payload]);

  // Redirecting — render nothing rather than flashing a 404.
  if (payload) return <View style={styles.blank} />;

  return (
    <View style={styles.errorPage}>
      <LedChip name="offbeat" size={64} />
      <Text style={styles.title}>Page could not be found</Text>
      <Text style={styles.body}>Nothing lives at this URL.</Text>
      <Link href="/" style={styles.homeLink}>
        <Text style={styles.homeLinkLabel}>euxy home</Text>
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  blank: { flex: 1 },
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
  title: { fontFamily: SANS, fontSize: 28, fontWeight: '700', letterSpacing: -0.56, color: color.label },
  body: { fontFamily: SANS, fontSize: 17, lineHeight: 26, color: color.label2 },
  homeLink: { paddingVertical: 8 },
  homeLinkLabel: { fontFamily: SANS, fontSize: 16, color: color.label25 },
});
