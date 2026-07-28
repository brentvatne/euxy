/**
 * FloatingActions — the Sequencer's floating capsule, rebuilt per the decided
 * E spec (Paper "Floating bar — concepts" → "E · CHOSEN" + gesture/animation
 * card; chrome from the canonical "01 · Sequencer" bar): temp key · dice ·
 * add lane. The capsule is ALIVE:
 *
 *   • Dice press scatters the 5 pips (~250ms of shuffled frames, instant
 *     attack each) while concept J's reroll wash sweeps the lane grid FROM
 *     the capsule (step-strip owns the wash; the store carries the signal).
 *   • Temp is a resident key (Brent's corrected semantics 2026-07-25): tap
 *     stores the current state away and the dot lights; every edit then
 *     rides live; tap again restores that state and disarms (a bail-out);
 *     long-press fills an LED ring (~500ms) = keep the edits + disarm.
 *   • While playing, the capsule breathes: dims to 60% two beats after the
 *     last touch; the dice's light pixel ticks the downbeat. All clock-synced
 *     motion derives from playheadTick on the UI thread — nothing re-renders
 *     on the tick.
 *   • Drag lifts the capsule and snaps it to a bottom corner (persisted).
 *
 * Chrome (Paper 5SI-0): Liquid Glass container (rgba(28,28,34,.55) mock →
 * native GlassView) + 0.5px rgba(255,255,255,.12) rim + solid #2C2C2E keys,
 * padding 8 · gap 10 · 48px keys · 14px margin. Fallback = solid #16161D.
 */
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  FadeInDown,
  FadeOut,
  ReduceMotion,
  runOnJS,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Path, Rect } from 'react-native-svg';

import { playheadPlaying, playheadTick } from '@/core/playhead';
import { useStore } from '@/state/store';
import { CAPSULE_DRAG } from '@/lib/flags';
import { GlassView, haptics, liquidGlassAvailable } from '@/lib/shims';
import { color, ramp, timing } from '@/theme/tokens';
import { Key } from '@/components/ui/key';

const AnimatedRect = Animated.createAnimatedComponent(Rect);

// Paper 5SI-0 chrome: 48px keys on padding 8 / gap 10, 14px screen margin.
const KEY_SIZE = 48;
const PAD = 8;
const KEY_GAP = 10;
const MARGIN = 14;

// Paper dice glyph: 18px box, drawn in a 22-unit viewBox — pips are 3.2u
// rounded rects (rx 1) at coordinates 5.2 / 9.4 / 13.6.
const GLYPH = 18;
const U = GLYPH / 22;
const PIP = 3.2 * U;
const PIP_R = 1 * U;
const PIP_COORD = [5.2 * U, 9.4 * U, 13.6 * U];
/** Rest cells of the 5 pips on the glyph's 3×3 grid: TL TR C BL BR. */
const REST_CELLS = [
  [0, 0],
  [2, 0],
  [1, 1],
  [0, 2],
  [2, 2],
] as const;
/** The dice's "light pixel" (E spec) — top-left pip: ticks the downbeat,
 * lands last after a scatter, receives the keep-ring's drained light. */
const LIGHT_PIP = 0;
const ALL_CELLS: readonly (readonly [number, number])[] = [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
  [0, 2], [1, 2], [2, 2],
];

// Temp key hold: the trace waits RING_DELAY_MS before it starts filling —
// a simple tap never flashes it (Brent) — then fills over HOLD_MS; keep
// fires at RING_DELAY_MS + HOLD_MS. Release ≤250ms reads as a tap.
const HOLD_MS = 500;
const TAP_MS = 250;
const RING_DELAY_MS = 150;
// Full bar height — the keep trace and armed rim wrap the whole capsule
// (temp variant A, Brent's pick 2026-07-25).
const BAR_H = KEY_SIZE + PAD * 2;
const TRACE_INSET = 1;
const TRACE_R = (BAR_H - TRACE_INSET * 2) / 2;

const SPRING = { damping: 18, stiffness: 260, reduceMotion: ReduceMotion.System };
// Drag settle — near-critical (ζ≈0.9) so the capsule lands with one tight
// settle instead of a wobble (Brent: drag felt too bouncy).
const SNAP = { damping: 34, stiffness: 340, reduceMotion: ReduceMotion.System };
// Seconds of "flight" a release velocity projects forward when picking the
// landing corner — a real throw goes where it was headed.
const THROW_PROJECTION_S = 0.18;

// An occasional entrance can afford to be legible, but it should arrive
// immediately under the finger: strong ease-out, opacity-led, and only 8pt of
// travel. The old 140ms curve produced too few painted frames on a cold boot;
// 200ms stays inside the small-popover budget while preserving the first-frame
// response. Exit is deliberately faster and drops movement entirely.
const CAPSULE_EASE_OUT = Easing.bezier(0.23, 1, 0.32, 1);
const CAPSULE_ENTER = FadeInDown.duration(200)
  .easing(CAPSULE_EASE_OUT)
  .withInitialValues({ opacity: 0, transform: [{ translateY: 8 }] })
  .reduceMotion(ReduceMotion.System);
const CAPSULE_EXIT = FadeOut.duration(120)
  .easing(CAPSULE_EASE_OUT)
  .reduceMotion(ReduceMotion.System);

/** One scatter press: 3–4 frames of random pip cells (5 distinct per frame). */
function rollScatterFrames(): number[][][] {
  const frames = 3 + (Math.random() < 0.5 ? 1 : 0);
  return Array.from({ length: frames }, () => {
    const cells = [...ALL_CELLS];
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    return cells.slice(0, 5).map((c) => [...c]);
  });
}

export function FloatingActions({
  canMutate,
  snapshotActive,
  onAddLane,
  onMutate,
  onArm,
  onRevert,
  onKeep,
}: {
  canMutate: boolean;
  /** Temp mode armed — the resident temp key renders lit. */
  snapshotActive: boolean;
  onAddLane: () => void;
  onMutate: () => void;
  onArm: () => void;
  onRevert: () => void;
  onKeep: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const corner = useStore((s) => s.settings.floatBarCorner);
  const setFloatBarCorner = useStore((s) => s.setFloatBarCorner);
  const [barW, setBarW] = useState(0);

  // Drag state: anchorX offsets the right-docked bar to the left corner;
  // tx/ty ride the live gesture; lift scales it up while held.
  const anchorX = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lift = useSharedValue(0);
  const anchorFor = (c: 'left' | 'right', w: number) =>
    c === 'left' ? -(screenW - w - MARGIN * 2) : 0;
  const anchorInit = useRef(false);
  useEffect(() => {
    if (barW === 0) return;
    // Drag disabled → ignore any persisted corner (it would be stranded)
    // and dock at the designed bottom-right home.
    const target = CAPSULE_DRAG ? anchorFor(corner, barW) : 0;
    // First layout docks instantly (no boot slide); later changes spring.
    anchorX.value = anchorInit.current ? withSpring(target, SNAP) : target;
    anchorInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corner, barW, screenW]);

  // Breathing (E spec): dim to 60% two beats after the last touch, playing
  // only. Quantize first — the derived beat re-runs styles per beat, never
  // per frame. touchBeat re-arms on any touch and on transport start.
  const beat = useDerivedValue(() => Math.floor(playheadTick.value / timing.ppqn));
  const touchBeat = useSharedValue(0);
  useAnimatedReaction(
    () => playheadPlaying.value,
    (playing, prev) => {
      if (playing === 1 && prev !== 1) touchBeat.value = beat.value;
    },
  );
  const breatheStyle = useAnimatedStyle(() => {
    const dim =
      !reducedMotion && playheadPlaying.value === 1 && beat.value - touchBeat.value >= 2;
    // Re-light instantly (LED attack); dim eases out like a decay.
    return {
      opacity: dim
        ? withTiming(0.6, { duration: 400, easing: Easing.out(Easing.quad) })
        : withTiming(1, { duration: 80 }),
    };
  });
  const relight = () => {
    touchBeat.value = Math.floor(playheadTick.value / timing.ppqn);
  };

  // Temp variant A (Brent's pick): the WHOLE bar wears the mode. Armed = the
  // glass hairline becomes a lit rim (instant on, quick decay off); keep =
  // the outline TRACES clockwise around the capsule. The trace's shared
  // values live here (the bar draws them) but the temp key's press machine
  // drives them.
  const keepProgress = useSharedValue(0);
  const keepTick = useSharedValue(0);
  const keepDrain = useSharedValue(0);
  // Stadium perimeter at the trace's inset — the dash both the arm draw-in
  // and the keep trace fill.
  const tracePerim =
    2 * (barW - TRACE_INSET * 2 - (BAR_H - TRACE_INSET * 2)) + 2 * Math.PI * TRACE_R;
  // Arming DRAWS the rim in (Brent): a quick clockwise trace of the outline
  // (~320ms, the same path the keep trace runs) while the glow halo blooms
  // in underneath. Disarming UNDRAWS it — the line retracts back toward the
  // temp key (~220ms, Brent's correction) while the halo fades with it.
  const armProgress = useSharedValue(0);
  useEffect(() => {
    // RETARGET from wherever the line currently sits (principle 7). The
    // `armProgress.value = 0` that used to precede the draw snapped a
    // half-undrawn rim back to nothing before redrawing it — a visible cut on
    // a key that gets mashed. Durations scale by the distance still to travel,
    // so a re-arm from 60% drawn doesn't crawl through the last 40%.
    if (snapshotActive) {
      armProgress.value = withTiming(1, {
        duration: Math.max(80, 320 * (1 - armProgress.value)),
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      });
    } else {
      armProgress.value = withTiming(0, {
        duration: Math.max(60, 220 * armProgress.value),
        // ease-OUT on the retract as well: ease-in held the line still for the
        // first frames after the tap, the exact moment being watched.
        easing: Easing.out(Easing.quad),
        reduceMotion: ReduceMotion.System,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshotActive]);
  const rimGlowStyle = useAnimatedStyle(() => ({
    opacity: withTiming(snapshotActive ? 1 : 0, {
      duration: snapshotActive ? 320 : 220,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    }),
  }));
  // The line's visibility rides the draw itself — dash length carries both
  // the draw-in and the undraw; opacity only kills the dot that remains at 0.
  // While a keep hold fills, the armed rim DUCKS to 25% (by 15% of the fill)
  // so the bright trace draws on a near-dark track — line-over-line was too
  // subtle to see (Brent). Early release drains keepProgress → rim restores.
  const rimLineStyle = useAnimatedStyle(() => {
    const duck = 1 - 0.75 * Math.min(1, keepProgress.value / 0.15);
    return { opacity: armProgress.value > 0.001 ? duck : 0 };
  });
  const rimLineProps = useAnimatedProps(() => ({
    strokeDashoffset: tracePerim * (1 - armProgress.value),
  }));
  const traceProps = useAnimatedProps(() => ({
    strokeDashoffset: tracePerim * (1 - keepProgress.value),
  }));
  // Same dash, separate hook (an animatedProps instance binds to ONE view):
  // drives the soft halo stroke under the crisp trace line.
  const traceGlowProps = useAnimatedProps(() => ({
    strokeDashoffset: tracePerim * (1 - keepProgress.value),
  }));
  const traceStyle = useAnimatedStyle(() => ({
    // Hidden at rest; brightens on each quarter tick; hands its light to the
    // drain dot on keep (same formula the per-key ring used). Epsilon, not
    // `=== 0`: the trace now decays THROUGH zero on a re-press instead of
    // being hard-reset to it, so it must not flicker on the way past.
    opacity:
      keepProgress.value < 0.001 ? 0 : (0.85 + 0.15 * keepTick.value) * (1 - keepDrain.value),
  }));

  const pan = Gesture.Pan()
    // Drag is temporarily disabled via the flag — gesture kept wired so
    // flipping CAPSULE_DRAG back on restores drag/throw/corner-snap whole.
    .enabled(CAPSULE_DRAG)
    // Let key presses win until the finger commits to a real drag.
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onStart(() => {
      lift.value = withTiming(1, { duration: 120 });
    })
    .onUpdate((e) => {
      tx.value = e.translationX;
      ty.value = e.translationY;
    })
    .onEnd((e) => {
      lift.value = withTiming(0, { duration: 160 });
      // The capsule is THROWABLE: pick the corner from where the flick is
      // HEADED (release position projected ~180ms along the gesture
      // velocity), not just where the finger lets go, and feed the velocity
      // into the settle springs so the throw carries through the landing.
      const center = screenW - MARGIN - barW / 2 + anchorX.value + tx.value;
      const projected = center + e.velocityX * THROW_PROJECTION_S;
      const left = projected < screenW / 2;
      anchorX.value = withSpring(left ? -(screenW - barW - MARGIN * 2) : 0, SNAP);
      tx.value = withSpring(0, { ...SNAP, velocity: e.velocityX });
      ty.value = withSpring(0, { ...SNAP, velocity: e.velocityY });
      runOnJS(setFloatBarCorner)(left ? 'left' : 'right');
    });

  // Dice press gives the capsule a playful reaction (Brent — the first cut,
  // a fast horizontal jitter, read as an error shake), RANDOMIZED per press
  // like the roll itself: tumble left / tumble right (underdamped tilt +
  // small pop), a little hop, or a boing pop. All springs, all one-shots on
  // a single view; the random pick happens JS-side.
  const roll = useSharedValue(0); // ±1 → tilt direction + small pop
  const sway = useSharedValue(0); // horizontal drift riding the tumble
  const hop = useSharedValue(0); // translateY offset
  const pop = useSharedValue(0); // pure scale boing
  const lastShakeStyle = useRef(-1);
  const triggerShake = () => {
    if (reducedMotion) return;
    // IMPULSE physics (motion principle 7, Brent round 2 — the sequenced
    // attack+return chain piled up under mashing and took ages to settle):
    // every value has ONE spring, always targeting rest; a press just KICKS
    // velocity into it. Position carries over, kicks land instantly, and
    // settle time after the last press is a single spring's ring (~450ms).
    // Decay rate rides the damping — 9→12 lands ~25% faster settle (Brent);
    // stiffness up alongside keeps the wobble count/character similar.
    const wobble = { damping: 12, stiffness: 400 };
    // Additive displacement kick: jump BY the kick amount from the current
    // position (instant attack — LED language), then one spring rings back
    // to rest. Mash-friendly by construction: kicks stack onto wherever the
    // bar is, and settle is always a single spring from the last hit. (The
    // withSpring `velocity` route silently did nothing here — springs
    // parked at their target complete immediately and the kick was
    // swallowed; displacement can't be.)
    const kick = (v: SharedValue<number>, amount: number, cap: number) => {
      v.value = Math.max(-cap, Math.min(cap, v.value + amount));
      v.value = withSpring(0, wobble);
    };
    // Random style, but never the SAME one twice in a row (Brent): draw
    // from the other three and skip past the last pick.
    let style: number;
    if (lastShakeStyle.current < 0) {
      style = Math.floor(Math.random() * 4);
    } else {
      style = Math.floor(Math.random() * 3);
      if (style >= lastShakeStyle.current) style += 1;
    }
    lastShakeStyle.current = style;
    if (style <= 1) {
      const dir = style === 0 ? 1 : -1;
      kick(roll, dir * 0.9, 1.3);
      // ...with a bit of shake riding it: the bar drifts against the tilt
      // and sways back on the same ring.
      kick(sway, dir * -4, 6);
    } else if (style === 2) {
      kick(hop, -4.5, 7);
    } else {
      kick(pop, 0.9, 1.3);
    }
  };

  const dragStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: anchorX.value + tx.value + sway.value },
      { translateY: ty.value + hop.value },
      { rotate: `${-2.2 * roll.value}deg` },
      { scale: 1 + 0.04 * lift.value + 0.03 * Math.abs(roll.value) + 0.05 * pop.value },
    ],
  }));

  const keys = (
    <>
      {/* Temp is a RESIDENT key (Brent's corrected semantics): tap to hold
          the current state away, tap again to jump back, long-press to keep. */}
      <TempKey
        engaged={snapshotActive}
        reducedMotion={reducedMotion}
        keepProgress={keepProgress}
        keepTick={keepTick}
        keepDrain={keepDrain}
        onArm={onArm}
        onRevert={onRevert}
        onKeep={onKeep}
      />
      <DiceKey
        disabled={!canMutate}
        reducedMotion={reducedMotion}
        onMutate={() => {
          triggerShake();
          onMutate();
        }}
      />
      <AddKey onPress={onAddLane} />
    </>
  );

  return (
    // The capsule owns its own gesture root — the sequencer screen itself
    // stays plain (only Patterns wraps a whole screen today).
    <GestureHandlerRootView pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <GestureDetector gesture={pan}>
        {/* Outer view owns mount animation; the inner one owns the drag
            transform + breathing opacity. The anchor is absolute and fixed,
            so a layout transition only adds a competing tail. */}
        <Animated.View
          // Mounted only while lanes exist (and never during boot) — so this
          // entrance covers both app open and easing out of the empty state.
          entering={CAPSULE_ENTER}
          exiting={CAPSULE_EXIT}
          style={styles.barAnchor}
          onLayout={(e) => setBarW(e.nativeEvent.layout.width)}
        >
          <Animated.View style={[dragStyle, breatheStyle]} onTouchStart={relight}>
            {liquidGlassAvailable && GlassView ? (
              // Real material refracts the playhead LEDs sweeping beneath
              // it; the rim + tint match the Paper mock (rgba(28,28,34,.55)).
              <GlassView glassEffectStyle="regular" style={[styles.bar, styles.barGlass]}>
                {keys}
              </GlassView>
            ) : (
              <View style={[styles.bar, styles.barSolid]}>{keys}</View>
            )}
            {/* Armed rim (variant A) — glow halo blooms in while the LINE
                draws itself around the outline; disarm undraws it. Both
                start at the top-left arc (right above the temp key, the SVG
                rect path origin) and run clockwise. */}
            <Animated.View pointerEvents="none" style={[styles.rimGlow, rimGlowStyle]} />
            {barW > 0 ? (
              <>
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, rimLineStyle]}>
                  <Svg width={barW} height={BAR_H} viewBox={`0 0 ${barW} ${BAR_H}`}>
                    <AnimatedRect
                      x={TRACE_INSET}
                      y={TRACE_INSET}
                      width={barW - TRACE_INSET * 2}
                      height={BAR_H - TRACE_INSET * 2}
                      rx={TRACE_R}
                      fill="none"
                      stroke={color.label}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeDasharray={`${tracePerim}`}
                      animatedProps={rimLineProps}
                    />
                  </Svg>
                </Animated.View>
                {/* Keep trace — a comet of light over the ducked rim: a wide
                    soft halo stroke under a crisp bright line. */}
                <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, traceStyle]}>
                  <Svg width={barW} height={BAR_H} viewBox={`0 0 ${barW} ${BAR_H}`}>
                    <AnimatedRect
                      x={TRACE_INSET}
                      y={TRACE_INSET}
                      width={barW - TRACE_INSET * 2}
                      height={BAR_H - TRACE_INSET * 2}
                      rx={TRACE_R}
                      fill="none"
                      // Keep = COMMIT: the trace wears the success green
                      // (color.connected's role — Brent saw it live and
                      // kept it over the OP-XY cyan). Arming stays white;
                      // persisting is the one green gesture on the bar.
                      stroke="rgba(48,209,88,0.35)"
                      strokeWidth={7}
                      strokeLinecap="round"
                      strokeDasharray={`${tracePerim}`}
                      animatedProps={traceGlowProps}
                    />
                    <AnimatedRect
                      x={TRACE_INSET}
                      y={TRACE_INSET}
                      width={barW - TRACE_INSET * 2}
                      height={BAR_H - TRACE_INSET * 2}
                      rx={TRACE_R}
                      fill="none"
                      stroke={color.connected}
                      strokeWidth={3}
                      strokeLinecap="round"
                      strokeDasharray={`${tracePerim}`}
                      animatedProps={traceProps}
                    />
                  </Svg>
                </Animated.View>
              </>
            ) : null}
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/** Add lane — the + rotates 90° while pressed (E spec), then the existing
 * lane slide-in takes over. */
function AddKey({ onPress }: { onPress: () => void }) {
  const down = useSharedValue(0);
  const rotStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${down.value * 90}deg` }],
  }));
  return (
    <Key
      onPress={onPress}
      onPressIn={() => {
        down.value = withTiming(1, { duration: 140, reduceMotion: ReduceMotion.System });
      }}
      onPressOut={() => {
        down.value = withSpring(0, SPRING);
      }}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Add lane"
    >
      <Animated.View style={rotStyle}>
        {/* Paper 5SI-0: 18px plus, 2.4 stroke, round caps. */}
        <Svg width={GLYPH} height={GLYPH} viewBox="0 0 24 24">
          <Path d="M12 5v14M5 12h14" stroke={color.label} strokeWidth={2.4} strokeLinecap="round" />
        </Svg>
      </Animated.View>
    </Key>
  );
}

/**
 * Mutate — the 5-pip dice glyph (one vocabulary with Lane Editor Randomize).
 * A press scatters the pips to random cells (~250ms, instant attack per
 * frame — a slot-machine shuffle, no tweening) and settles back with the
 * light pixel landing last. While playing, the light pixel ticks the
 * downbeat off the quantized beat.
 */
// TODO(randomize-lock): long-press should open the Randomize-lock sheet —
// not designed yet, so no gesture is wired to it (a dead long-press would
// read as broken).
function DiceKey({
  disabled,
  reducedMotion,
  onMutate,
}: {
  disabled: boolean;
  reducedMotion: boolean;
  onMutate: () => void;
}) {
  const [scatter, setScatter] = useState<{ nonce: number; frames: number[][][] } | null>(null);
  const glow = useSharedValue(0);

  // Downbeat tick (quantize first: derived integer beat → opacity only).
  const beat = useDerivedValue(() =>
    playheadPlaying.value === 1 ? Math.floor(playheadTick.value / timing.ppqn) : -1,
  );
  useAnimatedReaction(
    () => beat.value,
    (b, prev) => {
      if (reducedMotion || b < 0 || b === prev || b % 4 !== 0) return;
      glow.value = 1; // instant attack
      glow.value = withTiming(0, { duration: 300, easing: Easing.out(Easing.quad) });
    },
  );
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.9 * glow.value }));

  return (
    <Key
      disabled={disabled}
      onPress={() => {
        if (!reducedMotion) setScatter((s) => ({ nonce: (s?.nonce ?? 0) + 1, frames: rollScatterFrames() }));
        onMutate();
      }}
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Mutate pattern"
      accessibilityState={{ disabled }}
    >
      <View style={[styles.glyph, disabled ? styles.glyphDisabled : null]}>
        {REST_CELLS.map((cell, i) => (
          <Pip key={i} index={i} rest={cell} scatter={scatter} />
        ))}
        {/* The light pixel's downbeat bloom — a lit film over the TL pip. */}
        <Animated.View pointerEvents="none" style={[styles.pip, styles.pipGlow, glowStyle]} />
      </View>
    </Key>
  );
}

/** One dice pip. Scatter frames land as duration-0 jumps (LEDs never tween
 * between cells); the light pixel's final hop home is delayed to land last. */
function Pip({
  index,
  rest,
  scatter,
}: {
  index: number;
  rest: readonly [number, number];
  scatter: { nonce: number; frames: number[][][] } | null;
}) {
  const x = useSharedValue(PIP_COORD[rest[0]]);
  const y = useSharedValue(PIP_COORD[rest[1]]);
  useEffect(() => {
    if (!scatter) return;
    const FRAME_MS = 65;
    const settleDelay = index === LIGHT_PIP ? FRAME_MS + 60 : FRAME_MS;
    const hop = (v: number) => withTiming(v, { duration: 0 });
    const seq = (coord: 0 | 1, restV: number) =>
      withSequence(
        ...scatter.frames.map((f, fi) =>
          fi === 0 ? hop(PIP_COORD[f[index][coord]]) : withDelay(FRAME_MS, hop(PIP_COORD[f[index][coord]])),
        ),
        withDelay(settleDelay, hop(restV)),
      );
    x.value = seq(0, PIP_COORD[rest[0]]);
    y.value = seq(1, PIP_COORD[rest[1]]);
    // Re-fires per press via the nonce; values always end at rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scatter?.nonce]);
  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }],
  }));
  return <Animated.View style={[styles.pip, style]} />;
}

/**
 * Temp key — a RESIDENT third key (Brent's corrected semantics 2026-07-25).
 * Disarmed: ghost outline dot; a TAP stores the current state away and arms
 * (dot lights solid + the BAR's rim lights — variant A). Armed: every edit —
 * dice rolls, lane params, adds, deletes — rides the live side; TAP restores
 * the stored state and DISARMS (the bail-out); LONG-PRESS = keep the edits:
 * the capsule's OUTLINE trace waits 150ms (taps never flash it), fills
 * clockwise over ~500ms with a selection tick at each quarter; completing it
 * pops, drains into the dice's light pixel and the key un-lights. Early
 * release drains the trace back — nothing. The trace itself is drawn by the
 * bar (see FloatingActions); this key only drives the shared values.
 */
function TempKey({
  engaged,
  reducedMotion,
  keepProgress,
  keepTick,
  keepDrain,
  onArm,
  onRevert,
  onKeep,
}: {
  engaged: boolean;
  reducedMotion: boolean;
  keepProgress: SharedValue<number>;
  keepTick: SharedValue<number>;
  keepDrain: SharedValue<number>;
  onArm: () => void;
  onRevert: () => void;
  onKeep: () => void;
}) {
  const flash = useSharedValue(0);
  const dotPulse = useSharedValue(0);

  const pressStart = useRef(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const completed = useRef(false);
  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // The key survives keep now (resident) — settle the ring visuals when
  // temp disarms. `completed` is deliberately NOT reset here: keep fires
  // while the finger is still down, and clearing it early made the RELEASE
  // of that same hold read as a fresh disarmed tap → instant re-arm
  // (Brent's report). The release consumes the flag instead.
  useEffect(() => {
    if (!engaged) {
      keepProgress.value = 0;
      keepDrain.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engaged]);

  const fireKeep = () => {
    completed.current = true;
    haptics.success();
    if (reducedMotion) {
      onKeep();
      return;
    }
    // The pop: bright ack flash, then the trace's light drains into the dice
    // key's light pixel; the store keep lands as the drain finishes and the
    // dot relaxes back to its ghost outline.
    flash.value = 1;
    flash.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
    keepDrain.value = withDelay(120, withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }));
    timers.current.push(setTimeout(onKeep, 340));
  };

  const onPressIn = () => {
    if (completed.current) return;
    pressStart.current = Date.now();
    // The keep trace only exists while armed — a disarmed press is just a key.
    if (!engaged) return;
    // No pre-zero (principle 7): re-pressing while the previous release's drain
    // was still in flight used to blank the trace in one frame and then sit
    // dead through RING_DELAY_MS. Instead the ring-delay window DRAINS any
    // residual to zero — which is exactly what that window means (nothing
    // fills yet) — and the fill then takes the full HOLD_MS, so it still
    // completes precisely when the keep timer below fires. With no residual
    // (the normal case) the first leg is a 150ms hold at 0, as before.
    // Reduced Motion drives no trace at all; the quarter/success haptics carry
    // the hold, matching fireKeep's own reduced-motion path.
    keepProgress.value = reducedMotion
      ? 0
      : withSequence(
          withTiming(0, { duration: RING_DELAY_MS, easing: Easing.out(Easing.quad) }),
          withTiming(1, { duration: HOLD_MS, easing: Easing.linear }),
        );
    // Faint tick at each trace quarter (selection haptic + a brightness blip).
    [0.25, 0.5, 0.75].forEach((q) => {
      timers.current.push(
        setTimeout(() => {
          haptics.selection();
          keepTick.value = 1;
          keepTick.value = withTiming(0, { duration: 150 });
        }, RING_DELAY_MS + HOLD_MS * q),
      );
    });
    timers.current.push(setTimeout(fireKeep, RING_DELAY_MS + HOLD_MS));
  };

  const onPressOut = () => {
    if (completed.current) {
      // This release ends the hold that completed a keep — consume it so
      // the NEXT tap arms fresh; this one must do nothing.
      completed.current = false;
      return;
    }
    clearTimers();
    if (!engaged) {
      // ARM: store the current state away. Any release arms — there is no
      // hold gesture while disarmed.
      haptics.impact('light');
      onArm();
      return;
    }
    const dt = Date.now() - pressStart.current;
    // Releasing right AT completion must still keep: the JS fireKeep timer
    // can lose that race to onPressOut's clearTimers by a few ms, which
    // showed a full ring that then drained (Brent's report).
    if (dt >= RING_DELAY_MS + HOLD_MS - 40) {
      fireKeep();
      // The press is ending NOW — nothing left to consume the flag, and the
      // next tap must arm fresh.
      completed.current = false;
      return;
    }
    // Drain the trace back regardless — only a completed fill keeps.
    keepProgress.value = withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) });
    if (dt > TAP_MS) return; // abandoned hold: nothing happens
    // TAP = jump back (swap). A quick bright blip acknowledges the tap, then
    // the key reads OFF right away (Brent: the light lingering ~1s after a
    // disarm felt broken) — step-strip's reverse wash carries the moment.
    haptics.impact('light');
    if (!reducedMotion) {
      dotPulse.value = withSequence(
        withTiming(1, { duration: 0 }),
        withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }),
      );
    }
    onRevert();
  };

  const flashStyle = useAnimatedStyle(() => ({ opacity: 0.85 * flash.value }));
  const drainStyle = useAnimatedStyle(() => ({
    // The trace's light crosses to the dice key (one key + gap to the RIGHT —
    // temp sits leftmost since the key swap).
    opacity: keepDrain.value === 0 ? 0 : 1 - 0.7 * keepDrain.value,
    transform: [{ translateX: (KEY_SIZE + KEY_GAP) * keepDrain.value }],
  }));
  // Armed = solid lit dot (instant on); disarm reads immediately — a short
  // phosphor decay, not a slow fade (Brent: anything longer looks stuck on).
  const fillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(engaged ? 1 : 0, {
      duration: engaged ? 0 : 120,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    }),
  }));
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: 0.9 * dotPulse.value,
    transform: [{ scale: 1 + 0.5 * dotPulse.value }],
  }));

  return (
    <Key
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      // Press-in stays silent: this key's haptics ARE its resolutions
      // (light = arm/jump-back, selection = ring quarters, success = keep).
      haptic="none"
      style={styles.btn}
      accessibilityRole="button"
      accessibilityLabel="Temp"
      accessibilityState={{ selected: engaged }}
      accessibilityHint={
        engaged
          ? 'Tap to restore the held state and turn temp off. Hold to keep the current pattern.'
          : 'Tap to hold the current state so you can experiment.'
      }
    >
      {/* Ghost dot (Paper: 11px outline, 1.5px #8E8E93); lit solid while
          armed, with a brighter pulse on jump-back. */}
      <View style={styles.ghostDot}>
        <Animated.View pointerEvents="none" style={[styles.ghostDotFill, fillStyle]} />
        <Animated.View pointerEvents="none" style={[styles.ghostDotFill, styles.ghostDotPulse, pulseStyle]} />
      </View>
      <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
      <Animated.View pointerEvents="none" style={[styles.drainDot, drainStyle]} />
    </Key>
  );
}

// Paper 5SI-0: glass capsule (rgba(28,28,34,.55) + blur 24 saturate 160% in
// the mock — real GlassView here), 0.5px rgba(255,255,255,.12) rim, soft
// 0/10/24 shadow, solid #2C2C2E keys. Fallback = the old solid #16161D bar.
const styles = StyleSheet.create({
  barAnchor: {
    position: 'absolute',
    right: MARGIN,
    bottom: MARGIN,
  },
  bar: {
    flexDirection: 'row',
    gap: KEY_GAP,
    padding: PAD,
    borderRadius: 999,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  barGlass: {
    borderWidth: 0.5,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  barSolid: {
    backgroundColor: ramp[7],
  },
  btn: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: 999,
    backgroundColor: color.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    width: GLYPH,
    height: GLYPH,
  },
  glyphDisabled: {
    opacity: 0.4,
  },
  pip: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: PIP,
    height: PIP,
    borderRadius: PIP_R,
    backgroundColor: color.label,
  },
  // Downbeat bloom over the light pixel's rest cell (TL).
  pipGlow: {
    transform: [{ translateX: PIP_COORD[0] }, { translateY: PIP_COORD[0] }],
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  ghostDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: '#8E8E93',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostDotFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: color.label,
  },
  // Jump-back blip: a hot white glow over the lit dot.
  ghostDotPulse: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  // Variant A armed rim, glow layer: a soft halo under the crisp SVG line.
  // Only its OPACITY animates (border + shadow render once — the LED perf
  // rule); the sharp line is the AnimatedRect above it.
  rimGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  flash: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: color.label,
  },
  // The keep trace's light crossing to the dice — WHITE (Brent: the green
  // dot didn't land): the green is the trace's alone, and the light
  // arrives at the dice already wearing the LED white it will live as.
  drainDot: {
    position: 'absolute',
    top: KEY_SIZE / 2 - 2.5,
    left: KEY_SIZE / 2 - 2.5,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    shadowColor: '#FFFFFF',
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
});
