/**
 * euxy design tokens — derived from the OP-XY grayscale monoramp.
 *
 * Source of truth: Paper file "euxy"
 *   https://app.paper.design/file/01KY80MDKPNF9GAKHVF36TY2GJ/1-0
 * See docs/design/README.md for the screen/node index and behavior redlines.
 *
 * Rule: the app is monochrome. `white` is the only "interactive / active" color.
 * The ONLY non-gray colors are the three functional exceptions below
 * (playhead cyan, connected green, record/destructive red). Do not introduce
 * hues for lane differentiation, accents, or decoration.
 *
 * Styling: consume these tokens through `useTheme()` / `themed()` in
 * src/theme/theme.ts (one palette per color scheme) with React Native `StyleSheet`
 * (and `Color` from expo-router for native semantic colors where relevant).
 * Do NOT use NativeWind / Tailwind — this module is the single style source.
 */
import { Platform } from 'react-native';


/** OP-XY packaging monoramp, light → dark (lospec: teenageengineering-op-xy). */
export const ramp = {
  0: '#f6f4f4', // brightest (primary label / active / play)
  1: '#afafb3',
  2: '#95959a',
  3: '#797982',
  4: '#606069',
  5: '#484850',
  6: '#2f2f36',
  7: '#16161d',
  8: '#000000', // ground
} as const;

/** The monoramp mirrored for the light scheme: same 9 stops, dark → light, so `ramp[n]` keeps its role in either scheme. */
export const lightRamp = {
  0: '#0a0a0c', // primary label / active / play
  1: '#48484f',
  2: '#6e6e76',
  3: '#8c8c92',
  4: '#a4a4aa',
  5: '#bdbdc3',
  6: '#dcdbe0',
  7: '#e9e8ec',
  8: '#f6f4f4', // ground
} as const;

/**
 * OP-XY sequencer-key ramp — the exact fills of the 16 sequencer keys in
 * Teenage Engineering's own product artwork (assets.teenage.engineering
 * 6734baca…_opt.svg): 8 shades, each spanning a PAIR of adjacent keys, so a
 * 16-step row sweeps the full ramp dark → light. The artwork's first pair is
 * pure #000; we lift it to #16161D so those cells stay visible on the app's
 * black ground. These 8 are the ANCHORS; step grids fill from `stepFill`.
 */
export const keyRamp = [
  '#16161D', // pair 1-2 (#000 in the TE artwork)
  '#20242A',
  '#42444A',
  '#5B5D63',
  '#73757A',
  '#83858B',
  '#A4A5AC',
  '#C5C6CD', // pair 15-16 — tops out below the keyboard-key gray, never white
] as const;

/**
 * Step-grid fills — `keyRamp` resampled to 16 shades, ONE PER SLOT, so a
 * 16-step row reads as a continuous gray sweep instead of eight visible
 * two-cell plateaus. Same tonal range as the artwork ramp (slot 1 is still
 * #16161D, slot 16 still #C5C6CD, still never white): only the sampling gets
 * finer, so the grid looks like the same gradient with twice the steps.
 *
 * Derivation — `keyRamp` sampled at `slot * 7 / 15`, linear per channel:
 * every even slot lands within a couple of levels of its old pair color, and
 * the odd slots are the newly interpolated shades between them.
 */
export const stepRamp = [
  '#16161D',
  '#1B1D23',
  '#1F2329',
  '#2E3137',
  '#3D4046',
  '#4A4C52',
  '#56585E',
  '#616369',
  '#6D6F74',
  '#76787D',
  '#7E8085',
  '#87898F',
  '#97989F',
  '#A6A7AE',
  '#B6B7BE',
  '#C5C6CD',
] as const;

/** Fill for a step at `slot`, wrapped into its 16-slot row. */
export function stepFill(slot: number): string {
  return stepRamp[((slot % 16) + 16) % 16];
}

const darkColor = {
  // Surfaces
  ground: '#000000', // app background (also OLED-friendly)
  surface: '#1C1C1E', // grouped cell / bars
  surface2: '#2C2C2E', // controls, empty step blocks
  // Also the panel a grouped row expands into: one step ABOVE the cell's
  // surface2, never below it. Dropping that panel to the ground punched a black
  // hole in the group (Brent 2026-07-29); a step up separates it from the cell
  // and still reads as content the row revealed.
  surface3: '#3A3A3C', // disclosure panel, segmented track fill
  surface4: '#48484A', // grabber, active segment, controls inside a surface3 panel
  separator: '#1C1C1E',
  displayBg: '#08080a', // dot-matrix "device screen" panel (Graph view)
  splash: '#08080a', // JS boot overlay; must equal the native splash background in app.json

  // Labels (text)
  label: '#f6f4f4', // primary + active/interactive
  label2: '#afafb3',
  label25: '#98989F', // section headers / secondary values (exact Paper gray between label2 and label3)
  label3: '#95959a', // secondary
  trail: '#6e6e76', // trail grey: dim footnote line, transport standby ring, twinkle peak
  label4: '#797982', // tertiary
  labelDisabled: '#5A5A5E',

  // Step blocks
  stepHit: '#afafb3',
  stepEmpty: '#2f2f36',
  stepEmptyDim: '#232325', // gen sub-rows

  // Functional-semantic exceptions — the ONLY non-gray colors allowed
  // Instrument surfaces (Paper exact): note-pad keys, unlit LEDs, beat-ticker ticks.
  padNatural: '#232328',
  padSharp: '#1A1A1F',
  ledUnlit: '#1A1A1F',
  tickRest: '#2C2C2E',
  tickLit: '#AFAFB3',

  playhead: '#7fd4c8', // faint desaturated cyan, echoes the OP-XY display
  connected: '#30D158', // success / device connected
  danger: '#FF453A', // record LED + destructive (Panic, swipe-delete)
} as const;

/**
 * Light scheme: the same monoramp read from the other end. Ground is the ramp's
 * brightest stop (#f6f4f4), cells are white one step above it, and the label
 * ramp runs dark→light in the same order as the dark scheme's runs light→dark,
 * so every "label3 on surface" pairing keeps roughly the same contrast. The
 * three functional colors shift to their light-background values (darker cyan,
 * iOS light-mode green/red) so they stay legible on white.
 */
const lightColor: Palette = {
  ground: '#f6f4f4',
  surface: '#ffffff',
  surface2: '#e9e8ec',
  surface3: '#dcdbe0',
  surface4: '#cfced4',
  separator: '#f6f4f4',
  displayBg: '#ececef',
  splash: '#f6f4f4',

  label: '#0a0a0c',
  label2: '#48484f',
  label25: '#5e5e66',
  label3: '#6e6e76',
  trail: '#95959a',
  label4: '#8e8e95',
  labelDisabled: '#b4b4ba',

  stepHit: '#48484f',
  stepEmpty: '#dcdbe0',
  stepEmptyDim: '#e9e8ec',

  padNatural: '#ffffff',
  padSharp: '#dcdbe0',
  ledUnlit: '#dcdbe0',
  tickRest: '#dcdbe0',
  tickLit: '#5e5e66',

  playhead: '#1f8f84',
  connected: '#248a3d',
  danger: '#ff3b30',
};

/** `hex` (#rrggbb) at `opacity`, as an rgba() string. */
export function alpha(hex: string, opacity: number): string {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export type Palette = { [K in keyof typeof darkColor]: string };
export type Scheme = 'dark' | 'light';

export const palette: Record<Scheme, Palette> = { dark: darkColor, light: lightColor };

/** The dark table under its old name: the web app (`web/`, dark-only, synced copy of this module) still reads it. */
export const color: Palette = darkColor;

/**
 * Key-ramp anchors for the light scheme: the dark anchors mirrored around the
 * ramp, so slot 1 is the faint cell just below the white surface and slot 16
 * the darkest key — a 16-step row still sweeps the full ramp, now light → dark,
 * and still never reaches the label color.
 */
export const lightKeyRamp = [
  '#E9E8EC', // pair 1-2 — just under the white cell
  '#DCDBE0',
  '#BDBDC3',
  '#A4A4AA',
  '#8C8C92',
  '#7C7C82',
  '#5B5B61',
  '#3A3A40', // pair 15-16 — tops out above the label, never black
] as const;

/** `anchors` resampled to 16 shades, one per slot (same derivation as `stepRamp`). */
export function resampleRamp(anchors: readonly string[]): string[] {
  const rgb = anchors.map((hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)));
  return Array.from({ length: 16 }, (_, slot) => {
    const p = (slot * (rgb.length - 1)) / 15;
    const lo = Math.floor(p);
    const hi = Math.min(rgb.length - 1, lo + 1);
    const t = p - lo;
    const channels = rgb[lo].map((v, k) => Math.round(v + (rgb[hi][k] - v) * t));
    return `#${channels.map((v) => v.toString(16).toUpperCase().padStart(2, '0')).join('')}`;
  });
}

export const lightStepRamp = resampleRamp(lightKeyRamp);

/** Fill for a step at `slot` in the given scheme (see `stepFill`). */
export function stepFillFor(scheme: Scheme, slot: number): string {
  return (scheme === 'light' ? lightStepRamp : stepRamp)[((slot % 16) + 16) % 16];
}

/**
 * TextInput selection highlight. iOS draws it translucent, so the primary label
 * works; Android paints it solid (hiding the selected text) and also uses it
 * for the cursor, so it gets a translucent label there (cursorColor stays solid).
 */
export const selectionFor = (scheme: Scheme): string =>
  Platform.select({
    android: scheme === 'light' ? 'rgba(10, 10, 12, 0.25)' : 'rgba(246, 244, 244, 0.35)',
    default: palette[scheme].label,
  }) as string;

/**
 * Fonts. SF Pro Display for large/headers, SF Pro Text for body/controls on
 * iOS; Android has neither, so it names the system families instead (an
 * unknown family there silently falls back to sans-serif — which would turn
 * every monospace readout proportional).
 */
export const font = {
  display: Platform.select({ android: 'sans-serif', default: 'SF Pro Display' }),
  text: Platform.select({ android: 'sans-serif', default: 'SF Pro Text' }),
  // Byte/hex readouts, dot-matrix labels, step rulers. In-app use a system
  // monospace ("ui-monospace" / "Menlo" / SF Mono); mockups used Space Mono.
  mono: Platform.select({ android: 'monospace', default: 'Menlo' }),
} as const;

/** Type scale — { size / lineHeight / weight }. px. */
export const type = {
  largeTitle: { size: 34, line: 41, weight: '700' },
  title: { size: 22, line: 28, weight: '700' },
  headline: { size: 17, line: 22, weight: '600' },
  body: { size: 16, line: 21, weight: '400' },
  subhead: { size: 15, line: 20, weight: '500' },
  footnote: { size: 13, line: 18, weight: '500' },
  caption: { size: 12, line: 16, weight: '600' },
  micro: { size: 11, line: 13, weight: '600' }, // uppercase section labels / tab labels
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24 } as const;

export const radius = {
  step: 4, // step block
  control: 10, // M/S buttons, small controls
  cell: 12, // grouped list cell
  chip: 999, // pills, status dots
  // iOS form-sheet corner. Pinned (via sheetCornerRadius) at the iOS 26
  // system default we measured, rather than left implicit, so content at the
  // top of a sheet can match the sheet's own curve.
  sheet: 40,
} as const;

/** iOS HIG minimum interactive target. Every tappable control ≥ this. */
export const HIT_TARGET = 44;

/**
 * Touch area added around a small control, per side, via `hitSlop`.
 *
 * The ± keys of a stepper are the case this exists for: their glyph is a 16pt
 * symbol, the key that draws it is 40-44pt, and a thumb aims at neither — it
 * aims at the whole cell. 16 grows a 40pt key to a 72pt target, which is the
 * dead space around it in every stepper we ship, so the slop never reaches a
 * neighbouring control.
 *
 * RN hit-tests into children that overflow their parent, so this is NOT capped
 * by the row a key sits in — verified on device: a 40pt key with slop 8 takes
 * a tap 27pt off its centre. Only an ancestor with `overflow: 'hidden'` clips.
 */
export const HIT_SLOP = 16;

/** Timing constants (from ROADMAP §13) the UI reads but does not own. */
export const timing = {
  ppqn: 24,
  lookaheadMs: 100,
  schedulerIntervalMs: 25,
  defaultGateMs: 25,
  defaultResolutionTicks: 6, // 1/16
} as const;
