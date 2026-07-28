/**
 * Channel surf sheet (Paper C3Y-0) — hidden debug UI for switching the EAS
 * Update channel at runtime. Opened by long-pressing the Diagnostics section
 * header on the MIDI tab. Device-screen panel shows the running update
 * (channel · runtime · id) plus a terminal-style input for the target
 * channel; quick-pick chips cover the eas.json channels. Fetch & reload runs
 * set-override → check → fetch → reload; the no-update and error outcomes
 * land in the panel's status line. Real surfing needs a release build —
 * dev clients show UPDATES DISABLED and the button stays off.
 */
import Constants from 'expo-constants';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';

import { AppText } from '@/components/ui';
import { KeyboardAwareScrollView } from '@/components/ui/keyboard';
import {
  getChannelOverrideRecord,
  KNOWN_CHANNELS,
  surfToChannelAsync,
  type SurfPhase,
} from '@/lib/channel-surf';
import { haptics, updatesInfo } from '@/lib/shims';
import { useMarkInteractive } from '@/lib/use-mark-interactive';
import { color, radius, space } from '@/theme/tokens';

const fmtDate = (d: Date | null) => {
  if (!d) return '—';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

const PHASE_TEXT: Record<SurfPhase, string> = {
  checking: 'CHECKING…',
  downloading: 'DOWNLOADING…',
  reloading: 'RELOADING…',
};

/** expo-updates reports isEnabled in dev clients too, but every API call
 * rejects there — treat dev as not surfable so the status line says why. */
const surfable = updatesInfo.isEnabled && !__DEV__;

/** What the panel shows when surfing can't work here (dev client / module
 * missing): sample values so the layout reads as it will in a release build,
 * flagged by the status line. Runtime version is real (app config). */
const placeholder = {
  channel: 'production',
  runtimeVersion: Constants.expoConfig?.version ?? '0.0.0',
  updateId: '4f2a91d3',
  published: '2026-07-24 18:02',
};

export default function ChannelSurfSheet() {
  useMarkInteractive();
  const [override, setOverride] = useState(getChannelOverrideRecord);
  const [value, setValue] = useState(override ?? '');
  const [phase, setPhase] = useState<SurfPhase | 'idle'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = phase !== 'idle';
  const target = value.trim();

  const surf = async (channel: string | null) => {
    setError(null);
    setNotice(null);
    try {
      const applied = await surfToChannelAsync(channel, setPhase);
      // The applied path reloads the JS out from under us; only the
      // no-compatible-update outcome returns here.
      if (!applied) {
        setOverride(channel);
        setNotice(
          channel
            ? `NO UPDATE ON ${channel.toUpperCase()} · OVERRIDE SAVED`
            : 'NO UPDATE ON BUILD CHANNEL · OVERRIDE CLEARED',
        );
      }
    } catch (e) {
      haptics.warning();
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPhase('idle');
    }
  };

  const status = error
    ? `ERR ${error}`
    : phase !== 'idle'
      ? PHASE_TEXT[phase]
      : (notice ??
        (!surfable
          ? updatesInfo.isEnabled
            ? 'DEV CLIENT · PLACEHOLDER DATA'
            : 'UPDATES UNAVAILABLE · PLACEHOLDER DATA'
          : override
            ? `OVERRIDE ${override.toUpperCase()}`
            : 'BUILD CHANNEL · NO OVERRIDE'));

  const shown = surfable
    ? {
        channel: updatesInfo.channel?.toUpperCase() ?? '—',
        runtime: updatesInfo.runtimeVersion ?? '—',
        update: updatesInfo.updateId?.slice(0, 8) ?? 'embedded',
        published: fmtDate(updatesInfo.createdAt),
      }
    : {
        channel: placeholder.channel.toUpperCase(),
        runtime: placeholder.runtimeVersion,
        update: placeholder.updateId,
        published: placeholder.published,
      };

  return (
    <View style={styles.root}>
      {/* No title, no close — the panel's channel readout IS the title
          (same call as the Tempo sheet) and the grabber/swipe dismisses. */}
      <View style={styles.grabberSpace} />

      {/* collapsable={false} keeps the scroll view out of the formSheet
          frame-correction path (docs/feedback/form-sheets.md). */}
      <View style={styles.scroll} collapsable={false}>
        <KeyboardAwareScrollView
          bottomOffset={24}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.body}
        >
          {/* Device screen: the running update, spec-sheet style. */}
          <View style={styles.panel}>
            <View style={styles.channelRow}>
              <View
                style={[
                  styles.led,
                  { backgroundColor: surfable ? color.connected : color.label4 },
                ]}
              />
              <AppText mono style={styles.channelName}>
                {shown.channel}
              </AppText>
            </View>
            <AppText mono style={[styles.statusLine, error != null && styles.statusError]}>
              {status}
            </AppText>

            <View style={styles.divider} />
            <View style={styles.specRows}>
              <SpecRow label="RUNTIME" value={shown.runtime} />
              <SpecRow label="UPDATE" value={shown.update} />
              <SpecRow label="PUBLISHED" value={shown.published} />
            </View>
            <View style={styles.divider} />

            <View style={styles.promptRow}>
              <AppText mono style={styles.promptMark}>
                &gt;
              </AppText>
              <TextInput
                value={value}
                onChangeText={setValue}
                placeholder="channel-name"
                placeholderTextColor={color.label4}
                selectionColor={color.label}
                style={styles.promptInput}
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="off"
                spellCheck={false}
                editable={!busy}
                returnKeyType="go"
                onSubmitEditing={() => target && void surf(target)}
              />
            </View>
          </View>

          {/* Quick picks: the channels eas.json builds against. */}
          <View style={styles.chips}>
            {KNOWN_CHANNELS.map((name) => {
              const active = name === target;
              return (
                <Pressable
                  key={name}
                  onPress={() => {
                    haptics.selection();
                    setValue(name);
                  }}
                  disabled={busy}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.chip, active && styles.chipActive, pressed && styles.pressed]}
                >
                  <AppText mono style={[styles.chipText, active && styles.chipTextActive]}>
                    {name}
                  </AppText>
                </Pressable>
              );
            })}
          </View>

          <Pressable
            onPress={() => void surf(target)}
            disabled={busy || !target || !surfable}
            accessibilityRole="button"
            style={({ pressed }) => [
              styles.surfBtn,
              (busy || !target || !surfable) && styles.surfBtnDisabled,
              pressed && styles.surfBtnPressed,
            ]}
          >
            <AppText style={styles.surfLabel}>Fetch &amp; reload</AppText>
          </Pressable>

          {override != null && (
            <Pressable
              onPress={() => void surf(null)}
              disabled={busy}
              accessibilityRole="button"
              style={({ pressed }) => [styles.clearBtn, pressed && styles.pressed]}
            >
              <AppText style={styles.clearLabel}>Clear override</AppText>
            </Pressable>
          )}

          <AppText style={styles.footnote}>
            Overrides expo-channel-name for update checks on this install. Persists until cleared.
            The update must match this build&apos;s runtime version.
          </AppText>
        </KeyboardAwareScrollView>
      </View>
    </View>
  );
}

function SpecRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.specRow}>
      <AppText mono style={styles.specLabel}>
        {label}
      </AppText>
      <AppText mono style={styles.specValue}>
        {value}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  // 13px "sheet top" band the native grabber floats over (same as Tempo).
  grabberSpace: { height: 13 },
  scroll: { flex: 1 },
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, paddingBottom: space.xxl },

  // Top corners echo the sheet's own (radius.sheet); the bottom stays on the
  // 12 the rest of the app's cells use, so the panel reads as a screen set
  // into the sheet's bezel rather than a floating card.
  panel: {
    backgroundColor: color.displayBg,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    borderBottomLeftRadius: radius.cell,
    borderBottomRightRadius: radius.cell,
    paddingHorizontal: 18,
    paddingTop: 22,
    paddingBottom: 16,
  },
  channelRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  led: { width: 8, height: 8, borderRadius: radius.chip },
  channelName: { fontSize: 22, lineHeight: 26, fontWeight: '700', color: color.label, letterSpacing: 1.3 },
  statusLine: { fontSize: 11, lineHeight: 15, color: color.label4, paddingTop: 6, paddingLeft: 18 },
  statusError: { color: color.danger },
  divider: { height: 1, backgroundColor: color.separator, marginVertical: 14 },
  specRows: { gap: 5 },
  specRow: { flexDirection: 'row', alignItems: 'center' },
  specLabel: { width: 92, fontSize: 12, lineHeight: 18, color: color.label4 },
  specValue: { fontSize: 12, lineHeight: 18, color: color.label2 },
  promptRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  promptMark: { fontSize: 14, lineHeight: 20, color: color.label4 },
  promptInput: { flex: 1, color: color.label, fontSize: 14, fontFamily: 'Menlo', padding: 0 },

  chips: { flexDirection: 'row', gap: space.sm, paddingTop: 14 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: radius.chip, backgroundColor: color.surface2 },
  chipActive: { backgroundColor: color.label },
  chipText: { fontSize: 12, lineHeight: 16, color: color.label2 },
  chipTextActive: { color: color.ground, fontWeight: '700' },
  pressed: { opacity: 0.6 },

  surfBtn: {
    marginTop: 22,
    height: 52,
    borderRadius: radius.cell + 1,
    backgroundColor: color.label,
    alignItems: 'center',
    justifyContent: 'center',
  },
  surfBtnDisabled: { opacity: 0.4 },
  surfBtnPressed: { opacity: 0.85 },
  surfLabel: { fontSize: 16, lineHeight: 20, fontWeight: '600', color: color.ground },
  clearBtn: { marginTop: space.md, alignItems: 'center', paddingVertical: 6 },
  clearLabel: { fontSize: 13, lineHeight: 18, fontWeight: '500', color: color.label3 },

  footnote: { fontSize: 12, lineHeight: 16, color: color.label4, paddingTop: 10, paddingHorizontal: space.md },
});
