/**
 * /p?d=<payload> — the LEGACY shape, kept for links already in the wild; new
 * links use /p/<payload> (see p/[d].tsx, which renders this same screen).
 * Arrives via universal link or the euxy:// scheme. Decodes the payload
 * (untrusted — decodePattern clamps and throws) and adds it to the library
 * RIGHT AWAY. Malformed links get a friendly error, never a crash.
 *
 * The route lives inside the Patterns tab (not the root Stack) so an incoming
 * link lands the sheet on the library it was just added to — see the tab's
 * _layout.tsx. Following a link IS the intent to keep the pattern, so there is
 * no confirm step: the sheet is a receipt (what arrived, and that it is saved),
 * not a gate. The import lands as a NEW pattern and becomes the active one, so
 * nothing in the library is overwritten.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { chipForPattern } from '@/components/patterns/chips';
import { LedChip } from '@/components/patterns/led-chip';
import { AppText, SheetHeader } from '@/components/ui';
import { decodePattern, type SharedPattern } from '@/core/share-codec';
import { haptics, logObserveEvent } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { useStore } from '@/state/store';
import { color, font, space } from '@/theme/tokens';

export default function ImportPatternSheet() {
  const { d } = useLocalSearchParams<{ d?: string }>();
  const importPattern = useStore((s) => s.importPattern);
  const shared = useMemo<SharedPattern | null>(() => {
    if (typeof d !== 'string' || !d) return null;
    try {
      return decodePattern(d);
    } catch {
      return null;
    }
  }, [d]);

  // The receiving end of the share funnel: how many links arrive, how many
  // are damaged.
  useMarkInteractive();
  useEffect(() => {
    if (shared) logObserveEvent('share.link_received', { attributes: { lanes: shared.lanes.length } });
    else logObserveEvent('share.link_invalid', { severity: 'warn' });
  }, [shared]);

  // Add on arrival, exactly once per sheet: the ref outlives an effect that
  // re-runs (Fast Refresh, StrictMode remount), so a link is never imported
  // twice from one open.
  const importedId = useRef<string | null>(null);
  useEffect(() => {
    if (!shared || importedId.current) return;
    importedId.current = importPattern(shared);
    haptics.success();
    logObserveEvent('share.pattern_imported', { attributes: { lanes: shared.lanes.length } });
  }, [importPattern, shared]);

  // The import is already the active pattern — this only closes the receipt and
  // switches tabs. Two steps: this sheet lives in the Patterns stack, so
  // dismissing it and changing tabs are actions on two different navigators.
  const openInSequencer = () => {
    haptics.impact('medium');
    router.back();
    router.navigate('/(tabs)/(sequencer)');
  };

  if (!shared) {
    return (
      <View style={styles.root}>
        <View style={styles.grabberSpace} />
        <SheetHeader title="" onDone={() => router.back()} />
        <View style={styles.center}>
          <AppText style={styles.title}>This link didn’t decode</AppText>
          <AppText style={styles.body}>
            The pattern data in this link is missing or damaged. Ask for a fresh QR code — the
            whole pattern travels inside the link, so a complete one always works.
          </AppText>
        </View>
      </View>
    );
  }

  const steps = Math.max(...shared.lanes.map((l) => l.length));
  const laneNames = shared.lanes.map((l) => l.name ?? `Ch ${l.channel + 1}`).join(' · ');
  return (
    <View style={styles.root}>
      <View style={styles.grabberSpace} />
      <SheetHeader title="Added to Library" onDone={() => router.back()} />
      <View style={styles.content}>
        <View style={styles.identity}>
          <LedChip shades={chipForPattern({ id: 'shared', icon: shared.icon })} size={44} />
          <View style={styles.titles}>
            <AppText style={styles.title}>{shared.name}</AppText>
            <AppText style={styles.stats}>
              {shared.lanes.length} LANES · {shared.bpm} BPM · {steps} STEPS
            </AppText>
          </View>
        </View>
        <AppText style={styles.body} numberOfLines={2}>
          {laneNames}
        </AppText>
        <Pressable
          onPress={openInSequencer}
          accessibilityRole="button"
          style={({ pressed }) => [styles.key, styles.keyPrimary, pressed && styles.pressed]}
        >
          <AppText style={[styles.keyLabel, styles.keyLabelDark]}>Open in Sequencer</AppText>
        </Pressable>
        <AppText style={styles.footnote}>
          added as a new pattern — nothing in your library is replaced
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  grabberSpace: { height: 13 },
  content: { paddingHorizontal: space.xl, paddingTop: 14, gap: 16 },
  center: { paddingHorizontal: space.xl, paddingTop: 24, gap: 10 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titles: { gap: 2, flexShrink: 1 },
  title: { fontFamily: font.text, fontWeight: '600', fontSize: 20, lineHeight: 25, color: color.label },
  stats: { fontFamily: font.mono, fontSize: 11, lineHeight: 14, letterSpacing: 0.6, color: color.label25 },
  body: { fontFamily: font.text, fontSize: 14, lineHeight: 19, color: color.label2 },
  key: {
    height: 50,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // The receipt has one key, so it takes the bright one (same primary as the
  // Share sheet).
  keyPrimary: { backgroundColor: color.label },
  pressed: { transform: [{ scale: 0.97 }] },
  keyLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 17, lineHeight: 22, color: color.label },
  keyLabelDark: { color: '#101014' },
  footnote: { fontFamily: font.text, fontSize: 12, lineHeight: 16, color: '#6E6E76', textAlign: 'center' },
});
