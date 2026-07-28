/**
 * Enable MIDI sheet (Paper 2BL-0). Web permission explainer + Safari/iOS
 * fallback. Web MIDI needs a user gesture and a secure context, so the actual
 * requestMIDIAccess happens on the button press here. On unsupported browsers
 * (Safari / iOS) the amber notice is the whole story — there is no permission to
 * grant. (Amber is a deliberate, web-only exception to the monochrome scheme,
 * taken verbatim from the Paper design.)
 */
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui';
import { IconMic, IconMidiDin, IconWarning } from '@/components/midi/icons';
import { enableMidi, useMidiRuntime } from '@/components/midi/runtime';
import { color, space } from '@/theme/tokens';
import { useMarkInteractive } from '@/lib/use-mark-interactive';

export default function EnableMidiSheet() {
  useMarkInteractive();
  const rt = useMidiRuntime();
  const [busy, setBusy] = useState(false);

  const onEnable = async () => {
    setBusy(true);
    const ok = await enableMidi();
    setBusy(false);
    if (ok) router.back();
  };

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.scroll}>
      <View style={styles.hero}>
        <View style={styles.iconTile}>
          <IconMidiDin />
        </View>
        <View style={styles.heroText}>
          <AppText style={styles.title}>Enable MIDI access</AppText>
          <AppText style={styles.body}>
            Your browser needs permission to talk to the OP–XY. This must be started by a tap and only works over a secure (https) connection.
          </AppText>
        </View>
      </View>

      <View style={styles.btnWrap}>
        <Pressable
          onPress={onEnable}
          disabled={busy || !rt.supported}
          accessibilityRole="button"
          style={({ pressed }) => [styles.enableBtn, (busy || !rt.supported) && styles.enableDisabled, pressed && styles.pressed]}
        >
          <IconMic />
          <AppText style={styles.enableText}>{busy ? 'Requesting…' : 'Enable MIDI'}</AppText>
        </Pressable>
        {rt.error ? <AppText style={styles.error}>{rt.error}</AppText> : null}
      </View>

      <View style={styles.notice}>
        <IconWarning />
        <AppText style={styles.noticeText}>
          Web MIDI isn&apos;t supported in Safari or on iOS browsers. Use Chrome, Edge, or Brave on desktop — or the native iOS app.
        </AppText>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  scroll: { paddingTop: space.sm, paddingBottom: space.xxl },
  hero: { alignItems: 'center', gap: 18, paddingTop: 28, paddingBottom: space.sm, paddingHorizontal: space.xl + space.md },
  iconTile: { width: 64, height: 64, borderRadius: 16, backgroundColor: color.surface2, alignItems: 'center', justifyContent: 'center' },
  heroText: { alignItems: 'center', gap: space.sm },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.2, color: color.label, textAlign: 'center' },
  body: { fontSize: 15, lineHeight: 21, color: color.label3, textAlign: 'center', maxWidth: 290 },

  btnWrap: { paddingTop: 14, paddingBottom: 10, paddingHorizontal: space.lg, gap: space.sm },
  enableBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.sm, paddingVertical: 15, borderRadius: 13, backgroundColor: color.label },
  enableDisabled: { opacity: 0.4 },
  enableText: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ground },
  pressed: { opacity: 0.75 },
  error: { fontSize: 13, lineHeight: 18, color: color.danger, textAlign: 'center' },

  notice: { flexDirection: 'row', gap: 10, marginTop: 6, marginHorizontal: space.lg, paddingVertical: 13, paddingHorizontal: 15, borderRadius: 11, backgroundColor: '#241207', borderWidth: 1, borderColor: '#5A3A12' },
  noticeText: { flex: 1, fontSize: 13, lineHeight: 19, color: '#D8B98A' },
});
