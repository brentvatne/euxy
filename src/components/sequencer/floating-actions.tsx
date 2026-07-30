/* eslint-disable react-hooks/immutability -- Every write this rule flags here
 * is `sharedValue.value = …` on a Reanimated SharedValue, from a gesture
 * handler, a press callback or an effect — never during render. The React
 * Compiler rules model a SharedValue as a frozen object and have no concept of
 * Reanimated's mutable box, so they are false positives to a one. Re-check
 * when Reanimated ships shared-value support for the compiler; until then keep
 * the disable file-scoped rather than adding nine inline comments. */

/**
 * FloatingActions — the Sequencer's floating capsule, rebuilt per the decided
 * E spec (Paper "Floating bar — concepts" → "E · CHOSEN" + gesture/animation
 * card; chrome from the canonical "01 · Sequencer" bar): temp key · dice ·
 * add lane. The capsule is ALIVE:
 *
 *   • Dice TAP scatters the 5 pips (~250ms of shuffled frames, instant attack
 *     each) while concept J's reroll wash sweeps the lane grid FROM the
 *     capsule (step-strip owns the wash; the store carries the signal).
 *   • Dice HOLD CHARGES a roll (issue #48): the capsule contracts to a single
 *     72px encoder under the finger and a 16-LED ring fills clockwise, one LED
 *     per 16th note, so a full charge is exactly one bar. Each tick re-rolls
 *     the pattern — wider in scope and faster in rate as the ring closes — and
 *     the haptic IS the re-roll, so the rate you feel is the rate you see.
 *     Release pops it. See ChargeDice below for the whole machine.
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
import { useEffect, useRef, useState } from "react";
import {
  PixelRatio,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeOut,
  ReduceMotion,
  cancelAnimation,
  interpolateColor,
  useAnimatedProps,
  useAnimatedReaction,
  useAnimatedStyle,
  useDerivedValue,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { CHIPS } from "@/components/patterns/chips";
import Svg, { Path, Rect } from "react-native-svg";

import { playheadPlaying, playheadTick } from "@/core/playhead";
import { useStore } from "@/state/store";
import { CAPSULE_DRAG } from "@/lib/flags";
import { GlassView, haptics, liquidGlassAvailable } from "@/lib/shims";
import { color, ramp, timing } from "@/theme/tokens";
import { Key } from "@/components/ui/key";

const AnimatedRect = Animated.createAnimatedComponent(Rect);
/** The capsule shell itself animates its size during a charge, so the glass
 * container has to be an animated component too. */
const AnimatedGlassView = GlassView
  ? Animated.createAnimatedComponent(GlassView)
  : null;

// Paper 5SI-0 chrome: 48px keys on padding 8 / gap 10, 14px screen margin.
const KEY_SIZE = 48;
const PAD = 8;
const KEY_GAP = 10;
const MARGIN = 14;

// Paper dice glyph: 18px box, drawn in a 22-unit viewBox — pips are 3.2u
// rounded rects (rx 1) at coordinates 5.2 / 9.4 / 13.6.
const GLYPH = 18;
const U = GLYPH / 22;
/** Snap to whole device pixels. The 22-unit artboard scaled to 18pt lands the
 * pips on 7.85 device pixels at 3×, so two edges of every pip are a
 * half-covered grey column and the glyph reads as blurred next to the crisp
 * SF Symbols beside it. Rounding pip size, radius and cell coordinates to the
 * grid keeps the Paper geometry (nothing moves by more than a third of a
 * point) and gives each pip four hard edges. */
const px = (v: number) => PixelRatio.roundToNearestPixel(v);
const PIP = px(3.2 * U);
const PIP_R = px(1 * U);
const PIP_COORD = [px(5.2 * U), px(9.4 * U), px(13.6 * U)];
/** Rest cells of the 5 pips on the glyph's 3×3 grid: TL TR C BL BR. */
const REST_CELLS = [
  [0, 0],
  [2, 0],
  [1, 1],
  [0, 2],
  [2, 2],
] as const;
/**
 * Full charge stops being a dice face at all: the key inverts and the 3×3 pips
 * give way to the `bolt` glyph from the pattern chip set (patterns/chips.ts) —
 * the same 5×5 LED language the rest of the app speaks, so the payoff is a
 * reward rather than a new vocabulary. Lightning is what a full charge IS.
 *
 * Drawn dark-on-white here (the key is inverted at peak), which is why it can't
 * reuse LedChip: that renders light-on-dark on its own chip background.
 */
const PEAK_GLYPH = CHIPS.bolt;
/** 5×5 geometry inside the same 18pt glyph box the 3×3 pips use. */
const PEAK_CELL = 2.6;
const PEAK_STEP = 3.2;
const PEAK_ORIGIN = (GLYPH - (PEAK_STEP * 4 + PEAK_CELL)) / 2;
/**
 * Inverted shades for the three chip levels (rest-dim, lit, light). NOT a
 * straight inversion of CHIP_SHADE_COLORS: those are tuned for light-on-dark,
 * where the dim cells read as unlit LEDs. Carried over at the same relative
 * weight onto white they closed the gaps and the bolt read as a grey block, so
 * the dim tier drops to a ghost and the lit tier goes nearly black.
 */
const PEAK_SHADES = [
  "rgba(10,10,10,0.07)",
  "rgba(10,10,10,0.78)",
  "#0A0A0A",
] as const;
/** Index of the centre pip within REST_CELLS — the one the pop collapses to. */
const CENTER_PIP = 2;
/** The dice's "light pixel" (E spec) — top-left pip: ticks the downbeat,
 * lands last after a scatter, receives the keep-ring's drained light. */
const LIGHT_PIP = 0;
const ALL_CELLS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [1, 1],
  [2, 1],
  [0, 2],
  [1, 2],
  [2, 2],
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
/** The capsule at rest. Fixed geometry, so it is a constant rather than an
 * onLayout measurement: the charge contract animates FROM this number and a
 * measurement arriving a frame late would make the first contract jump. */
const BAR_W = PAD * 2 + KEY_SIZE * 3 + KEY_GAP * 2;
const TRACE_INSET = 1;
const TRACE_R = (BAR_H - TRACE_INSET * 2) / 2;
/** Stadium perimeter at the trace's inset — the dash both the arm draw-in and
 * the keep trace fill. */
const TRACE_PERIM =
  2 * (BAR_W - TRACE_INSET * 2 - (BAR_H - TRACE_INSET * 2)) +
  2 * Math.PI * TRACE_R;

/** The four inset props, as a spreadable object: this RN version's types do
 * not expose `StyleSheet.absoluteFillObject`. */
const FILL = {
  position: "absolute",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
} as const;

const SPRING = {
  damping: 18,
  stiffness: 260,
  reduceMotion: ReduceMotion.System,
};
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
/**
 * The capsule ARRIVES; it does not blink on. The old entrance was a 200ms
 * ease-out across 8pt — too little travel to register as movement and with no
 * overshoot to sell any weight, so it read as a cut with a fade stapled to it.
 *
 * This is a real spring instead: it rises further, scales up from just under
 * full size, and settles through one soft overshoot. The opacity still runs on
 * a timing and finishes EARLY — a spring on alpha reads as a flicker when it
 * overshoots, and the object should be solid well before it stops moving.
 *
 * A custom entering worklet rather than `FadeInDown.springify()` because the
 * scale is what does most of the work here, and the builders only animate the
 * properties they own (opacity + one translate).
 */
const CAPSULE_ENTER = () => {
  'worklet';
  const spring = (dampingRatio: number, duration: number) => ({
    duration,
    dampingRatio,
    reduceMotion: ReduceMotion.System,
  });
  return {
    initialValues: { opacity: 0, transform: [{ translateY: 18 }, { scale: 0.88 }] },
    animations: {
      opacity: withTiming(1, {
        duration: 200,
        easing: CAPSULE_EASE_OUT,
        reduceMotion: ReduceMotion.System,
      }),
      transform: [
        { translateY: withSpring(0, spring(0.62, 480)) },
        { scale: withSpring(1, spring(0.58, 520)) },
      ],
    },
  };
};
const CAPSULE_EXIT = FadeOut.duration(120)
  .easing(CAPSULE_EASE_OUT)
  .reduceMotion(ReduceMotion.System);

// --- Dice charge (issue #48) --------------------------------------------
// The gesture: hold the dice and the capsule becomes one encoder with a ring
// of 16 LEDs; the ring fills on the sequencer clock, one LED per 16th, and
// every tick re-rolls the pattern at the current tier's scope.

/** Below this the press is still a TAP: nothing is ever drawn (Brent's rule
 * for the temp ring, applied here too). */
const CHARGE_ENTER_MS = 120;
/** One LED per 16th → 16 LEDs = one bar = a full charge. */
const RING_LEDS = 16;
/** Contracted capsule: a single round encoder under the finger. */
const CHARGE_D = 72;
/** LED centre radius — inside the 72px encoder, clear of the 48px key. */
const RING_R = 29;
const RING_LED = 4;
/** Steady lit alpha an LED decays to; the 0ms attack tops it to full. */
const LED_STEADY = 0.55;
/** Per-LED attack decay — 0ms attack, then this long back to steady lit. */
const LED_ATTACK_MS = 260;
/** Hairline that leaves on release: 48 → 128px (spec's ring discharge). */
const DISCHARGE_D = 128;
/** How far the contracted encoder will lean after a wandering finger, and how
 * quickly it stops giving. Anchored, not draggable: it is saying "I am still
 * attached to your finger", not offering to be moved. Tuned on device —
 * a wider band (36/50) read as the key being dragged around rather than
 * straining against its mount. */
const PULL_MAX = 14;
const PULL_FALLOFF = 90;
/** Asymptotic rubber band — |result| < PULL_MAX for any input. */
function rubberBand(d: number): number {
  'worklet';
  return (d * PULL_MAX) / (Math.abs(d) + PULL_FALLOFF);
}
/** The charge clock is the sequencer clock, but a bar has to stay a gesture:
 * 20 BPM would make one 12s, 300 BPM a 0.8s flick. */
const CHARGE_BPM_MIN = 90;
const CHARGE_BPM_MAX = 180;
/** How long the closed ring is held, inverted, before it fires ITSELF. A full
 * ring is the commit — there is nothing left for the finger to decide — so the
 * gesture resolves at its own peak instead of idling there. Long enough that
 * the invert and the heavy impact register as "full", short enough that it
 * still reads as one continuous press. */
const PEAK_HOLD_MS = 500;
/** Peak tremor: the key buzzes while the closed ring waits to fire. Small and
 * fast — a machine straining, not a "no" shake. ~17Hz at just over a pixel. */
const SHAKE_PX = 1.2;
const SHAKE_MS = 60;

// response/damping from the spec's motion table, expressed as Reanimated's
// duration + dampingRatio pair.
const CONTRACT_SPRING = {
  duration: 520,
  dampingRatio: 0.85,
  reduceMotion: ReduceMotion.System,
};
const EXPAND_SPRING = {
  duration: 600,
  dampingRatio: 0.7,
  reduceMotion: ReduceMotion.System,
};
const POP_SPRING = {
  duration: 420,
  dampingRatio: 0.55,
  reduceMotion: ReduceMotion.System,
};

type ChargeTier = 1 | 2 | 3 | 4;

/** Every shared value the charge drives. They live in FloatingActions because
 * the capsule shell, the ring and the dice key all read them, and the dice's
 * press machine writes them. */
type Charge = {
  /** 0 = capsule at rest, 1 = contracted to the encoder. */
  contract: SharedValue<number>;
  /** Charge fraction as a spring — the capsule's 1.00 → 1.06 swell. */
  scale: SharedValue<number>;
  /** Charge fraction as a timing — the outer bloom's alpha. */
  bloom: SharedValue<number>;
  /**
   * THE CHARGE CLOCK, and it lives on the UI thread: a linear ramp 0 → 16 over
   * one bar. LED `i` is lit once this passes `i + 1`, and each LED derives its
   * own attack/decay from how far past it the ramp has travelled — so the ring
   * fills in exactly one bar of wall-clock no matter what the JS thread is
   * doing. It was 16 `setTimeout`s once; under the roll load they collapsed
   * into a single frame ~1.4s late and the ring finished filling after the
   * finger had already lifted (measured on device, issue #48).
   */
  fill: SharedValue<number>;
  /** ms per 16th for this charge — the worklets need the tempo. */
  sixteenthMs: SharedValue<number>;
  /** Master ring opacity — kills the LEDs as the discharge leaves. */
  ringOut: SharedValue<number>;
  /** 1 while the ring is closed (full charge held). */
  peak: SharedValue<number>;
  /** 0 → 1 drives the expanding hairline on release. */
  discharge: SharedValue<number>;
  /** Rubber-band lean toward a wandering finger, in points (see rubberBand). */
  pullX: SharedValue<number>;
  pullY: SharedValue<number>;
};

function useCharge(): Charge {
  return {
    contract: useSharedValue(0),
    scale: useSharedValue(0),
    bloom: useSharedValue(0),
    fill: useSharedValue(0),
    sixteenthMs: useSharedValue(125),
    ringOut: useSharedValue(0),
    peak: useSharedValue(0),
    discharge: useSharedValue(0),
    pullX: useSharedValue(0),
    pullY: useSharedValue(0),
  };
}

/** ms per 16th for the charge clock. Faster tempo charges faster; a stopped
 * transport falls back to the 120 BPM equivalent so the gesture always has a
 * length. */
function chargeSixteenthMs(): number {
  const t = useStore.getState().transport;
  const bpm = t.playing ? t.bpm : 120;
  return 60000 / Math.max(CHARGE_BPM_MIN, Math.min(CHARGE_BPM_MAX, bpm)) / 4;
}

type ChargeTick = {
  /** ms after the charge threshold. */
  at: number;
  tier: ChargeTier;
  haptic: "selection" | "light" | "medium";
  /**
   * Whether this tick also re-rolls the pattern. Beat 4 TICKS at 32nds — the
   * haptic is what sells the grind — but only rolls on the 16th: a second
   * store-wide roll inside one 16th is more than the JS thread can render, and
   * a starved charge clock is far worse than a slightly coarser churn (on
   * device the un-capped version put the ring ~1.4s behind the finger).
   */
  roll: boolean;
  /** True on the first tick of a tier — the only ticks Reduced Motion rolls. */
  boundary: boolean;
};

/**
 * The re-roll + haptic schedule, from `startFill` LEDs to the ring's close.
 * One event, fired together: the rate you feel IS the rate the pattern moves.
 *
 *   beat 1  ¼     1 tick   selection      quiet and deliberate
 *   beat 2  ⅛     2 ticks  selection
 *   beat 3  1/16  4 ticks  impactLight    a mechanical stutter
 *   beat 4  1/32  8 ticks  light ×6 + medium ×2   a continuous grind
 */
function chargeTicks(startFill: number, sixteenth: number): ChargeTick[] {
  const out: ChargeTick[] = [];
  for (let s = startFill; s < RING_LEDS; s++) {
    const beat = Math.floor(s / 4);
    // Ticks land at the START of their subdivision, so the first roll fires the
    // instant the charge engages rather than a beat later.
    const offsets =
      beat === 0
        ? s % 4 === 0
          ? [0]
          : []
        : beat === 1
          ? s % 2 === 0
            ? [0]
            : []
          : beat === 2
            ? [0]
            : [0, 0.5];
    for (const o of offsets) {
      out.push({
        at: (s - startFill + o) * sixteenth,
        tier: (beat + 1) as ChargeTier,
        // The last two 32nds lean on the door before it closes.
        haptic:
          beat < 2
            ? "selection"
            : beat === 3 && s === RING_LEDS - 1
              ? "medium"
              : "light",
        // The HAPTIC rate is the escalation you feel; the ROLL rate is how fast
        // the pattern is actually redrawn, and the two do not have to match.
        // Rolling on every 16th through beats 3–4 meant re-rolling EVERY lane
        // 8×/second — the grid stopped reading as a pattern churning and just
        // looked like noise (Brent). From beat 3 the roll halves to the 8th
        // while the ticks keep accelerating, so the gesture still escalates but
        // each state is on screen long enough to register.
        roll: o === 0 && (beat < 2 || s % 2 === 0),
        boundary: s % 4 === 0 && o === 0,
      });
    }
  }
  return out;
}

/** Release weight by the tier the charge reached — there is no wasted charge,
 * every release commits something and says how much. */
function tierForFill(fill: number): ChargeTier {
  return fill >= 12 ? 4 : fill >= 8 ? 3 : fill >= 4 ? 2 : 1;
}

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
  onRoll,
  onChargeCommit,
  onArm,
  onRevert,
  onKeep,
}: {
  canMutate: boolean;
  /** Temp mode armed — the resident temp key renders lit. */
  snapshotActive: boolean;
  onAddLane: () => void;
  onMutate: () => void;
  /** One preview roll of a dice charge, at the tier reached so far. */
  onRoll: (tier: ChargeTier) => void;
  onChargeCommit: (tier: ChargeTier) => void;
  onArm: () => void;
  onRevert: () => void;
  onKeep: () => void;
}) {
  const reducedMotion = useReducedMotion();
  const { width: screenW } = useWindowDimensions();
  const corner = useStore((s) => s.settings.floatBarCorner);
  const setFloatBarCorner = useStore((s) => s.setFloatBarCorner);

  // Drag state: anchorX offsets the right-docked bar to the left corner;
  // tx/ty ride the live gesture; lift scales it up while held.
  const anchorX = useSharedValue(0);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const lift = useSharedValue(0);
  const anchorFor = (c: "left" | "right") =>
    c === "left" ? -(screenW - BAR_W - MARGIN * 2) : 0;
  const anchorInit = useRef(false);
  useEffect(() => {
    // Drag disabled → ignore any persisted corner (it would be stranded)
    // and dock at the designed bottom-right home.
    const target = CAPSULE_DRAG ? anchorFor(corner) : 0;
    // First layout docks instantly (no boot slide); later changes spring.
    anchorX.value = anchorInit.current ? withSpring(target, SNAP) : target;
    anchorInit.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [corner, screenW]);

  const charge = useCharge();

  // Breathing (E spec): dim to 60% two beats after the last touch, playing
  // only. Quantize first — the derived beat re-runs styles per beat, never
  // per frame. touchBeat re-arms on any touch and on transport start.
  const beat = useDerivedValue(() =>
    Math.floor(playheadTick.value / timing.ppqn),
  );
  const touchBeat = useSharedValue(0);
  useAnimatedReaction(
    () => playheadPlaying.value,
    (playing, prev) => {
      if (playing === 1 && prev !== 1) touchBeat.value = beat.value;
    },
  );
  const breatheStyle = useAnimatedStyle(() => {
    const dim =
      !reducedMotion &&
      playheadPlaying.value === 1 &&
      beat.value - touchBeat.value >= 2 &&
      // A charge can be held indefinitely — the capsule must not dim out from
      // under a finger that is on it.
      charge.contract.value < 0.01;
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
  // Arming DRAWS the rim in (Brent): a quick clockwise trace of the outline
  // (~320ms, the same path the keep trace runs) while the glow halo blooms
  // in underneath. Disarming UNDRAWS it — the line retracts back toward the
  // temp key (~220ms, Brent's correction) while the halo fades with it.
  const armProgress = useSharedValue(0);
  // The halo's alpha is its OWN shared value rather than a `withTiming` in the
  // style: the charge multiplies the rim's opacity down, and an animation
  // object can't be multiplied by anything.
  const armGlow = useSharedValue(0);
  useEffect(() => {
    // RETARGET from wherever the line currently sits (principle 7). The
    // `armProgress.value = 0` that used to precede the draw snapped a
    // half-undrawn rim back to nothing before redrawing it — a visible cut on
    // a key that gets mashed. Durations scale by the distance still to travel,
    // so a re-arm from 60% drawn doesn't crawl through the last 40%.
    armGlow.value = withTiming(snapshotActive ? 1 : 0, {
      duration: snapshotActive ? 320 : 220,
      easing: Easing.out(Easing.quad),
      reduceMotion: ReduceMotion.System,
    });
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
  // ARMED + CHARGING: temp mode has to stay legible while the capsule
  // contracts, so the rim CHANGES SHAPE rather than leaving. Two layers split
  // the job, because neither can do both:
  //
  //   • the SVG stadium (rimLine) owns the draw-on, since only a dash offset
  //     can trace the outline clockwise — but its geometry is a fixed
  //     180×64 stadium, which is nonsense around a 72px encoder, so it hands
  //     off during the contract;
  //   • rimCircle is a plain bordered view on absolute-fill, so it inherits
  //     whatever shape the shell currently is and stays correct the whole way
  //     down. It has no draw-on, which costs nothing here: a charge can only
  //     start once the arm has already finished drawing.
  //
  // The halo (rimGlow) is also absolute-fill, so it just tracks the shell and
  // needs no handoff at all.
  //
  // The `charge.contract.value` read is INLINED into each style below rather
  // than shared through a `rimFade()` helper worklet. useAnimatedStyle derives
  // its mapper inputs from the shared values in its OWN closure; behind a
  // helper, `charge` lives in the helper's closure instead, so the style never
  // subscribed to `contract` and simply never re-ran as the capsule
  // contracted — the full-size stadium stayed lit around a 72px encoder.
  const rimGlowStyle = useAnimatedStyle(() => ({ opacity: armGlow.value }));
  // The circle takes over exactly as fast as the stadium leaves, so the two
  // cross-fade into one continuous outline.
  const rimCircleStyle = useAnimatedStyle(() => {
    const took = Math.min(1, charge.contract.value * 3);
    return { opacity: armProgress.value * took };
  });
  // The line's visibility rides the draw itself — dash length carries both
  // the draw-in and the undraw; opacity only kills the dot that remains at 0.
  // While a keep hold fills, the armed rim DUCKS to 25% (by 15% of the fill)
  // so the bright trace draws on a near-dark track — line-over-line was too
  // subtle to see (Brent). Early release drains keepProgress → rim restores.
  const rimLineStyle = useAnimatedStyle(() => {
    const fade = 1 - Math.min(1, charge.contract.value * 3);
    const duck = 1 - 0.75 * Math.min(1, keepProgress.value / 0.15);
    return { opacity: armProgress.value > 0.001 ? duck * fade : 0 };
  });
  const rimLineProps = useAnimatedProps(() => ({
    strokeDashoffset: TRACE_PERIM * (1 - armProgress.value),
  }));
  const traceProps = useAnimatedProps(() => ({
    strokeDashoffset: TRACE_PERIM * (1 - keepProgress.value),
  }));
  // Same dash, separate hook (an animatedProps instance binds to ONE view):
  // drives the soft halo stroke under the crisp trace line.
  const traceGlowProps = useAnimatedProps(() => ({
    strokeDashoffset: TRACE_PERIM * (1 - keepProgress.value),
  }));
  const traceStyle = useAnimatedStyle(() => {
    // Hidden at rest; brightens on each quarter tick; hands its light to the
    // drain dot on keep (same formula the per-key ring used). Epsilon, not
    // `=== 0`: the trace now decays THROUGH zero on a re-press instead of
    // being hard-reset to it, so it must not flicker on the way past.
    const fade = 1 - Math.min(1, charge.contract.value * 3);
    return {
      opacity:
        keepProgress.value < 0.001
          ? 0
          : (0.85 + 0.15 * keepTick.value) * (1 - keepDrain.value) * fade,
    };
  });

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
      const center = screenW - MARGIN - BAR_W / 2 + anchorX.value + tx.value;
      const projected = center + e.velocityX * THROW_PROJECTION_S;
      const left = projected < screenW / 2;
      anchorX.value = withSpring(
        left ? -(screenW - BAR_W - MARGIN * 2) : 0,
        SNAP,
      );
      tx.value = withSpring(0, { ...SNAP, velocity: e.velocityX });
      ty.value = withSpring(0, { ...SNAP, velocity: e.velocityY });
      scheduleOnRN(setFloatBarCorner, left ? "left" : "right");
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
      // The contract keeps the DICE KEY still: the capsule is right/bottom
      // anchored, so shrinking it toward a 72px circle would slide its centre
      // 54pt right and 4pt down — these two terms put it back. The dice is the
      // middle key, so the capsule's centre IS the key's centre.
      {
        translateX:
          anchorX.value +
          tx.value +
          sway.value -
          ((BAR_W - CHARGE_D) / 2) * charge.contract.value +
          // Lean after a wandering finger, multiplied by `contract` so the pull
          // only exists while the capsule IS the encoder.
          charge.pullX.value * charge.contract.value,
      },
      {
        translateY:
          ty.value +
          hop.value +
          ((CHARGE_D - BAR_H) / 2) * charge.contract.value +
          charge.pullY.value * charge.contract.value,
      },
      { rotate: `${-2.2 * roll.value}deg` },
      {
        scale:
          1 +
          0.04 * lift.value +
          0.03 * Math.abs(roll.value) +
          0.05 * pop.value +
          // The capsule swells as it charges (retargeted per LED, so it never
          // restarts) — something straining to get away from you. The swell
          // rides the ring LINEARLY rather than settling early, so it is still
          // visibly growing at the top of the charge instead of parking near
          // its maximum inside the first beat.
          0.22 * charge.scale.value,
      },
    ],
  }));

  // Shell = the glass/solid capsule itself. Its SIZE is what contracts; the
  // key row inside stays 180 wide and centred, so the dice never moves and the
  // outer keys are clipped as they slide under.
  const shellStyle = useAnimatedStyle(() => ({
    width: BAR_W + (CHARGE_D - BAR_W) * charge.contract.value,
    height: BAR_H + (CHARGE_D - BAR_H) * charge.contract.value,
  }));

  const keys = (
    <View style={styles.row}>
      {/* Temp is a RESIDENT key (Brent's corrected semantics): tap to hold
          the current state away, tap again to jump back, long-press to keep. */}
      <SideKey charge={charge} side="left">
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
      </SideKey>
      <ChargeDice
        disabled={!canMutate}
        reducedMotion={reducedMotion}
        charge={charge}
        onMutate={() => {
          triggerShake();
          onMutate();
        }}
        onRoll={onRoll}
        onChargeCommit={onChargeCommit}
      />
      <SideKey charge={charge} side="right">
        <AddKey onPress={onAddLane} />
      </SideKey>
    </View>
  );

  return (
    // The capsule owns its own gesture root — the sequencer screen itself
    // stays plain (only Patterns wraps a whole screen today).
    <GestureHandlerRootView
      pointerEvents="box-none"
      style={StyleSheet.absoluteFill}
    >
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
        >
          <Animated.View
            style={[dragStyle, breatheStyle]}
            onTouchStart={relight}
          >
            {liquidGlassAvailable && AnimatedGlassView ? (
              // Real material refracts the playhead LEDs sweeping beneath
              // it; the rim + tint match the Paper mock (rgba(28,28,34,.55)).
              <AnimatedGlassView
                glassEffectStyle="regular"
                style={[styles.bar, styles.barGlass, shellStyle]}
              >
                {keys}
              </AnimatedGlassView>
            ) : (
              <Animated.View style={[styles.bar, styles.barSolid, shellStyle]}>
                {keys}
              </Animated.View>
            )}
            {/* Armed rim (variant A) — glow halo blooms in while the LINE
                draws itself around the outline; disarm undraws it. Both
                start at the top-left arc (right above the temp key, the SVG
                rect path origin) and run clockwise. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.rimGlow, rimGlowStyle]}
            />
            {/* The armed rim once the capsule is no longer a stadium — same
                white hairline, inheriting the contracting shell's shape. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.rimCircle, rimCircleStyle]}
            />
            <Animated.View
              pointerEvents="none"
              style={[styles.rimLayer, rimLineStyle]}
            >
              <Svg
                width={BAR_W}
                height={BAR_H}
                viewBox={`0 0 ${BAR_W} ${BAR_H}`}
              >
                <AnimatedRect
                  x={TRACE_INSET}
                  y={TRACE_INSET}
                  width={BAR_W - TRACE_INSET * 2}
                  height={BAR_H - TRACE_INSET * 2}
                  rx={TRACE_R}
                  fill="none"
                  stroke={color.label}
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeDasharray={`${TRACE_PERIM}`}
                  animatedProps={rimLineProps}
                />
              </Svg>
            </Animated.View>
            {/* Keep trace — a comet of light over the ducked rim: a wide
                soft halo stroke under a crisp bright line. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.rimLayer, traceStyle]}
            >
              <Svg
                width={BAR_W}
                height={BAR_H}
                viewBox={`0 0 ${BAR_W} ${BAR_H}`}
              >
                <AnimatedRect
                  x={TRACE_INSET}
                  y={TRACE_INSET}
                  width={BAR_W - TRACE_INSET * 2}
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
                  strokeDasharray={`${TRACE_PERIM}`}
                  animatedProps={traceGlowProps}
                />
                <AnimatedRect
                  x={TRACE_INSET}
                  y={TRACE_INSET}
                  width={BAR_W - TRACE_INSET * 2}
                  height={BAR_H - TRACE_INSET * 2}
                  rx={TRACE_R}
                  fill="none"
                  stroke={color.connected}
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeDasharray={`${TRACE_PERIM}`}
                  animatedProps={traceProps}
                />
              </Svg>
            </Animated.View>
            {/* The charge ring lives OUTSIDE the shell: the discharge hairline
                expands to 128px and the shell clips its own children. It
                centres on the capsule's centre, which is the dice key. */}
            <ChargeRing charge={charge} reducedMotion={reducedMotion} />
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    </GestureHandlerRootView>
  );
}

/** Temp and + slide UNDER the dice as the capsule contracts, so the finger
 * never has to move and the pill genuinely becomes one key. */
function SideKey({
  charge,
  side,
  children,
}: {
  charge: Charge;
  side: "left" | "right";
  children: React.ReactNode;
}) {
  const style = useAnimatedStyle(() => ({
    transform: [
      {
        translateX:
          (side === "left" ? 1 : -1) *
          (KEY_SIZE + KEY_GAP) *
          charge.contract.value,
      },
    ],
    // Out ahead of the travel: a key half-clipped by the shrinking shell reads
    // as a rendering bug, not as sliding under.
    opacity: Math.max(0, 1 - charge.contract.value * 1.8),
  }));
  return <Animated.View style={style}>{children}</Animated.View>;
}

/**
 * The charge ring: 16 LEDs around the encoder, plus the hairline that
 * discharges outward on release.
 *
 * Everything here is centred on a 0×0 anchor at the capsule's centre, so it
 * tracks the dice key through the contract without measuring anything. Per the
 * LED perf rule (ui/led.tsx) the LEDs animate OPACITY ONLY — their positions
 * are static rotate+translate transforms rendered once.
 */
function ChargeRing({
  charge,
  reducedMotion,
}: {
  charge: Charge;
  reducedMotion: boolean;
}) {
  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.5 * charge.bloom.value,
  }));
  const dischargeStyle = useAnimatedStyle(() => {
    const d = charge.discharge.value;
    return {
      opacity: d <= 0 || d >= 1 ? 0 : 0.5 * (1 - d),
      transform: [
        { scale: (KEY_SIZE + (DISCHARGE_D - KEY_SIZE) * d) / DISCHARGE_D },
      ],
    };
  });

  return (
    <View pointerEvents="none" style={styles.chargeOverlay}>
      <View style={styles.chargeAnchor}>
        <Animated.View style={[styles.chargeGlow, glowStyle]} />
        {Array.from({ length: RING_LEDS }, (_, i) => (
          <RingLed
            key={i}
            index={i}
            charge={charge}
            reducedMotion={reducedMotion}
          />
        ))}
        <Animated.View style={[styles.dischargeRing, dischargeStyle]} />
      </View>
    </View>
  );
}

/**
 * One ring LED. Seeded at 12 o'clock, filling clockwise: 0ms attack, 260ms
 * decay to steady lit (motion principle 1).
 *
 * The attack is derived from the fill ramp rather than triggered by a timer —
 * `local` is how far past this LED the charge clock has travelled, in 16ths, so
 * the flash and its decay are pure functions of the ramp. That keeps the whole
 * ring on the UI thread: one animation drives sixteen lights.
 */
function RingLed({
  index,
  charge,
  reducedMotion,
}: {
  index: number;
  charge: Charge;
  reducedMotion: boolean;
}) {
  const style = useAnimatedStyle(() => {
    // Reduced Motion: a four-segment stepper that snaps on tier boundaries
    // instead of sweeping one LED per 16th.
    const fill = reducedMotion
      ? Math.floor(charge.fill.value / 4) * 4
      : charge.fill.value;
    const local = fill - (index + 1);
    if (local < 0) return { opacity: 0 };
    const decay = Math.max(
      0.001,
      LED_ATTACK_MS / Math.max(1, charge.sixteenthMs.value),
    );
    const flash = Math.max(0, 1 - local / decay);
    const base = LED_STEADY + 0.45 * charge.peak.value;
    return {
      opacity:
        charge.ringOut.value * Math.min(1, base + (1 - LED_STEADY) * flash),
    };
  });
  return (
    <Animated.View
      style={[
        styles.ringLed,
        {
          transform: [
            { rotate: `${index * (360 / RING_LEDS)}deg` },
            { translateY: -RING_R },
          ],
        },
        style,
      ]}
    />
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
        down.value = withTiming(1, {
          duration: 140,
          reduceMotion: ReduceMotion.System,
        });
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
          <Path
            d="M12 5v14M5 12h14"
            stroke={color.label}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </Key>
  );
}

/**
 * Mutate — the 5-pip dice glyph (one vocabulary with Lane Editor Randomize)
 * and the charge machine behind the hold (issue #48).
 *
 * TAP (< 120ms) is unchanged: one mutate, the pips scatter (~250ms, instant
 * attack per frame — a slot-machine shuffle, no tweening) and settle back with
 * the light pixel landing last. No ring is ever drawn, so a tap never flashes
 * anything.
 *
 * HOLD charges. At 120ms the capsule contracts around this key and the LED ring
 * starts filling on the sequencer clock, one LED per 16th. Every tick of the
 * schedule (see chargeTicks) re-rolls the LIVE pattern at the current tier and
 * fires its haptic in the same call — the churn is heard, felt and seen as one
 * event. The ring closing at 16/16 is a hard stop: the key inverts, the
 * face swaps to the bolt, and nothing escalates further — a full ring then
 * fires itself, so there is no such thing as holding it for ten seconds.
 *
 * Release pops: the pips collapse to the centre, the key springs proportionally
 * to what was charged, the ring discharges outward and the grid washes to
 * reveal what committed. Wandering off the key does NOT cancel: the charge
 * belongs to the touch and ends when the touch does, with the encoder leaning
 * after the finger on a short rubber band while it lasts.
 *
 * All of it is retargeted, never restarted (motion principle 7): a fast
 * press-release-press picks the ring up from wherever it currently sits.
 */
// TODO(randomize-lock): the concepts artboard reserved long-press-dice for the
// Randomize-lock sheet; the charge takes that gesture (issue #48 open question
// 4), so the locks sheet needs its own entry point when it is designed.
function ChargeDice({
  disabled,
  reducedMotion,
  charge,
  onMutate,
  onRoll,
  onChargeCommit,
}: {
  disabled: boolean;
  reducedMotion: boolean;
  charge: Charge;
  onMutate: () => void;
  onRoll: (tier: ChargeTier) => void;
  onChargeCommit: (tier: ChargeTier) => void;
}) {
  const [scatter, setScatter] = useState<{
    nonce: number;
    frames: number[][][];
  } | null>(null);
  const glow = useSharedValue(0);
  // Pop: an impulse kick that springs back through 1.0 (the file's kick idiom).
  const keyPop = useSharedValue(0);
  const collapse = useSharedValue(0);
  const flash = useSharedValue(0);
  /** -1…1 tremor while the ring sits closed — the key straining to go off. */
  const keyShake = useSharedValue(0);

  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const charging = useRef(false);
  /** Consumed once per hold, so the ring's close fires exactly once even though
   * the fill ramp crosses the top on its way down again during a drain. */
  const closed = useRef(false);
  /** The charge fired ITSELF at a full ring (see PEAK_HOLD_MS), so the finger
   * lifting afterwards is a release with nothing left to release. */
  const popped = useRef(false);

  const clearTimers = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clearTimers, []);

  // Downbeat tick (quantize first: derived integer beat → opacity only).
  const beat = useDerivedValue(() =>
    playheadPlaying.value === 1
      ? Math.floor(playheadTick.value / timing.ppqn)
      : -1,
  );
  useAnimatedReaction(
    () => beat.value,
    (b, prev) => {
      if (reducedMotion || b < 0 || b === prev || b % 4 !== 0) return;
      glow.value = 1; // instant attack
      glow.value = withTiming(0, {
        duration: 300,
        easing: Easing.out(Easing.quad),
      });
    },
  );
  const glowStyle = useAnimatedStyle(() => ({ opacity: 0.9 * glow.value }));

  /** Wind every charge value back down. Springs, so a release during the
   * contract retargets instead of snapping. */
  const settleCharge = (drainMs: number) => {
    // The tremor belongs to the closed ring — it ends however the hold ends
    // (pop, release or abort), settling rather than cutting.
    cancelAnimation(keyShake);
    keyShake.value = withTiming(0, { duration: 90 });
    charge.pullX.value = withSpring(0, SNAP);
    charge.pullY.value = withSpring(0, SNAP);
    charge.contract.value = withSpring(0, EXPAND_SPRING);
    charge.scale.value = withSpring(0, EXPAND_SPRING);
    charge.bloom.value = withTiming(0, { duration: drainMs });
    charge.peak.value = withTiming(0, { duration: 140 });
    // The ring drains rather than blanking: a re-press mid-drain resumes from
    // wherever it has got to, which is the whole point of retargeting.
    charge.fill.value = withTiming(0, {
      duration: drainMs,
      easing: Easing.in(Easing.quad),
      reduceMotion: ReduceMotion.Never,
    });
    closed.current = false;
  };

  /** The ring closes: a hard stop, then an idle. Fired by the UI thread when
   * the fill ramp lands, not by a timer, so the "hard stop" is on time even
   * when the rolls have the JS thread busy. */
  const closeRing = () => {
    if (!charging.current || closed.current) return;
    closed.current = true;
    haptics.impact("heavy");
    charge.peak.value = withTiming(1, {
      duration: 90,
      reduceMotion: ReduceMotion.Never,
    });
    // The tremor is already running from beginCharge and keyStyle doubles its
    // amplitude off `peak` — the buzz escalates into the close rather than
    // starting there, so nothing is restarted here (principle 7).
    //
    // A full ring IS the commit, so it fires itself rather than waiting for a
    // finger that has nothing left to do (Brent: "pop it ~500ms after it gets
    // full, like the thumbs up"). PEAK_HOLD_MS is the beat that lets the
    // inverted key and the heavy impact register as FULL before the burst — the
    // gesture resolves at its own peak instead of idling there indefinitely.
    timers.current.push(
      setTimeout(() => {
        if (!charging.current) return;
        popped.current = true;
        releaseCharge();
      }, PEAK_HOLD_MS),
    );
  };

  // The ring closing is a UI-thread fact (the fill ramp landing), so the hard
  // stop is detected there and only the resolution — the heavy haptic and the
  // idle — crosses back to JS.
  //
  // This reaction MUST stay below `closeRing`: the worklet captures the
  // identifier's value when the worklet object is built (first render), so
  // declaring it above the `const` captured `undefined` forever — and
  // `scheduleOnRN(undefined)` is not a JS error, it is an unguarded
  // `jsi::Value::getObject` in the worklets runtime, i.e. a native SIGABRT the
  // instant the ring hit 16/16.
  useAnimatedReaction(
    () => charge.fill.value >= RING_LEDS - 0.0001,
    (full, prev) => {
      if (full && prev === false) scheduleOnRN(closeRing);
    },
  );

  const beginCharge = (startFill: number, sixteenth: number) => {
    charging.current = true;
    closed.current = false;
    charge.sixteenthMs.value = sixteenth;
    charge.contract.value = withSpring(1, CONTRACT_SPRING);
    charge.discharge.value = 0;
    charge.ringOut.value = withTiming(1, { duration: 90 });
    // The charge clock: ONE linear ramp to a closed ring, on the UI thread.
    // Retargets from wherever a previous drain left the ring, so re-engaging
    // resumes the fill instead of restarting it. `ReduceMotion.Never` because
    // this is a progress readout, not decoration — Reduced Motion quantises the
    // ring into a four-segment stepper in the LED worklet instead of freezing
    // the clock.
    const remaining = Math.max(0, RING_LEDS - charge.fill.value);
    const rampMs = remaining * sixteenth;
    charge.fill.value = withTiming(RING_LEDS, {
      duration: rampMs,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
    charge.bloom.value = withTiming(1, {
      duration: rampMs,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.Never,
    });
    // Linear, not a critically-damped spring: a spring over the same window
    // spends most of its travel in the first beat and then creeps, so the
    // capsule stopped visibly growing exactly while the charge was getting
    // serious. Matching the fill ramp keeps it swelling right into the close.
    charge.scale.value = withTiming(1, {
      duration: rampMs,
      easing: Easing.linear,
      reduceMotion: ReduceMotion.System,
    });
    if (!reducedMotion) {
      // The tremor runs for the WHOLE hold, not just the peak — keyStyle scales
      // its amplitude by the fill, so the key is barely trembling as the charge
      // engages and rattling hard by the time the ring closes.
      keyShake.value = withRepeat(
        withSequence(
          withTiming(1, { duration: SHAKE_MS / 4, easing: Easing.linear }),
          withTiming(-1, { duration: SHAKE_MS / 2, easing: Easing.linear }),
          withTiming(0, { duration: SHAKE_MS / 4, easing: Easing.linear }),
        ),
        -1,
        false,
      );
    }
    for (const tick of chargeTicks(startFill, sixteenth)) {
      timers.current.push(
        setTimeout(() => {
          // Belt and braces with `clearTimers()` in releaseCharge: a tick must
          // never roll the live pattern for a hold that is already over. The
          // guard makes that invariant local, so it survives the next time the
          // release path moves.
          if (!charging.current) return;
          if (tick.haptic === "selection") haptics.selection();
          else haptics.impact(tick.haptic);
          // Reduced Motion does not roll live — the preview settles once per
          // tier. The haptics are unchanged: Reduced Motion is not Reduced
          // Haptics.
          if (tick.roll && (!reducedMotion || tick.boundary)) onRoll(tick.tier);
        }, tick.at),
      );
    }
  };

  /** Release — the pop. Weight, overshoot and discharge all scale with fill:
   * there is no wasted charge. */
  const releaseCharge = () => {
    // `beginCharge` queues the WHOLE tick schedule up front, so a hold that
    // ends early leaves ticks pending — without this they keep firing haptics
    // and rolling the LIVE pattern after the commit and its reveal wash have
    // already landed. `onPressOut` used to clear them on its way through;
    // once the touch took over the release path that stopped happening.
    clearTimers();
    charging.current = false;
    // The tier comes off the RING, not a JS-side mirror: what committed has to
    // be what the finger saw, even if a roll tick slipped.
    const fill = Math.max(0, Math.min(RING_LEDS, charge.fill.value));
    const frac = fill / RING_LEDS;
    const tier = tierForFill(fill);
    // Same frame as the burst.
    if (tier === 4) haptics.success();
    else haptics.impact(tier === 3 ? "heavy" : tier === 2 ? "medium" : "light");
    onChargeCommit(tier);
    if (reducedMotion) {
      // A single opacity flash stands in for the whole burst.
      flash.value = 1;
      flash.value = withTiming(0, {
        duration: 160,
        easing: Easing.out(Easing.quad),
      });
      charge.ringOut.value = withTiming(0, { duration: 120 });
      settleCharge(0);
      return;
    }
    // The lit LEDs leave as one expanding hairline.
    charge.ringOut.value = withTiming(0, { duration: 110 });
    charge.discharge.value = 0;
    charge.discharge.value = withTiming(1, {
      duration: 220,
      easing: Easing.out(Easing.quad),
    });
    // The nine pips collapse to one centre pip and spring back open.
    collapse.value = withSequence(
      withTiming(1, { duration: 110, easing: Easing.out(Easing.quad) }),
      withTiming(0, { duration: 180, easing: Easing.out(Easing.quad) }),
    );
    keyPop.value = Math.min(1.3, keyPop.value + frac);
    keyPop.value = withSpring(0, POP_SPRING);
    settleCharge(200);
  };

  const onPressIn = () => {
    if (disabled) return;
    clearTimers();
    popped.current = false;
    const sixteenth = chargeSixteenthMs();
    // Re-engaging during a drain picks the ring up where it sits, quantised up
    // to the next 16th (principle 7 — retarget, never restart). Clamped short
    // of the close so a press during a full-charge discharge still has a
    // schedule to run.
    const startFill = Math.max(
      0,
      Math.min(RING_LEDS - 1, Math.ceil(charge.fill.value - 0.001)),
    );
    timers.current.push(
      setTimeout(() => beginCharge(startFill, sixteenth), CHARGE_ENTER_MS),
    );
  };

  // NOTE: the Pressable fires this the moment the finger wanders outside the
  // key — RNGH cancels the press on exit — which is NOT the end of the touch.
  // Letting it resolve a hold cancelled every charge that drifted a few points.
  // So a charge in flight ignores it entirely and the TOUCH ends the charge
  // (see `endTouch`); this handler now only owns the tap.
  const onPressOut = () => {
    if (disabled) return;
    if (charging.current || popped.current) return;
    clearTimers();
    // Under the threshold — a plain TAP. Nothing was drawn and nothing was
    // captured, so this is the shipped one-mutate press.
    if (!reducedMotion) {
      setScatter((s) => ({
        nonce: (s?.nonce ?? 0) + 1,
        frames: rollScatterFrames(),
      }));
    }
    onMutate();
  };

  /** The real end of the gesture: the finger LIFTS, wherever it happens to be.
   * Idempotent — `onTouchesUp` and the finalize backstop can both land. */
  const endTouch = () => {
    popped.current = false;
    if (!charging.current) return;
    releaseCharge();
  };

  // Finger tracking, and the authority on when the gesture ENDS. It is
  // manual-activation so it never takes the gesture from the key, and declared
  // simultaneous with it so the press is not cancelled — but once it is
  // tracking a touch it keeps receiving that touch's events wherever the finger
  // goes, which the Pressable does not.
  //
  // Wandering off the key cancels nothing: the charge belongs to the TOUCH and
  // ends when the touch does. Meanwhile the encoder leans after your finger on
  // a short rubber band — anchored, so it gives a little and then refuses.
  const originX = useSharedValue(0);
  const originY = useSharedValue(0);
  const tracking = useSharedValue(0);
  const dragWatch = Gesture.Pan()
    .manualActivation(true)
    .onTouchesDown((e) => {
      const t = e.allTouches[0];
      if (!t) return;
      originX.value = t.absoluteX;
      originY.value = t.absoluteY;
      tracking.value = 1;
      charge.pullX.value = 0;
      charge.pullY.value = 0;
    })
    .onTouchesMove((e) => {
      if (tracking.value !== 1) return;
      const t = e.allTouches[0];
      if (!t) return;
      // Asymptotic: `d * MAX / (|d| + FALLOFF)` never exceeds PULL_MAX however
      // far the finger travels, and most of the give is spent in the first few
      // points — a strong spring on a short leash.
      charge.pullX.value = rubberBand(t.absoluteX - originX.value);
      charge.pullY.value = rubberBand(t.absoluteY - originY.value);
    })
    // `endTouch` reads the press machine's refs (charging, popped), and the
    // compiler rule can't see that `scheduleOnRN` defers the call to a JS tick
    // long after this render — a worklet handed to a gesture builder never runs
    // during render.
    // eslint-disable-next-line react-hooks/refs
    .onTouchesUp(() => {
      if (tracking.value !== 1) return;
      tracking.value = 0;
      charge.pullX.value = withSpring(0, SNAP);
      charge.pullY.value = withSpring(0, SNAP);
      scheduleOnRN(endTouch);
    })
    // Only a real touch END may resolve the hold. NOT `onFinalize`: a
    // manual-activation Pan that never activates gets finalised as soon as it
    // FAILS, which happens while the finger is still down and moving — using
    // it as a backstop expanded the capsule mid-hold, which read as the
    // encoder suddenly jumping back toward its rest position.
    // eslint-disable-next-line react-hooks/refs
    .onTouchesCancelled(() => {
      if (tracking.value !== 1) return;
      tracking.value = 0;
      charge.pullX.value = withSpring(0, SNAP);
      charge.pullY.value = withSpring(0, SNAP);
      scheduleOnRN(endTouch);
    });

  const keyStyle = useAnimatedStyle(() => {
    // 0.25 as the hold engages → 1.0 at a closed ring → 2.0 while it strains at
    // the peak. One repeating tremor, amplitude-modulated, so it never restarts.
    const shake =
      keyShake.value *
      (0.25 + 0.75 * (charge.fill.value / RING_LEDS)) *
      (1 + charge.peak.value);
    return {
      // 1.00 → 1.18 on a full-charge pop, proportional below it.
      transform: [
        // Tremor amplitude RAMPS with the charge and doubles at the peak: a hint
        // of movement as the hold engages, a hard rattle once the ring closes.
        { translateX: SHAKE_PX * shake },
        // A touch of roll on the same value, so the buzz reads as the key
        // rattling in its seat rather than sliding sideways.
        { rotate: `${1.1 * shake}deg` },
        { scale: 1 + 0.18 * keyPop.value },
      ],
    };
  });
  // Peak inverts the key: white fill, dark pips, all nine lit.
  const invertStyle = useAnimatedStyle(() => ({ opacity: charge.peak.value }));
  // Beat 3 lifts the surface one shade on the way there.
  const liftStyle = useAnimatedStyle(() => ({
    opacity: 0.6 * charge.bloom.value,
  }));
  const flashStyle = useAnimatedStyle(() => ({ opacity: 0.85 * flash.value }));
  // The press travel goes back EARLY in the contract (the same `contract * 3`
  // handoff the armed rim uses), not across the whole 520ms spring: the travel
  // is a 6% scale, and every frame it is held for is a frame of the pips being
  // resampled off the device-pixel grid. Leading the contract confines that to
  // the engage itself rather than the whole first beat of the charge.
  const travelRelease = useDerivedValue(() =>
    Math.min(1, charge.contract.value * 3),
  );

  return (
    <GestureDetector gesture={dragWatch}>
      <Animated.View style={keyStyle}>
        <Key
          disabled={disabled}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          // A charge is no longer a press: the key hands its 6% press travel
          // back as the capsule contracts, so the pips are not left scaled off
          // the pixel grid for the whole hold (see KeyProps.travelRelease).
          travelRelease={travelRelease}
          simultaneousWithExternalGesture={dragWatch}
          style={styles.btn}
          accessibilityRole="button"
          accessibilityLabel="Mutate pattern"
          accessibilityHint="Tap to mutate the pattern once. Hold to charge a bigger roll — the longer you hold, the more of the pattern it re-rolls. It fires when you let go, or on its own once fully charged."
          accessibilityState={{ disabled }}
        >
          <Animated.View
            pointerEvents="none"
            style={[styles.keyFilm, liftStyle]}
          />
          <Animated.View
            pointerEvents="none"
            style={[styles.keyInvert, invertStyle]}
          />
          <View style={[styles.glyph, disabled ? styles.glyphDisabled : null]}>
            {REST_CELLS.map((cell, i) => (
              <Pip
                key={i}
                index={i}
                rest={cell}
                scatter={scatter}
                peak={charge.peak}
                collapse={collapse}
                isCenter={i === CENTER_PIP}
              />
            ))}
            {/* Full charge: the dice face gives way to the bolt. */}
            <PeakGlyph peak={charge.peak} collapse={collapse} />
            {/* The light pixel's downbeat bloom — a lit film over the TL pip. */}
            <Animated.View
              pointerEvents="none"
              style={[styles.pip, styles.pipGlow, glowStyle]}
            />
          </View>
          <Animated.View
            pointerEvents="none"
            style={[styles.keyFlash, flashStyle]}
          />
        </Key>
      </Animated.View>
    </GestureDetector>
  );
}

/** One dice pip. Scatter frames land as duration-0 jumps (LEDs never tween
 * between cells); the light pixel's final hop home is delayed to land last.
 * On a charge release every pip collapses to the centre cell and comes back. */
function Pip({
  index,
  rest,
  scatter,
  peak,
  collapse,
  isCenter,
}: {
  index: number;
  rest: readonly [number, number];
  scatter: { nonce: number; frames: number[][][] } | null;
  peak: SharedValue<number>;
  collapse: SharedValue<number>;
  isCenter: boolean;
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
          fi === 0
            ? hop(PIP_COORD[f[index][coord]])
            : withDelay(FRAME_MS, hop(PIP_COORD[f[index][coord]])),
        ),
        withDelay(settleDelay, hop(restV)),
      );
    x.value = seq(0, PIP_COORD[rest[0]]);
    y.value = seq(1, PIP_COORD[rest[1]]);
    // Re-fires per press via the nonce; values always end at rest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scatter?.nonce]);
  const style = useAnimatedStyle(() => {
    const c = collapse.value;
    const mid = PIP_COORD[1];
    return {
      transform: [
        { translateX: x.value + (mid - x.value) * c },
        { translateY: y.value + (mid - y.value) * c },
      ],
      // Everything folds into the one centre pip — and the whole face clears
      // out as the bolt takes over at full charge (see PeakGlyph).
      opacity: (isCenter ? 1 : 1 - c) * (1 - peak.value),
      backgroundColor: interpolateColor(
        peak.value,
        [0, 1],
        [color.label, "#0A0A0A"],
      ),
    };
  });
  return <Animated.View style={[styles.pip, style]} />;
}

/**
 * The full-charge face: the `bolt` chip glyph, dark on the inverted key. It
 * crossfades in as the ring closes and collapses to the centre with the pop,
 * so the dice → lightning → dice round trip is one continuous move rather than
 * a cut. Static cells, opacity-only animation (the LED perf rule).
 */
function PeakGlyph({
  peak,
  collapse,
}: {
  peak: SharedValue<number>;
  collapse: SharedValue<number>;
}) {
  const style = useAnimatedStyle(() => ({
    opacity: peak.value * (1 - collapse.value),
  }));
  return (
    <Animated.View pointerEvents="none" style={[FILL, style]}>
      {Array.from({ length: 25 }, (_, i) => {
        const shade = Number(PEAK_GLYPH[i]);
        const cx = PEAK_ORIGIN + (i % 5) * PEAK_STEP;
        const cy = PEAK_ORIGIN + Math.floor(i / 5) * PEAK_STEP;
        return (
          <View
            key={i}
            style={{
              position: "absolute",
              left: 0,
              top: 0,
              width: PEAK_CELL,
              height: PEAK_CELL,
              borderRadius: PEAK_CELL * 0.3,
              backgroundColor: PEAK_SHADES[shade],
              transform: [{ translateX: cx }, { translateY: cy }],
            }}
          />
        );
      })}
    </Animated.View>
  );
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
 *
 * NOTHING but this key arms it — a dice hold used to arm it on the user's
 * behalf as an undo hatch, which meant the capsule lit up in a mode nobody
 * asked for. A hold's way out is the abort (drag off the dice) instead.
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
    flash.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.quad),
    });
    keepDrain.value = withDelay(
      120,
      withTiming(1, { duration: 220, easing: Easing.in(Easing.quad) }),
    );
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
          withTiming(0, {
            duration: RING_DELAY_MS,
            easing: Easing.out(Easing.quad),
          }),
          withTiming(1, { duration: HOLD_MS, easing: Easing.linear }),
        );
    // Faint tick at each trace quarter (selection haptic + a brightness blip).
    [0.25, 0.5, 0.75].forEach((q) => {
      timers.current.push(
        setTimeout(
          () => {
            haptics.selection();
            keepTick.value = 1;
            keepTick.value = withTiming(0, { duration: 150 });
          },
          RING_DELAY_MS + HOLD_MS * q,
        ),
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
      haptics.impact("light");
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
    keepProgress.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.quad),
    });
    if (dt > TAP_MS) return; // abandoned hold: nothing happens
    // TAP = jump back (swap). A quick bright blip acknowledges the tap, then
    // the key reads OFF right away (Brent: the light lingering ~1s after a
    // disarm felt broken) — step-strip's reverse wash carries the moment.
    haptics.impact("light");
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
          ? "Tap to restore the held state and turn temp off. Hold to keep the current pattern."
          : "Tap to hold the current state so you can experiment."
      }
    >
      {/* Ghost dot (Paper: 11px outline, 1.5px #8E8E93); lit solid while
          armed, with a brighter pulse on jump-back. */}
      <View style={styles.ghostDot}>
        <Animated.View
          pointerEvents="none"
          style={[styles.ghostDotFill, fillStyle]}
        />
        <Animated.View
          pointerEvents="none"
          style={[styles.ghostDotFill, styles.ghostDotPulse, pulseStyle]}
        />
      </View>
      <Animated.View pointerEvents="none" style={[styles.flash, flashStyle]} />
      <Animated.View
        pointerEvents="none"
        style={[styles.drainDot, drainStyle]}
      />
    </Key>
  );
}

// Paper 5SI-0: glass capsule (rgba(28,28,34,.55) + blur 24 saturate 160% in
// the mock — real GlassView here), 0.5px rgba(255,255,255,.12) rim, soft
// 0/10/24 shadow, solid #2C2C2E keys. Fallback = the old solid #16161D bar.
const styles = StyleSheet.create({
  barAnchor: {
    position: "absolute",
    right: MARGIN,
    bottom: MARGIN,
  },
  // The shell: its SIZE contracts during a charge, so the key row inside is
  // centred and clipped rather than laid out against the shrinking edge.
  bar: {
    width: BAR_W,
    height: BAR_H,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    overflow: "hidden",
    shadowColor: "#000000",
    shadowOpacity: 0.4,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
  },
  row: {
    width: BAR_W,
    flexDirection: "row",
    gap: KEY_GAP,
    padding: PAD,
  },
  barGlass: {
    // Same device-pixel-grid problem the dice pips had, one level out. The
    // Paper rim is 0.5pt = 1.5 device pixels at 3×, so the capsule's outline
    // renders as a full-strength line PLUS a half-strength ghost line beside
    // it (measured on a 3× sim: 31 + 17 of 255 down the sides) — a doubled
    // edge, which is what reads as blur next to the crisp keys inside it.
    // `hairlineWidth` is exactly ONE device pixel at every density (0.5pt at
    // 2×, ⅓pt at 3×), which is what a "0.5px rim" means on a Retina screen.
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.12)",
  },
  barSolid: {
    backgroundColor: ramp[7],
  },
  btn: {
    width: KEY_SIZE,
    height: KEY_SIZE,
    borderRadius: 999,
    backgroundColor: color.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  glyph: {
    width: GLYPH,
    height: GLYPH,
  },
  glyphDisabled: {
    opacity: 0.4,
  },
  pip: {
    position: "absolute",
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
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  // Charge: the key surface lifts a shade as the ring fills, then inverts
  // outright when it closes. Opacity-only layers (the LED perf rule). Each
  // carries the key's own radius rather than being clipped by it — the temp
  // key shares `btn`, and its keep-drain dot has to travel OUTSIDE the key.
  keyFilm: {
    ...FILL,
    borderRadius: 999,
    backgroundColor: color.surface4,
  },
  keyInvert: {
    ...FILL,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
  },
  keyFlash: {
    ...FILL,
    borderRadius: 999,
    backgroundColor: color.label,
  },
  ghostDot: {
    width: 11,
    height: 11,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#8E8E93",
    alignItems: "center",
    justifyContent: "center",
  },
  ghostDotFill: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    backgroundColor: color.label,
  },
  // Jump-back blip: a hot white glow over the lit dot.
  ghostDotPulse: {
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 1,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  // Variant A armed rim, glow layer: a soft halo under the crisp SVG line.
  // Only its OPACITY animates (border + shadow render once — the LED perf
  // rule); the sharp line is the AnimatedRect above it.
  rimGlow: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.25)",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.4,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  // The armed rim's contracted form: absolute-fill, so it is whatever shape the
  // shell currently is — a stadium at rest, a circle around the encoder at full
  // contract. Same 1.5px white hairline as the SVG line it takes over from.
  rimCircle: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: color.label,
    // The armed rim is LIGHT, so it blooms like every other lit element here
    // (same emissive treatment as ringLed / drainDot). Static shadow, opacity
    // is the only animated channel — the LED perf rule.
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.55,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  // The stadium rim SVGs keep their own fixed geometry, pinned to the capsule's
  // fixed corner, rather than stretching with the contracting shell.
  rimLayer: {
    position: "absolute",
    right: 0,
    bottom: 0,
    width: BAR_W,
    height: BAR_H,
  },
  flash: {
    position: "absolute",
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
    position: "absolute",
    top: KEY_SIZE / 2 - 2.5,
    left: KEY_SIZE / 2 - 2.5,
    width: 5,
    height: 5,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.8,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  // --- Charge ring -----------------------------------------------------
  // Centred on the capsule's centre — which is the dice key, at rest and
  // contracted alike — via a 0×0 anchor, so nothing here needs measuring.
  chargeOverlay: {
    ...FILL,
    alignItems: "center",
    justifyContent: "center",
  },
  chargeAnchor: {
    width: 0,
    height: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  ringLed: {
    position: "absolute",
    left: -RING_LED / 2,
    top: -RING_LED / 2,
    width: RING_LED,
    height: RING_LED,
    borderRadius: 999,
    backgroundColor: "#FFFFFF",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  // Outer bloom over the charge — a static shadow whose alpha is the only
  // animated property.
  chargeGlow: {
    position: "absolute",
    left: -CHARGE_D / 2,
    top: -CHARGE_D / 2,
    width: CHARGE_D,
    height: CHARGE_D,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.05)",
    shadowColor: "#FFFFFF",
    shadowOpacity: 0.9,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 0 },
  },
  // The pop: the lit ring leaves as one hairline, 48 → 128px.
  dischargeRing: {
    position: "absolute",
    left: -DISCHARGE_D / 2,
    top: -DISCHARGE_D / 2,
    width: DISCHARGE_D,
    height: DISCHARGE_D,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: "#FFFFFF",
  },
});
