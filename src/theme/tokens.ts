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
 * Styling: consume these tokens directly with React Native `StyleSheet`
 * (and `Color` from expo-router for native semantic colors where relevant).
 * Do NOT use NativeWind / Tailwind — this module is the single style source.
 */

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

/**
 * OP-XY sequencer-key ramp — the exact fills of the 16 sequencer keys in
 * Teenage Engineering's own product artwork (assets.teenage.engineering
 * 6734baca…_opt.svg): 8 shades, each spanning a PAIR of adjacent keys, so a
 * 16-step row sweeps the full ramp dark → light. The artwork's first pair is
 * pure #000; we lift it to #16161D so those cells stay visible on the app's
 * black ground. Step fills use `keyRamp[Math.floor((slot % 16) / 2)]`.
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

export const color = {
  // Surfaces
  ground: '#000000', // app background (also OLED-friendly)
  surface: '#1C1C1E', // grouped cell / bars
  surface2: '#2C2C2E', // controls, empty step blocks
  surface3: '#3A3A3C', // segmented track fill
  surface4: '#48484A', // grabber, active segment (on dark control)
  separator: '#1C1C1E',
  displayBg: '#08080a', // dot-matrix "device screen" panel (Graph view)

  // Labels (text)
  label: '#f6f4f4', // primary + active/interactive
  label2: '#afafb3',
  label25: '#98989F', // section headers / secondary values (exact Paper gray between label2 and label3)
  label3: '#95959a', // secondary
  label4: '#797982', // tertiary
  labelDisabled: '#5A5A5E',

  // Step blocks
  stepHit: '#afafb3',
  stepEmpty: '#2f2f36',
  stepEmptyDim: '#232325', // gen sub-rows

  // Functional-semantic exceptions — the ONLY non-gray colors allowed
  playhead: '#7fd4c8', // faint desaturated cyan, echoes the OP-XY display
  connected: '#30D158', // success / device connected
  danger: '#FF453A', // record LED + destructive (Panic, swipe-delete)
} as const;

/** Fonts. SF Pro Display for large/headers, SF Pro Text for body/controls. */
export const font = {
  display: 'SF Pro Display',
  text: 'SF Pro Text',
  // Byte/hex readouts, dot-matrix labels, step rulers. In-app use a system
  // monospace ("ui-monospace" / "Menlo" / SF Mono); mockups used Space Mono.
  mono: 'Menlo',
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
  cell: 12, // grouped list cell, sheet corners
  chip: 999, // pills, status dots
} as const;

/** iOS HIG minimum interactive target. Every tappable control ≥ this. */
export const HIT_TARGET = 44;

/** Timing constants (from ROADMAP §13) the UI reads but does not own. */
export const timing = {
  ppqn: 24,
  lookaheadMs: 100,
  schedulerIntervalMs: 25,
  defaultGateMs: 25,
  defaultResolutionTicks: 6, // 1/16
} as const;
