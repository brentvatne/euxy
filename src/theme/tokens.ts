/**
 * euxy design tokens — the colorized palette (2026-08 "add color" revision).
 *
 * Source of truth: Paper file "euxy"
 *   https://app.paper.design/file/01KY80MDKPNF9GAKHVF36TY2GJ/1-0
 * See docs/design/README.md for the screen/node index and behavior redlines.
 *
 * Rule: the app is a dark indigo ground with vivid hues on top. The step
 * ramps sweep indigo → violet → magenta → coral → amber; lanes take accent
 * hues from `laneHue`; the violet `accent` is the interactive tint. The
 * three functional colors keep their meanings (playhead cyan, connected
 * green, record/destructive red).
 *
 * Styling: consume these tokens directly with React Native `StyleSheet`
 * (and `Color` from expo-router for native semantic colors where relevant).
 * Do NOT use NativeWind / Tailwind — this module is the single style source.
 */

/** Structural ramp, light → dark — the old OP-XY monoramp shifted toward
 * indigo so borders, rails, and dim chrome sit in the same hue family as the
 * surfaces. Same lightness stops as before. */
export const ramp = {
  0: '#f7f3fc', // brightest (primary label / active / play)
  1: '#b3aec4',
  2: '#9791ad',
  3: '#7b7594',
  4: '#615c7a',
  5: '#49445f',
  6: '#302c42',
  7: '#171425',
  8: '#000000', // ground
} as const;

/**
 * Sequencer-key ramp — the colorized sweep: 8 hue anchors running deep
 * indigo → violet → magenta → hot pink → coral → amber, each spanning a PAIR
 * of adjacent keys, so a 16-step row sweeps the full spectrum dark → hot.
 * Slot 1 stays dark enough to sit on the ground but visible. These 8 are the
 * ANCHORS; step grids fill from `stepFill`.
 */
export const keyRamp = [
  '#221148', // pair 1-2 — deep indigo, visible on the ground
  '#3A1D7A',
  '#5B2BA8',
  '#8A36C9',
  '#C13FD1',
  '#E8559E',
  '#F87A6A',
  '#FFB25A', // pair 15-16 — amber, never white
] as const;

/**
 * Step-grid fills — `keyRamp` resampled to 16 shades, ONE PER SLOT, so a
 * 16-step row reads as a continuous hue sweep instead of eight visible
 * two-cell plateaus. Same range as the anchor ramp (slot 1 is still
 * #221148, slot 16 still #FFB25A, still never white): only the sampling gets
 * finer, so the grid looks like the same gradient with twice the steps.
 *
 * Derivation — `keyRamp` sampled at `slot * 7 / 15`, linear per channel:
 * every even slot lands within a couple of levels of its old pair color, and
 * the odd slots are the newly interpolated shades between them.
 */
export const stepRamp = [
  '#221148',
  '#2D175F',
  '#381C77',
  '#47238C',
  '#5729A2',
  '#6B2FB3',
  '#8134C2',
  '#9938CB',
  '#B23DCF',
  '#C943C7',
  '#DB4EAF',
  '#EA5A97',
  '#F26B7F',
  '#F87E69',
  '#FC9861',
  '#FFB25A',
] as const;

/** Fill for a step at `slot`, wrapped into its 16-slot row. */
export function stepFill(slot: number): string {
  return stepRamp[((slot % 16) + 16) % 16];
}

export const color = {
  // Surfaces — deep indigo family, dark → light
  ground: '#0B0716', // app background (near-black indigo, still OLED-friendly)
  surface: '#1D1633', // grouped cell / bars
  surface2: '#2B2148', // controls, empty step blocks
  // Also the panel a grouped row expands into: one step ABOVE the cell's
  // surface2, never below it. Dropping that panel to the ground punched a black
  // hole in the group (Brent 2026-07-29); a step up separates it from the cell
  // and still reads as content the row revealed.
  surface3: '#3A2D5E', // disclosure panel, segmented track fill
  surface4: '#4A3A75', // grabber, active segment, controls inside a surface3 panel
  separator: '#1D1633',
  displayBg: '#0A0618', // dot-matrix "device screen" panel (Graph view)

  // Labels (text) — cool lavender-tinted ramp
  label: '#F7F3FF', // primary + active/interactive
  label2: '#B7AECE',
  label25: '#A197BE', // section headers / secondary values (between label2 and label3)
  label3: '#9890B4', // secondary
  label4: '#7C7399', // tertiary
  labelDisabled: '#5D5578',

  // Accent — the interactive tint (tab bar, back chevrons, active controls)
  accent: '#B18CFF', // vivid violet

  // Step blocks
  stepHit: '#E8559E', // hot pink — pulled from the key ramp
  stepEmpty: '#2B2148',
  stepEmptyDim: '#221A39', // gen sub-rows

  // Functional-semantic colors — meanings unchanged
  playhead: '#5EEAD4', // cyan, echoes the OP-XY display
  connected: '#30D158', // success / device connected
  danger: '#FF453A', // record LED + destructive (Panic, swipe-delete)
} as const;

/**
 * Per-lane accent hues — vivid, evenly spread around the wheel so adjacent
 * lanes always read as different instruments. A lane keeps its hue by INDEX
 * (wrapping past 8 lanes), so colors are stable across a session.
 */
export const laneHues = [
  '#FF6B6B', // red-coral
  '#FFA94D', // orange
  '#FFD43B', // yellow
  '#69DB7C', // green
  '#38D9A9', // teal
  '#4DABF7', // blue
  '#9775FA', // violet
  '#F783AC', // pink
] as const;

/** Accent hue for the lane at `index`, wrapped into the 8-hue palette. */
export function laneHue(index: number): string {
  return laneHues[((index % laneHues.length) + laneHues.length) % laneHues.length];
}

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
