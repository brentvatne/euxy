/**
 * Pinned transport bar. Values pulled from Paper node CO-0 (jam), 1X1-0
 * (record) and 22T-0 (disabled play). Presentational — screens wire it to the
 * store.
 *
 * Jam mode: BPM (left) · skip-to-start / circular play-pause / stop (center) ·
 * JAM mode pill (right); app is clock master. Record mode: app is a clock
 * slave, so the center cluster is a passive glowing-red "Recording / locked to
 * device clock" indicator, the BPM label reads `· REC`, and the pill shows a
 * red REC. Tapping the pill toggles the clock mode. Panic lives on the MIDI
 * tab. `playDisabled` dims the play button (empty pattern).
 */
import { useEffect } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  ReduceMotion,
  cancelAnimation,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { BeatTicker } from './beat-ticker';
import { Key } from './key';
import { KeyEase } from './key-ease';
import { EASE_TRANSPORT_PLAY } from '@/lib/flags';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import type { ClockMode, RecordPhase } from '@/state/types';
import { color, font, ramp, space } from '@/theme/tokens';
import { AppText } from './text';
import { IconPause, IconPlay, IconSkipToStart, IconStop } from './icons';

// Wave2 ease spike (concept H comparison surface): ONLY the play button swaps.
const PlayKey = EASE_TRANSPORT_PLAY ? KeyEase : Key;

export interface TransportBarProps {
  playing: boolean;
  bpm: number;
  mode: ClockMode;
  /** Record-mode lifecycle (Paper "Transport · Record states"). */
  recordPhase?: RecordPhase;
  countInBeat?: number;
  playDisabled?: boolean;
  onTogglePlay?: () => void;
  onStop?: () => void;
  onSkipToStart?: () => void;
  onToggleMode?: () => void;
  onPressBpm?: () => void;
}

export function TransportBar({
  playing,
  bpm,
  mode,
  recordPhase = 'armed',
  countInBeat = 0,
  playDisabled = false,
  onTogglePlay,
  onStop,
  onSkipToStart,
  onToggleMode,
  onPressBpm,
}: TransportBarProps) {
  const jam = mode === 'jam';
  return (
    <View style={styles.bar}>
      <Pressable
        onPress={onPressBpm}
        disabled={!onPressBpm}
        style={({ pressed }) => [styles.bpmCol, pressed && styles.pressedDim]}
        accessibilityRole="button"
        accessibilityLabel="Edit tempo"
      >
        {/* Meter-style readout: the BPM unit centers under the number. */}
        <View style={styles.bpmBlock}>
          <AppText style={styles.bpmValue} numberOfLines={1}>
            {bpm.toFixed(1)}
          </AppText>
          <AppText style={styles.bpmLabel} numberOfLines={1}>
            BPM
          </AppText>
          {/* Concept E: the LED beat strip walks 1-2-3-4 off the playhead
              clock; during the record count-in (clock held at 0) it walks the
              count-in beat instead, and it blinks 8ths while recording. */}
          <BeatTicker
            countInBeat={!jam && recordPhase === 'countin' ? countInBeat : 0}
            recording={!jam && recordPhase === 'recording'}
          />
        </View>
      </Pressable>

      {jam ? (
        <View style={styles.buttons}>
          <Key onPress={onSkipToStart} hitSlop={space.sm} accessibilityLabel="Skip to start">
            <IconSkipToStart size={24} />
          </Key>
          <PlayKey
            onPress={onTogglePlay}
            disabled={playDisabled}
            ack
            // Transport-grade key — the heaviest click in the app (OP-XY
            // tactility: this is the button you feel without looking).
            haptic="medium"
            style={[styles.play, playDisabled && styles.playDisabled]}
            accessibilityRole="button"
            accessibilityLabel={playing ? 'Pause' : 'Play'}
          >
            {playing ? (
              <IconPause size={24} color={color.ground} />
            ) : (
              <IconPlay size={24} color={playDisabled ? color.labelDisabled : color.ground} />
            )}
          </PlayKey>
          <Key onPress={onStop} hitSlop={space.sm} accessibilityLabel="Stop">
            <IconStop size={22} />
          </Key>
        </View>
      ) : (
        // Paper "Transport · Record states": armed (gray ring, instructions) →
        // count-in (red ring + beat) → recording (solid glowing dot).
        <View style={styles.recIndicator}>
          {recordPhase === 'recording' ? (
            <View style={styles.recDot} />
          ) : (
            <View
              style={[
                styles.recRing,
                { borderColor: recordPhase === 'countin' ? color.danger : color.label4 },
              ]}
            />
          )}
          <View style={styles.recText}>
            {recordPhase === 'armed' ? (
              // The actual button sequence: arm with ● + ▶, then ▶ to start.
              <View style={styles.armGlyphs}>
                <View style={styles.armRecordIcon} />
                <AppText style={styles.armGlyphSep}>+</AppText>
                <IconPlay size={12} color={color.label} />
                <AppText style={styles.armGlyphSep}>,</AppText>
                <IconPlay size={12} color={color.label} />
              </View>
            ) : (
              <AppText style={styles.recTitle}>
                {recordPhase === 'recording' ? 'Recording' : `Count‑in · ${countInBeat}`}
              </AppText>
            )}
            <AppText style={styles.recSub}>
              {recordPhase === 'recording'
                ? 'locked to device clock'
                : recordPhase === 'countin'
                  ? 'starts after the bar'
                  : 'on the OP‑XY to start'}
            </AppText>
          </View>
        </View>
      )}

      <View style={styles.right}>
        <ModePill
          jam={jam}
          playing={playing}
          recordPhase={recordPhase}
          bpm={bpm}
          onToggleMode={onToggleMode}
        />
      </View>
    </View>
  );
}

/**
 * Mode pill (Paper CO-0 / 1X1-0) with the concept-I armed states:
 *  - JAM: while PLAYING the pill's border breathes on a ~2.2s inhale/exhale
 *    cycle; stopped = a still half-lit ring (an idle infinite repeat cost
 *    ~22% of a core — perf pass 2026-07-25). Opacity-only over a pre-lit
 *    ring.
 *  - REC: the red dot blinks 8th notes. While the device clock actually runs
 *    (recording) the blink is quantized off `playheadTick` (12 ticks per
 *    8th); while armed / counting in the clock is held, so a wall-clock
 *    repeat at the displayed tempo carries the same rate (the count-in's
 *    clock). Disarming decays the dot out (~380ms) instead of cutting it.
 * Key press behavior (travel + spring) is untouched — this only adds layers.
 */
function ModePill({
  jam,
  playing,
  recordPhase,
  bpm,
  onToggleMode,
}: {
  jam: boolean;
  playing: boolean;
  recordPhase: RecordPhase;
  bpm: number;
  onToggleMode?: () => void;
}) {
  const rec = !jam;
  const recording = rec && recordPhase === 'recording';
  // Reduced Motion here needs care: `withRepeat` propagates its reduceMotion
  // setting into its children, and a `withSequence` under Reduce Motion jumps
  // straight to its LAST leg. Both loops below therefore used to PARK on their
  // dimmest frame (0.2) instead of settling on a readable one — the REC-armed
  // dot became nearly invisible and the playing JAM ring ended up dimmer than
  // its own stopped standby. Principle 5 wants the settled frame, so both are
  // branched explicitly rather than delegated to ReduceMotion.System.
  const reduceMotion = useReducedMotion();

  // --- JAM breathing border -----------------------------------------------
  const breathe = useSharedValue(0);
  const borderOn = useSharedValue(jam ? 1 : 0);
  useEffect(() => {
    borderOn.value = withTiming(jam ? 1 : 0, {
      duration: 250,
      reduceMotion: ReduceMotion.System,
    });
    // Breathe only WHILE PLAYING: an infinite repeat forces 60fps frame
    // production forever — measured ~22% of a core on an otherwise idle sim.
    // Playing already animates every frame (playhead), so the marginal cost
    // is ~0; stopped = a still standby ring (the capsule's rule too).
    if (jam && playing && !reduceMotion) {
      breathe.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
          withTiming(0, { duration: 1100, easing: Easing.inOut(Easing.sin) }),
        ),
        -1,
        false,
        undefined,
        ReduceMotion.System,
      );
    } else {
      // Standby (stopped, or Reduced Motion at any time): the still half-lit
      // ring — the same settled frame in both cases.
      cancelAnimation(breathe);
      breathe.value = withTiming(jam ? 0.5 : 0, { duration: 250, reduceMotion: ReduceMotion.System });
    }
    return () => cancelAnimation(breathe);
  }, [jam, playing, reduceMotion, breathe, borderOn]);
  const breatheStyle = useAnimatedStyle(() => ({
    opacity: borderOn.value * (0.2 + 0.55 * breathe.value),
  }));

  // --- REC dot: attack / blink / disarm decay ------------------------------
  const dotOn = useSharedValue(rec ? 1 : 0); // brightness envelope
  const dotW = useSharedValue(rec ? 1 : 0); // layout collapse (non-rhythmic)
  useEffect(() => {
    if (rec) {
      cancelAnimation(dotOn);
      dotOn.value = 1; // LEDs attack instantly
      dotW.value = withTiming(1, { duration: 120, reduceMotion: ReduceMotion.System });
    } else {
      // Disarm: decay the light first, then collapse the slot.
      dotOn.value = withTiming(0, {
        duration: 380,
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      });
      dotW.value = withDelay(
        320,
        withTiming(0, { duration: 160, reduceMotion: ReduceMotion.System }),
      );
    }
  }, [rec, dotOn, dotW]);

  // Recording: quantize the tick to integer 8ths FIRST, then decay per event.
  const recordingSV = useSharedValue(0);
  useEffect(() => {
    recordingSV.value = recording ? 1 : 0;
  }, [recording, recordingSV]);
  const blinkSV = useSharedValue(1);
  const eighth = useDerivedValue(() =>
    recordingSV.value === 1 && playheadPlaying.value
      ? Math.floor(playheadTick.value / 12)
      : -1,
  );
  useAnimatedReaction(
    () => eighth.value,
    (cur, prev) => {
      if (cur === prev) return;
      if (reduceMotion) {
        // Settled frame = LIT. The blink is the "recording" state's only
        // visual, so Reduce Motion holds it on rather than dropping it.
        blinkSV.value = 1;
        return;
      }
      if (cur === -1) {
        blinkSV.value = withTiming(1, { duration: 200, reduceMotion: ReduceMotion.System });
        return;
      }
      if (cur % 2 === 0) {
        blinkSV.value = 1; // instant attack on the downbeat 8th
        blinkSV.value = withTiming(0.2, {
          duration: 180,
          easing: Easing.out(Easing.quad),
          reduceMotion: ReduceMotion.System,
        });
      }
    },
  );

  // Armed / count-in: the sequencer clock is held, so blink on a wall-clock
  // repeat at the displayed tempo — one lit-and-decayed 8th per 8th.
  const pulse = useSharedValue(1);
  useEffect(() => {
    if (!rec || recording || reduceMotion) {
      // Reduced Motion: hold the armed dot SOLID. Record-armed is load-bearing
      // state — the blink may go, the light may not.
      cancelAnimation(pulse);
      pulse.value = 1;
      return;
    }
    const eighthMs = 30000 / Math.max(20, Math.min(300, bpm));
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0.2, { duration: eighthMs * 0.9, easing: Easing.out(Easing.quad) }),
        withTiming(0.2, { duration: eighthMs * 1.1 }),
      ),
      -1,
      false,
      undefined,
      ReduceMotion.System,
    );
    return () => cancelAnimation(pulse);
  }, [rec, recording, reduceMotion, bpm, pulse]);

  const dotStyle = useAnimatedStyle(() => ({
    opacity: dotOn.value * (recordingSV.value === 1 ? blinkSV.value : pulse.value),
    width: 7 * dotW.value,
    marginRight: 6 * dotW.value,
  }));

  return (
    <Key
      onPress={onToggleMode}
      disabled={!onToggleMode}
      hitSlop={space.sm}
      style={styles.modePill}
      accessibilityRole="button"
      accessibilityLabel={jam ? 'Switch to record mode' : 'Switch to jam mode'}
    >
      <Animated.View pointerEvents="none" style={[styles.breatheRing, breatheStyle]} />
      <Animated.View style={[styles.modeDot, dotStyle]} />
      <AppText style={[styles.modeLabel, !jam && styles.modeLabelRec]}>
        {jam ? 'JAM' : 'REC'}
      </AppText>
    </Key>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    // FIXED height (Paper rows: 77 = 1px top border + 12px padding + 52px play
    // button + 12px padding) so switching between the playback and record UIs
    // can never reflow the screen — a minHeight of 76 let jam mode (77 natural)
    // sit 1px taller than record mode (clamped to 76), jiggling the lane list
    // on every mode toggle.
    height: 77,
    paddingVertical: space.md,
    paddingHorizontal: 18,
    backgroundColor: '#0A0A0A',
    borderTopWidth: 1,
    borderTopColor: color.surface,
    // Subtle upward shadow so the pinned bar reads as floating over the lane
    // list scrolling beneath it (Paper 2026-07-24 depth pass).
    shadowColor: '#000000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -8 },
  },
  bpmCol: { flex: 1 },
  pressedDim: { opacity: 0.65 },
  bpmBlock: { alignItems: 'center', alignSelf: 'flex-start' },
  bpmValue: {
    fontFamily: font.display,
    fontWeight: '700',
    fontSize: 24,
    lineHeight: 30,
    letterSpacing: -0.5,
    color: color.label,
  },
  bpmLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 10,
    lineHeight: 12,
    letterSpacing: 0.8,
    color: color.label25,
  },
  buttons: { flexDirection: 'row', alignItems: 'center', gap: space.lg },
  play: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: color.label,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playDisabled: { backgroundColor: color.surface2 },
  // Fixed width + left alignment so the dot sits at the same x in every
  // record state regardless of text length (Paper "Transport · Record states").
  recIndicator: { flexDirection: 'row', alignItems: 'center', gap: 11, width: 180, flexShrink: 0 },
  armGlyphs: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  armRecordIcon: { width: 12, height: 12, borderRadius: 999, backgroundColor: color.danger },
  armGlyphSep: { fontFamily: font.text, fontWeight: '600', fontSize: 14, lineHeight: 18, color: color.label25 },
  recDot: {
    width: 16,
    height: 16,
    borderRadius: 999,
    backgroundColor: color.danger,
    shadowColor: color.danger,
    shadowOpacity: 0.7,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  recRing: { width: 16, height: 16, borderRadius: 999, borderWidth: 2 },
  recText: { gap: 1 },
  recTitle: { fontFamily: font.text, fontWeight: '600', fontSize: 15, lineHeight: 18, color: '#FFFFFF' },
  recSub: { fontFamily: font.text, fontWeight: '500', fontSize: 12, lineHeight: 16, color: color.label25 },
  right: { flex: 1, alignItems: 'flex-end' },
  modePill: {
    flexDirection: 'row',
    alignItems: 'center',
    // No static gap — the REC dot carries an ANIMATED marginRight so its slot
    // can collapse smoothly when disarming decays it out (concept I).
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: ramp[7],
  },
  // Concept I: pre-lit standby ring — only its opacity breathes (trail grey).
  breatheRing: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#6E6E76',
  },
  modeDot: { width: 7, height: 7, borderRadius: 999, backgroundColor: color.danger },
  modeLabel: {
    fontFamily: font.text,
    fontWeight: '700',
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0.88,
    color: color.label,
  },
  modeLabelRec: { color: color.danger },
});
