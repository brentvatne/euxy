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
import { StyleSheet, View } from 'react-native';
import { Pressable } from 'react-native-gesture-handler';
import { router } from 'expo-router';

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

  // Open-time snapshot for Cancel. Dirty flags so Cancel reverts ONLY what
  // this sheet changed — in record mode the device moves BPM underneath us.
  const opened = useRef({ bpm, ticks, bpmDirty: false, ticksDirty: false });

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

  const cancel = () => {
    if (opened.current.bpmDirty) setBpm(opened.current.bpm);
    if (opened.current.ticksDirty) setBaseResolution(opened.current.ticks);
    router.back();
  };

  const bpmDisabled = recordMode;

  return (
    <View style={styles.root}>
      {/* 13px "sheet top" band the native grabber floats over (Paper 8NV-0). */}
      <View style={styles.grabberSpace} />
      <SheetHeader onCancel={cancel} onDone={() => router.back()} />

      <View style={styles.body}>
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
          <AppText style={styles.footnoteDim}>
            In Record mode the OP‑XY owns the clock — BPM follows the device and can&apos;t be
            edited here.
          </AppText>
        </View>
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
  // xxl group gap — the sections need air between them (Brent).
  body: { paddingHorizontal: space.lg, paddingTop: space.sm, gap: space.xxl },
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
