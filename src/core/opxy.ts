/**
 * OP-XY drum-kit MIDI layout. Factory drum presets map their 24 slots to
 * MIDI notes 53–76 (F2–E4) — an F-anchored two-octave keyboard, kick on the
 * lowest F — with conventional roles per slot. Source: the drum-patch format
 * (region hikey/lokey = 52 + slot, buba447/opxy-drum-tool) and TE's guide
 * ("kick = the lowest f key, snare = the g key adjacent, hi-hat = the c# key").
 */

export const DRUM_KIT_LO = 53; // slot 1 (kick), F2
export const DRUM_KIT_HI = 76; // slot 24 (chi), E4

/** Conventional TE slot roles, index 0 = MIDI 53. */
export const DRUM_SLOT_NAMES = [
  'kick',
  'kick alt',
  'snare',
  'snare 2',
  'rim',
  'clap',
  'tamb',
  'shaker',
  'closed hat',
  'closed hat 2',
  'open hat',
  'clave',
  'low tom',
  'ride',
  'mid tom',
  'crash',
  'hi tom',
  'triangle',
  'low conga',
  'hi conga',
  'cowbell',
  'guiro',
  'metal',
  'chi',
] as const;

/** Common slots by role, for defaults and presets. */
export const drum = {
  kick: 53,
  kickAlt: 54,
  snare: 55,
  snare2: 56,
  rim: 57,
  clap: 58,
  tamb: 59,
  shaker: 60,
  closedHat: 61,
  closedHat2: 62,
  openHat: 63,
  clave: 64,
  lowTom: 65,
  ride: 66,
  midTom: 67,
  crash: 68,
  hiTom: 69,
  triangle: 70,
  lowConga: 71,
  hiConga: 72,
  cowbell: 73,
  guiro: 74,
  metal: 75,
  chi: 76,
} as const;

/** Slot role name for a MIDI note, or null outside the kit range. */
export function drumSlotName(note: number): string | null {
  return note >= DRUM_KIT_LO && note <= DRUM_KIT_HI
    ? DRUM_SLOT_NAMES[note - DRUM_KIT_LO]
    : null;
}
