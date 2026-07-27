/**
 * euxy.expo.app — home. What euxy is, hear the factory presets in the
 * browser, how to point the app at this page (IDAM), get the app.
 */
import { Link, router, type Href } from 'expo-router';
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
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
  webAttrs,
} from '../components/ui';

// The URL never changes out from under us (we're the only writer), so the
// store never notifies.
const subscribeNever = () => () => {};

export default function Home() {
  const presets = useMemo(() => presetPatterns(), []);
  // Encode the EFFECTIVE glyph — preset glyphs come from the id-keyed curated
  // map, and ids don't travel in the payload.
  const examplePayload = useMemo(() => {
    const p = presets.find((x) => x.name === 'Four on the Floor') ?? presets[0];
    return encodePattern({ ...p, icon: effectiveChipName(p) });
  }, [presets]);
  // The pill selection lives in the URL (?preset=lofi ↔ preset_lofi) so a
  // copied or reloaded link lands on the same preset. Deliberately NOT routed
  // through expo-router: router.replace/setParams scroll the page to the top
  // on every tap. State drives the UI; a bare replaceState mirrors it into
  // the URL (no scroll, no history entry). Taps happen long after the
  // router's hydration-time URL syncs, so the /p stomp race doesn't apply.
  // useSyncExternalStore instead of an adopt-on-mount effect: the server
  // snapshot (null) keeps the hydration pass identical to the prerender, and
  // the param applies on the very next client render — no setState-in-effect.
  const urlPreset = useSyncExternalStore(
    subscribeNever,
    () => new URLSearchParams(window.location.search).get('preset'),
    () => null,
  );
  const [tappedId, setTappedId] = useState<string | null>(null);
  const selected =
    (tappedId && presets.find((p) => p.id === tappedId)) ||
    (urlPreset && presets.find((p) => p.id === `preset_${urlPreset}`)) ||
    presets[0];
  // False in the prerender and during hydration, true immediately after —
  // the same render where ?preset= resolves. Gates the player's fade-in
  // (data-reveal) so the reveal never shows the default-then-swap flicker.
  const hydrated = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );

  const selectPreset = (id: string) => {
    setTappedId(id);
    const url = new URL(window.location.href);
    url.searchParams.set('preset', id.replace(/^preset_/, ''));
    window.history.replaceState(window.history.state, '', url);
  };

  // The selected preset's glyph becomes the tab icon.
  useEffect(() => setFavicon(chipForPattern(selected)), [selected]);

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.column}>
        <View style={styles.hero}>
          <LedChip name="euxy" size={72} />
          <Text style={styles.title}>euxy</Text>
          <Text style={styles.tagline} {...webAttrs({ balance: '' })}>
            A generative euclidean sequencer for the{' '}
            <Link
              href="https://teenage.engineering/products/op-xy"
              target="_blank"
              rel="noreferrer"
              style={styles.inlineLink}
            >
              Teenage Engineering OP-XY
            </Link>
            , on your iPhone over USB-C MIDI.
          </Text>
          <Link
            href="https://testflight.apple.com/join/Ws2kvsxT"
            style={styles.betaKey}
            {...webAttrs({ cta: '', anim: '' })}
          >
            <Text style={styles.betaKeyLabel}>Join the TestFlight beta</Text>
          </Link>
        </View>

        <View style={styles.player} {...webAttrs({ reveal: hydrated ? 'in' : '' })}>
          {/* The payoff leads: with 24 presets the pill list is taller than
              the player, and below it Play sat ~380px under the fold on a
              phone. No remount key — the player swaps schedulers on pattern
              change so playback continues across preset switches. */}
          <PatternPlayer
            pattern={selected}
            chip={chipForPattern(selected)}
            note="The app sends MIDI over USB-C to play patterns on the OP-XY itself. The sounds here are synthesized in the browser as an example."
            reserve={presets.map((p) => p.lanes)}
          />
          <View style={styles.pills}>
            {presets.map((p) => {
              const active = p.id === selected.id;
              return (
                <Pressable
                  key={p.id}
                  onPress={() => selectPreset(p.id)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  // data-pill only when idle so the CSS hover tint never
                  // fights the selected white fill.
                  {...webAttrs(active ? { anim: '' } : { anim: '', pill: '' })}
                  style={({ pressed }) => [
                    styles.pill,
                    active && styles.pillActive,
                    pressed && styles.pillPressed,
                  ]}
                >
                  <LedChip shades={chipForPattern(p)} size={18} />
                  <Text style={[styles.pillLabel, active && styles.pillLabelActive]}>
                    {p.name}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <CollapsibleSection defaultOpen title="What is euclidean sequencing?" icon="polymeter">
          <Text style={styles.lead}>
            Rather than placing beats one at a time, you tell a lane how many hits to fit into how
            many steps and it spreads them as evenly as it can. Changing one number lands you on a
            different groove — so you find rhythms by dialing rather than drawing, including ones
            you wouldn’t have programmed by hand.
          </Text>
          <Text style={styles.params}>
            PER LANE · 2 GENERATORS (PULSES + ROTATE) · COMBINE OR/AND/XOR/A&gt;B · TRACK ROTATE ·
            1–64 STEPS · NOTE · OP-XY TRACK · VELOCITY · GATE · RESOLUTION — LANES OF DIFFERENT
            LENGTHS DRIFT INTO POLYMETER
          </Text>
        </CollapsibleSection>

        <CollapsibleSection defaultOpen title="No OP-XY? Drive this page from euxy" icon="play">
          <Text style={styles.body}>
            This is mainly for jamming without the hardware: euxy on iPhone sequences, and this
            page — open in a desktop browser — becomes the speaker, over a USB cable. Live MIDI
            input lands here in a later update; today the presets above play standalone.
          </Text>
          <ConnectSteps />
          <MonoLabel dim>DESKTOP BROWSER ONLY · WEB MIDI · CHROME / EDGE / FIREFOX — NOT SAFARI</MonoLabel>
        </CollapsibleSection>

        <CollapsibleSection defaultOpen title="Share patterns as pixels" icon="invader">
          <Text style={styles.body}>
            Every euxy pattern can be shared as a QR code. Scanning one opens the pattern in the
            app — or, without the app, plays it on this site. No server, no account: the whole
            pattern lives inside the link.
          </Text>
          {/* The href is the REAL share URL (/p/<payload>) so copy-link and
              cmd-click both yield something that unfurls — but a plain click is
              intercepted and routed client-side to the ?d= page instead.
              Following the href would mean two full page loads (the API route
              serves head-only HTML, then redirects), which blinks. This is one
              instant in-app navigation with no document teardown.

              Not expo-router's <Link>: /p/<payload> has no client route (it's
              an API route), so the router would match nothing and render
              Unmatched Route. */}
          <Text
            accessibilityRole="link"
            {...({
              href: `/p/${examplePayload}`,
              onClick: (event: {
                metaKey?: boolean;
                ctrlKey?: boolean;
                shiftKey?: boolean;
                altKey?: boolean;
                button?: number;
                preventDefault: () => void;
              }) => {
                // Leave modified clicks alone — cmd/ctrl/shift/middle should
                // open the real, shareable URL in a new tab or window.
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                if (event.button !== undefined && event.button !== 0) return;
                event.preventDefault();
                router.push(`/p?d=${examplePayload}` as Href);
              },
            } as object)}
            style={[styles.tryKey, styles.tryKeyLabel]}
            {...webAttrs({ anim: '', pill: '' })}
          >
            Open an example shared link
          </Text>
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
  inlineLink: { color: color.label, textDecorationLine: 'underline' },
  betaKey: {
    marginTop: 6,
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: color.label,
  },
  betaKeyLabel: { fontFamily: SANS, fontSize: 17, fontWeight: '600', color: '#101014' },
  player: { gap: 14 },
  pills: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    // Tighter on the glyph side so the chip isn't stranded in the corner.
    paddingLeft: 11,
    paddingRight: 17,
    minHeight: 44, // touch target
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: color.surface,
  },
  pillActive: { backgroundColor: color.label },
  pillPressed: { transform: [{ scale: 0.97 }] },
  pillLabel: { fontFamily: SANS, fontSize: 16, fontWeight: '500', color: color.label2 },
  pillLabelActive: { color: '#101014' },
  lead: { fontFamily: SANS, fontSize: 17, lineHeight: 26, color: color.label },
  body: { fontFamily: SANS, fontSize: 17, lineHeight: 26, color: color.label2 },
  params: { fontFamily: MONO, fontSize: 12, lineHeight: 19, letterSpacing: 0.5, color: '#6E6E76' },
  footnote: { fontFamily: SANS, fontSize: 14, lineHeight: 19, color: '#6E6E76' },
  // Caption wedged between two dense blocks — give it room to read as its
  // own beat rather than a label stuck to either one.
  centered: { textAlign: 'center' },
  footer: { gap: 8, alignItems: 'center', paddingBottom: 16 },
  tryKey: {
    alignSelf: 'flex-start',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: color.surface,
  },
  tryKeyLabel: { fontFamily: SANS, fontSize: 16, fontWeight: '600', color: color.label },
  repoLink: { paddingVertical: 4 },
  repoLinkLabel: { fontFamily: MONO, fontSize: 13, letterSpacing: 0.4, color: color.label25 },
});
