/**
 * euxy.expo.app — home. What euxy is, hear the factory presets in the
 * browser, how to point the app at this page (IDAM), get the app.
 */
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { presetPatterns } from '@/state/presets';
import { color } from '@/theme/tokens';
import { PatternPlayer } from '../components/pattern-player';
import { LedChip, MonoLabel, SANS, Section } from '../components/ui';

export default function Home() {
  const presets = useMemo(() => presetPatterns(), []);
  const [selectedId, setSelectedId] = useState(presets[0].id);
  const selected = presets.find((p) => p.id === selectedId) ?? presets[0];

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.column}>
        <View style={styles.hero}>
          <LedChip name="euxy" size={64} />
          <Text style={styles.title}>euxy</Text>
          <Text style={styles.tagline}>
            A generative euclidean sequencer for the Teenage Engineering OP-XY.
          </Text>
          <MonoLabel dim>NO OP-XY? HEAR THE PATTERNS RIGHT HERE.</MonoLabel>
        </View>

        <Section title="Factory presets">
          <View style={styles.pills}>
            {presets.map((p) => (
              <Pressable
                key={p.id}
                onPress={() => setSelectedId(p.id)}
                style={[styles.pill, p.id === selectedId && styles.pillActive]}
              >
                <Text style={[styles.pillLabel, p.id === selectedId && styles.pillLabelActive]}>
                  {p.name}
                </Text>
              </Pressable>
            ))}
          </View>
          {/* key remounts the player so a preset switch stops cleanly */}
          <PatternPlayer key={selected.id} pattern={selected} />
          <Text style={styles.footnote}>
            Sounds are small synthesized stand-ins for the OP-XY's drum kit — the point is the
            rhythm, not the timbre.
          </Text>
        </Section>

        <Section title="Drive it from euxy">
          <Text style={styles.body}>
            euxy on iPhone can play this page's sounds live over USB: connect the iPhone to a Mac,
            enable it in Audio MIDI Setup (the IDAM checkbox), pick “IDAM MIDI Host” as euxy's
            output — and this page becomes the speaker. Live MIDI input lands here in a later
            update; today the presets above play standalone.
          </Text>
          <MonoLabel dim>WEB MIDI · CHROME / EDGE / FIREFOX · NOT SAFARI</MonoLabel>
        </Section>

        <Section title="Share patterns as pixels">
          <Text style={styles.body}>
            Every euxy pattern can be shared as a QR code. Scanning one opens the pattern in the
            app — or, without the app, plays it on this site. No server, no account: the whole
            pattern lives inside the link.
          </Text>
        </Section>

        <View style={styles.footer}>
          <MonoLabel dim>EUXY.EXPO.APP · PATTERNS TRAVEL AS PIXELS</MonoLabel>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 620, gap: 40 },
  hero: { alignItems: 'center', gap: 12 },
  title: { fontFamily: SANS, fontSize: 34, fontWeight: '700', color: color.label },
  tagline: {
    fontFamily: SANS,
    fontSize: 16,
    lineHeight: 22,
    color: color.label2,
    textAlign: 'center',
  },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: color.surface,
  },
  pillActive: { backgroundColor: color.label },
  pillLabel: { fontFamily: SANS, fontSize: 14, fontWeight: '500', color: color.label2 },
  pillLabelActive: { color: '#101014' },
  body: { fontFamily: SANS, fontSize: 15, lineHeight: 22, color: color.label2 },
  footnote: { fontFamily: SANS, fontSize: 12, lineHeight: 16, color: '#6E6E76' },
  footer: { alignItems: 'center', paddingTop: 8, paddingBottom: 24 },
});
