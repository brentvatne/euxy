/**
 * euxy.expo.app — home. What euxy is, hear the factory presets in the
 * browser, how to point the app at this page (IDAM), get the app.
 */
import { Link, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { chipForPattern, effectiveChipName } from '@/components/patterns/chips';
import { encodePattern } from '@/core/share-codec';
import { presetPatterns } from '@/state/presets';
import { color } from '@/theme/tokens';
import { ConnectSteps } from '../components/connect-diagram';
import { PatternPlayer } from '../components/pattern-player';
import { setFavicon } from '../lib/favicon';
import {
  CollapsibleSection,
  LedChip,
  MONO,
  MonoLabel,
  SANS,
  Section,
  webAttrs,
} from '../components/ui';

export default function Home() {
  const presets = useMemo(() => presetPatterns(), []);
  const [selectedId, setSelectedId] = useState(presets[0].id);
  const selected = presets.find((p) => p.id === selectedId) ?? presets[0];

  // The selected preset's glyph becomes the tab icon.
  useEffect(() => setFavicon(chipForPattern(selected)), [selected]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.column}>
        <View style={styles.hero}>
          <LedChip name="euxy" size={72} />
          <Text style={styles.title}>euxy</Text>
          <Text style={styles.tagline} {...webAttrs({ balance: '' })}>
            A generative euclidean sequencer for the Teenage Engineering OP-XY, on your iPhone over USB-C MIDI.
          </Text>
          <MonoLabel dim>NO OP-XY? HEAR THE PATTERNS RIGHT HERE.</MonoLabel>
          <Link
            href="https://testflight.apple.com/join/Ws2kvsxT"
            style={styles.betaKey}
            {...webAttrs({ cta: '', anim: '' })}
          >
            <Text style={styles.betaKeyLabel}>Join the TestFlight beta</Text>
          </Link>
          <MonoLabel dim>BETA IN APPLE REVIEW — LINK GOES LIVE ON APPROVAL</MonoLabel>
        </View>

        <Section title="Factory presets">
          <View style={styles.pills}>
            {presets.map((p) => {
              const selected = p.id === selectedId;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => setSelectedId(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  // data-pill only when idle so the CSS hover tint never
                  // fights the selected white fill.
                  {...webAttrs(selected ? { anim: '' } : { anim: '', pill: '' })}
                  style={({ pressed }) => [
                    styles.pill,
                    selected && styles.pillActive,
                    pressed && styles.pillPressed,
                  ]}
                >
                  <Text style={[styles.pillLabel, selected && styles.pillLabelActive]}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {/* No remount key: the player swaps schedulers on pattern change so
              playback continues across preset switches. */}
          <PatternPlayer pattern={selected} reserve={presets.map((p) => p.lanes)} />
          <Text style={styles.footnote}>
            Sounds are small synthesized stand-ins for the OP-XY’s drum kit — the point is the
            rhythm, not the timbre.
          </Text>
        </Section>

        <CollapsibleSection title="What’s euclidean sequencing?" icon="polymeter">
          <Text style={styles.body}>
            Spread K hits as evenly as possible across N steps and you get the rhythms of the
            world — E(3,8) is the tresillo, E(5,16) the bossa clave (Toussaint’s observation).
            euxy runs two euclidean generators per lane and combines them with a boolean op, so
            simple parameters compound into grooves.
          </Text>
          <Text style={styles.params}>
            PER LANE · 2 GENERATORS (PULSES + ROTATE) · COMBINE OR/AND/XOR/A&gt;B · TRACK ROTATE ·
            1–64 STEPS · NOTE · OP-XY TRACK · VELOCITY · GATE · RESOLUTION — LANES OF DIFFERENT
            LENGTHS DRIFT INTO POLYMETER
          </Text>
        </CollapsibleSection>

        <CollapsibleSection title="No OP-XY? Drive this page from euxy" icon="play">
          <Text style={styles.body}>
            This is mainly for jamming without the hardware: euxy on iPhone sequences, and this
            page — open in a desktop browser — becomes the speaker, over a USB cable. Live MIDI
            input lands here in a later update; today the presets above play standalone.
          </Text>
          <ConnectSteps />
          <MonoLabel dim>DESKTOP BROWSER ONLY · WEB MIDI · CHROME / EDGE / FIREFOX — NOT SAFARI</MonoLabel>
        </CollapsibleSection>

        <CollapsibleSection title="Share patterns as pixels" icon="invader">
          <Text style={styles.body}>
            Every euxy pattern can be shared as a QR code. Scanning one opens the pattern in the
            app — or, without the app, plays it on this site. No server, no account: the whole
            pattern lives inside the link.
          </Text>
          <Link
            href={{
              pathname: '/p',
              params: {
                d: (() => {
                  // Encode the EFFECTIVE glyph — preset glyphs come from the
                  // id-keyed curated map, and ids don't travel in the payload.
                  const p = presets.find((x) => x.name === 'Four on the Floor') ?? presets[0];
                  return encodePattern({ ...p, icon: effectiveChipName(p) });
                })(),
              },
            }}
            style={styles.repoLink}
          >
            <Text style={styles.repoLinkLabel}>TRY ONE → “FOUR ON THE FLOOR” AS A LINK</Text>
          </Link>
        </CollapsibleSection>

        <View style={styles.footer}>
          <Text style={[styles.footnote, styles.centered]}>
            euxy is an independent project — not affiliated with or endorsed by Teenage
            Engineering.
          </Text>
          <Link href="https://github.com/brentvatne/euxy" style={styles.repoLink}>
            <Text style={styles.repoLinkLabel}>source on GitHub → github.com/brentvatne/euxy</Text>
          </Link>
          {/* Cast: expo export doesn't regenerate typed routes (the dev
              server does), so fresh routes lag behind in .expo/types. */}
          <Link href={'/privacy' as Href} style={styles.repoLink}>
            <Text style={styles.repoLinkLabel}>privacy</Text>
          </Link>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { alignItems: 'center', paddingVertical: 56, paddingHorizontal: 20 },
  column: { width: '100%', maxWidth: 680, gap: 44 },
  hero: { alignItems: 'center', gap: 12 },
  // -0.02em tracking: display sizes read too loose at default spacing.
  title: { fontFamily: SANS, fontSize: 40, fontWeight: '700', letterSpacing: -0.8, color: color.label },
  tagline: {
    fontFamily: SANS,
    fontSize: 18,
    lineHeight: 26,
    color: color.label2,
    textAlign: 'center',
  },
  betaKey: {
    marginTop: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: color.label,
  },
  betaKeyLabel: { fontFamily: SANS, fontSize: 17, fontWeight: '600', color: '#101014' },
  pills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: {
    paddingHorizontal: 17,
    minHeight: 44, // touch target
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: color.surface,
  },
  pillActive: { backgroundColor: color.label },
  pillPressed: { transform: [{ scale: 0.97 }] },
  pillLabel: { fontFamily: SANS, fontSize: 16, fontWeight: '500', color: color.label2 },
  pillLabelActive: { color: '#101014' },
  body: { fontFamily: SANS, fontSize: 17, lineHeight: 26, color: color.label2 },
  params: { fontFamily: MONO, fontSize: 12, lineHeight: 19, letterSpacing: 0.5, color: '#6E6E76' },
  footnote: { fontFamily: SANS, fontSize: 14, lineHeight: 19, color: '#6E6E76' },
  centered: { textAlign: 'center' },
  footer: { gap: 8, alignItems: 'center', paddingBottom: 16 },
  repoLink: { paddingVertical: 4 },
  repoLinkLabel: { fontFamily: MONO, fontSize: 13, letterSpacing: 0.4, color: color.label25 },
});
