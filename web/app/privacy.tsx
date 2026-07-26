/**
 * /privacy — the privacy policy URL App Store submission requires.
 * Draft reflecting what the app actually does (nothing interesting):
 * review before submission.
 */
import { Link } from 'expo-router';
import Head from 'expo-router/head';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { color } from '@/theme/tokens';
import { LedChip, MONO, SANS } from '../components/ui';

const SECTIONS: { title: string; body: string }[] = [
  {
    title: 'What euxy collects: nothing personal',
    body: 'euxy has no accounts, no sign-in, and no ads. Your patterns and settings are stored locally on your device and are not transmitted to us. We do not collect names, email addresses, locations, contacts, or any other personal information.',
  },
  {
    title: 'MIDI',
    body: 'MIDI data flows directly between your device and your connected hardware (for example an OP-XY). It is not recorded or sent anywhere.',
  },
  {
    title: 'Shared patterns',
    body: 'When you share a pattern, the entire pattern is encoded inside the link or QR code itself. There is no server-side storage: whoever you give the link to has the pattern, and nobody else does. Opening a shared link on this website decodes it in your browser.',
  },
  {
    title: 'Diagnostics',
    body: 'The app checks for updates and reports anonymous performance and crash diagnostics through Expo Application Services (EAS) so we can keep it working well. These diagnostics contain no personal information and are not used for advertising or tracking.',
  },
  {
    title: 'This website',
    body: 'euxy.expo.app sets no cookies and runs no analytics.',
  },
  {
    title: 'Contact',
    body: 'Questions? Email brentvatne@gmail.com or open an issue at github.com/brentvatne/euxy.',
  },
];

export default function Privacy() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Head>
        <title>privacy — euxy</title>
      </Head>
      <View style={styles.column}>
        <View style={styles.hero}>
          <LedChip name="euxy" size={48} />
          <Text style={styles.title}>Privacy</Text>
          <Text style={styles.updated}>DRAFT · LAST UPDATED 2026-07-25</Text>
        </View>
        {SECTIONS.map((s) => (
          <View key={s.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.body}>{s.body}</Text>
          </View>
        ))}
        <Link href="/" style={styles.homeLink}>
          <Text style={styles.homeLinkLabel}>← euxy home</Text>
        </Link>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 680, gap: 28 },
  hero: { alignItems: 'center', gap: 10 },
  title: { fontFamily: SANS, fontSize: 32, fontWeight: '700', color: color.label },
  updated: { fontFamily: MONO, fontSize: 12, letterSpacing: 0.7, color: '#6E6E76' },
  section: { gap: 8 },
  sectionTitle: { fontFamily: SANS, fontSize: 19, fontWeight: '600', color: color.label3 },
  body: { fontFamily: SANS, fontSize: 17, lineHeight: 26, color: color.label2 },
  homeLink: { paddingVertical: 8, alignSelf: 'center' },
  homeLinkLabel: { fontFamily: SANS, fontSize: 16, color: color.label25 },
});
