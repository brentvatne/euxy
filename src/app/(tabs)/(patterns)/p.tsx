/**
 * /p?d=<payload> — the LEGACY shape, kept for links already in the wild; new
 * links use /p/<payload> (see p/[d].tsx, which renders this same screen).
 * Arrives via universal link or the euxy:// scheme. Decodes the payload
 * (untrusted — decodePattern clamps and throws), previews it, and imports on
 * confirm. Malformed links get a friendly error, never a crash.
 *
 * The route lives inside the Patterns tab (not the root Stack) so an incoming
 * link lands the sheet on the library it is about to add to — see the tab's
 * _layout.tsx. Preview auditions the incoming pattern through the engine
 * WITHOUT importing it: library, transport, and saved tempo stay untouched
 * until Add to Library (see engine.startPreview).
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { chipForPattern } from '@/components/patterns/chips';
import { LedChip } from '@/components/patterns/led-chip';
import { AppText, SheetHeader } from '@/components/ui';
import { BeatTicker } from '@/components/ui/beat-ticker';
import { engine } from '@/core/engine';
import { decodePattern, type SharedPattern } from '@/core/share-codec';
import { haptics, logObserveEvent } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { makeLane } from '@/state/lane';
import { useStore } from '@/state/store';
import type { Pattern } from '@/state/types';
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

  // An engine-playable pattern that never enters the library: fresh lane ids
  // plus the mix state the codec strips (muted/solo), nothing persisted.
  const previewPattern = useMemo<Pattern | null>(
    () =>
      shared
        ? {
            id: 'preview',
            name: shared.name,
            bpm: shared.bpm,
            baseResolutionTicks: shared.baseResolutionTicks,
            lanes: shared.lanes.map((lane) => makeLane({ ...lane })),
            updatedAt: 0,
            icon: shared.icon,
          }
        : null,
    [shared],
  );
  const [previewing, setPreviewing] = useState(false);

  // The receiving end of the share funnel: how many links arrive, how many
  // are damaged, how many convert to an import.
  useMarkInteractive();
  useEffect(() => {
    if (shared) logObserveEvent('share.link_received', { attributes: { lanes: shared.lanes.length } });
    else logObserveEvent('share.link_invalid', { severity: 'warn' });
  }, [shared]);

  // An audition must never outlive the sheet — Cancel, swipe-down, and Add all
  // unmount this screen, and the engine hands the output back to the transport.
  useEffect(() => () => engine.stopPreview(), []);

  const togglePreview = () => {
    if (!previewPattern) return;
    haptics.impact('medium');
    if (previewing) {
      engine.stopPreview();
      setPreviewing(false);
      return;
    }
    engine.startPreview(previewPattern);
    setPreviewing(true);
    logObserveEvent('share.preview_started', {
      attributes: { lanes: previewPattern.lanes.length },
    });
  };

  const add = () => {
    if (!shared) return;
    importPattern(shared);
    haptics.success();
    logObserveEvent('share.pattern_imported', { attributes: { lanes: shared.lanes.length } });
    // The imported pattern is now active — land on the sequencer. Two steps:
    // this sheet lives in the Patterns stack, so dismissing it and switching
    // tabs are actions on two different navigators.
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
      <SheetHeader title="Shared Pattern" onCancel={() => router.back()} />
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
          onPress={togglePreview}
          accessibilityRole="button"
          accessibilityState={{ selected: previewing }}
          style={({ pressed }) => [styles.key, styles.keySecondary, pressed && styles.pressed]}
        >
          <View style={styles.previewLabel}>
            <AppText style={styles.keyLabel}>{previewing ? 'Stop Preview' : 'Preview'}</AppText>
            {/* Beats read off the shared playhead — the audition stays visible
                on a device with no MIDI output attached. */}
            {previewing ? <BeatTicker /> : null}
          </View>
        </Pressable>
        <Pressable
          onPress={add}
          accessibilityRole="button"
          style={({ pressed }) => [styles.key, styles.keyPrimary, pressed && styles.pressed]}
        >
          <AppText style={[styles.keyLabel, styles.keyLabelDark]}>Add to Library</AppText>
        </Pressable>
        <AppText style={styles.footnote}>
          {previewing
            ? 'previewing only — nothing is saved until you add it'
            : 'added as a new pattern — nothing in your library is replaced'}
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
  // Audition first, commit second: Preview is the muted key, Add to Library
  // keeps the bright one (same primary/secondary pair as the Share sheet).
  keySecondary: { backgroundColor: color.surface2, marginBottom: -6 },
  keyPrimary: { backgroundColor: color.label },
  previewLabel: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  pressed: { transform: [{ scale: 0.97 }] },
  keyLabel: { fontFamily: font.text, fontWeight: '600', fontSize: 17, lineHeight: 22, color: color.label },
  keyLabelDark: { color: '#101014' },
  footnote: { fontFamily: font.text, fontSize: 12, lineHeight: 16, color: '#6E6E76', textAlign: 'center' },
});
