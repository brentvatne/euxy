/**
 * Tempo sheet (Paper 8NU-0 "Sheet · Tempo") — opened by tapping the BPM
 * readout in the transport. TEMPO clones the New Pattern sheet's BPM stepper
 * row (same paddings/typography/bounds); BASE RESOLUTION is the shared
 * picker. Edits apply LIVE to the active pattern — Done just dismisses,
 * Cancel restores the open-time values (only the ones this sheet actually
 * changed, so a device-driven BPM is never stomped). In record mode the
 * OP-XY owns the clock: the BPM stepper is disabled, resolution stays
 * editable. Either ± button also HOLDS to scroll BPM at an accelerating rate
 * (use-hold-repeat) — 20…300 is too wide to tap across. The Paper board also
 * mocks a TAP TEMPO key — not shipped yet (ROADMAP §10 follow-up).
 *
 * Base-resolution semantics: the base is only the DEFAULT grid for NEW
 * lanes — every lane carries its own resolutionTicks, so changing it here
 * never rewrites existing lanes (see store.setBaseResolution).
 */
import { useRef } from 'react';
import { ScrollView, StyleSheet, Switch, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { router } from 'expo-router';

import { haptics } from '@/lib/shims';

import { AppText, SFSymbol, SheetHeader } from '@/components/ui';
import { useHoldRepeat } from '@/components/ui/use-hold-repeat';
import { ValueFilm } from '@/components/ui/value-film';
import { ResolutionPicker } from '@/components/patterns/resolution-picker';
import { useActivePattern } from '@/state/selectors';
import { useStore } from '@/state/store';
import { color, font, HIT_SLOP, radius, space } from '@/theme/tokens';
import { BPM_MAX, BPM_MIN } from './new-pattern';
import { useMarkInteractive } from '@/lib/use-mark-interactive';

export default function TempoSheet() {
  useMarkInteractive();
  const bpm = useStore((s) => s.transport.bpm);
  const recordMode = useStore((s) => s.transport.clockMode) === 'record';
  const setBpm = useStore((s) => s.setBpm);
  const setBaseResolution = useStore((s) => s.setBaseResolution);
  const ticks = useActivePattern().baseResolutionTicks;
  const beatHaptics = useStore((s) => s.settings.beatHaptics);
  const setBeatHaptics = useStore((s) => s.setBeatHaptics);

  // Open-time snapshot for Cancel. Dirty flags so Cancel reverts ONLY what
  // this sheet changed — in record mode the device moves BPM underneath us.
  //
  // Cancel is the ONLY path that reverts. Done, the swipe-down and the
  // hardware back all keep what you changed, because every control here edits
  // live and dismissing a sheet you were happy with should not undo it.
  const opened = useRef({
    bpm,
    ticks,
    beatHaptics,
    bpmDirty: false,
    ticksDirty: false,
    hapticsDirty: false,
  });

  /** One ± press, or one tick of a hold. Reads the CURRENT bpm from the store
   * rather than this render's closure: a hold steps ~30×/second, faster than
   * we can count on a re-render landing between ticks. Returns whether the
   * value moved so the hold ends at BPM_MIN/BPM_MAX. Haptics come from
   * useHoldRepeat (it thins them at speed). */
  const adjustBpm = (delta: number) => {
    const current = Math.round(useStore.getState().transport.bpm);
    const next = Math.max(BPM_MIN, Math.min(BPM_MAX, current + delta));
    if (next === current) return false;
    opened.current.bpmDirty = true;
    setBpm(next);
    return true;
  };
  const decBpm = useHoldRepeat(() => adjustBpm(-1));
  const incBpm = useHoldRepeat(() => adjustBpm(1));

  const changeResolution = (t: number) => {
    opened.current.ticksDirty = true;
    setBaseResolution(t);
  };

  const toggleBeatHaptics = (on: boolean) => {
    opened.current.hapticsDirty = true;
    setBeatHaptics(on);
    // Answer the switch with the thing it just turned on, so the setting is
    // confirmed by an example of itself.
    if (on) haptics.impact('medium');
  };

  const cancel = () => {
    if (opened.current.bpmDirty) setBpm(opened.current.bpm);
    if (opened.current.ticksDirty) setBaseResolution(opened.current.ticks);
    if (opened.current.hapticsDirty) setBeatHaptics(opened.current.beatHaptics);
    router.back();
  };

  const bpmDisabled = recordMode;

  return (
    <View style={styles.root}>
      {/* 13px "sheet top" band the native grabber floats over (Paper 8NV-0). */}
      <View style={styles.grabberSpace} />
      <SheetHeader onCancel={cancel} onDone={() => router.back()} />

      {/* The form must SCROLL — the beat-haptics row pushed the footnotes past
          this sheet's 0.45 detent.

          Both halves of docs/feedback/form-sheets.md "Bug 1" apply, and both
          are load-bearing:

          • collapsable={false} on the WRAPPER. React Native's view flattening
            can hoist a ScrollView into direct-child position, where
            react-native-screens' formSheet frame correction finds it and
            assigns it the whole sheet frame at origin 0 — content painted over
            the header, Cancel/Done swallowed. Unflattenable wrapper, no match.
            (The bug appears and disappears with flattening, so this is not
            optional just because it happens to look right once.)
          • flex:1 on the SCROLL VIEW as well, not only the wrapper. Otherwise
            the viewport is unbounded, the scroll view sizes to its content,
            and nothing scrolls.

          Detents stay SINGLE ([0.45] in _layout.tsx, like every other sheet
          here) — "Bug 2" in the same doc is a mis-layout on detent resize that
          never runs when there is nothing to resize between.

          No keyboard on this sheet, so a plain ScrollView rather than the RNKC
          one that new-pattern and lane-editor need. */}
      <View style={styles.scroll} collapsable={false}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.body}
        showsVerticalScrollIndicator={false}
      >
        {/* No "Tempo" header — the sheet IS tempo (Brent: redundant). The
            cell leads the body directly; Base Resolution keeps its header. */}
        <View>
          <View style={styles.tempoCell}>
            <AppText variant="body">BPM</AppText>
            <View style={styles.tempoControls}>
              <Pressable
                {...decBpm}
                disabled={bpmDisabled || bpm <= BPM_MIN}
                hitSlop={HIT_SLOP}
                style={[styles.tempoBtn, (bpmDisabled || bpm <= BPM_MIN) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Decrease tempo"
              >
                <SFSymbol name="minus" size={18} tint={color.label} />
              </Pressable>
              <View style={styles.tempoValueBox}>
                {/* A committed value gets a light. NOT in record mode: there the
                    device drives BPM a couple of times a second, and a film on
                    that would be a permanent flicker rather than feedback. */}
                {bpmDisabled ? null : (
                  <ValueFilm value={Math.round(bpm)} style={styles.tempoValueFilm} />
                )}
                <AppText variant="title" style={[styles.tempoValue, bpmDisabled && styles.disabled]}>
                  {Math.round(bpm)}
                </AppText>
              </View>
              <Pressable
                {...incBpm}
                disabled={bpmDisabled || bpm >= BPM_MAX}
                hitSlop={HIT_SLOP}
                style={[styles.tempoBtn, (bpmDisabled || bpm >= BPM_MAX) && styles.disabled]}
                accessibilityRole="button"
                accessibilityLabel="Increase tempo"
              >
                <SFSymbol name="plus" size={18} tint={color.label} />
              </Pressable>
            </View>
          </View>
        </View>

        {/* Beat haptics. A real UISwitch (never a hand-rolled toggle), tinted
            into the monoramp — the stock green would be a fourth functional
            color, and tokens.ts allows exactly three. */}
        <View style={styles.tempoCell}>
          <AppText variant="body">Haptic beats</AppText>
          <Switch
            value={beatHaptics}
            onValueChange={toggleBeatHaptics}
            trackColor={{ true: color.label, false: color.surface3 }}
            thumbColor={beatHaptics ? color.ground : undefined}
            style={styles.switch}
            accessibilityLabel="Haptic beats"
          />
        </View>

        <Field label="Base Resolution">
          <ResolutionPicker value={ticks} onChange={changeResolution} />
        </Field>

        {/* Paper 8OU-0 footnotes. Second line only matters in record mode.
            (Copy adjusted from the mock: the base never rescales existing
            lanes — it's the default grid for NEW lanes.) */}
        <View style={styles.footnotes}>
          <AppText style={styles.footnote}>
            Changes apply live while playing. Base resolution sets the step grid for new lanes.
          </AppText>
          <AppText style={styles.footnote}>
            Haptic beats pulse the phone on every beat while the transport runs, the first of four
            harder. Off by default — a pulse on the beat can fight the music.
          </AppText>
          <AppText style={styles.footnoteDim}>
            In Record mode the OP‑XY owns the clock — BPM follows the device and can&apos;t be
            edited here.
          </AppText>
        </View>
      </ScrollView>
      </View>
    </View>
  );
}

/** Section headers match the Edit Lane sheet (Brent: that one is correct) —
 * title case, 17/22 semibold label3 — NOT the New Pattern micro-caps. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <AppText style={styles.fieldLabel}>{label}</AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: color.surface },
  grabberSpace: { height: 13 },
  scroll: { flex: 1 },
  /**
   * A UISwitch is 51×31pt, and saying so is what keeps it centred. Left to
   * measure itself the switch lands against the top of the row: the shadow
   * node reports a box the real control overflows, so the CELL centres an
   * undersized frame while UIKit draws the switch from that frame's top edge.
   * Pinning the intrinsic size gives the layout the same box UIKit paints.
   */
  switch: { width: 51, height: 31, alignSelf: 'center' },
  // xxl group gap — the sections need air between them (Brent).
  // paddingBottom, not just the group gap: as scroll content the footnotes
  // would otherwise end flush against the sheet's bottom edge.
  body: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.xxl,
    gap: space.xxl,
  },
  field: { gap: space.sm },
  fieldLabel: {
    fontFamily: font.text,
    fontWeight: '600',
    fontSize: 17,
    lineHeight: 22,
    color: color.label3,
    marginLeft: 2,
  },
  // Cloned from the New Pattern sheet's TEMPO row (Paper 8O4-0).
  tempoCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: color.surface2,
    borderRadius: radius.cell,
    paddingLeft: space.lg,
    paddingRight: space.md,
    height: 52,
  },
  tempoControls: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  tempoBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tempoValue: { minWidth: 52, textAlign: 'center' },
  tempoValueBox: { justifyContent: 'center' },
  // The commit film sits BEHIND the digits, bleeding a little past them so the
  // light reads as the readout lighting up rather than a box behind it.
  tempoValueFilm: {
    position: 'absolute',
    top: -4,
    bottom: -4,
    left: -6,
    right: -6,
    borderRadius: 6,
    backgroundColor: '#F6F4F4',
  },
  disabled: { opacity: 0.35 },
  // Paper 8OU-0: 13/18 regular, px 20 (body is 16 → +4), first line #95959A,
  // second the dimmer #6E6E76 (Paper value; also the transport standby ring).
  footnotes: { gap: space.sm, paddingHorizontal: 4, paddingTop: space.xs },
  footnote: { fontFamily: font.text, fontSize: 13, lineHeight: 18, color: color.label3 },
  footnoteDim: { fontFamily: font.text, fontSize: 13, lineHeight: 18, color: '#6E6E76' },
});
