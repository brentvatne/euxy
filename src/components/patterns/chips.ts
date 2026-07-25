/**
 * Pattern chip glyphs — Paper "Preset icons — assortment": 30 5×5 LED grids,
 * one per pattern. Each glyph is 25 shade digits (row-major): 0 rest-dim,
 * 1 lit, 2 light. Extracted 1:1 from the artboard's SVGs.
 */
import type { Pattern } from '@/state/types';

export const CHIP_SHADE_COLORS = ['#45454B', '#AFAFB3', '#F6F4F4'] as const;

export const CHIPS = {
  heart: '0101011111111110111000100',
  invader: '0101011111101011111110001',
  note: '0011100101001001110011100',
  play: '0100001100011200110001000',
  hocket: '1010101010101010101010101',
  crossing: '1000101010002000101010001',
  rampUp: '0000200011001110111111111',
  smile: '0000001010000001000101110',
  bloom: '0010001110112110111000100',
  lfo: '0000001000102010001000000',
  rise: '0020001110101010010000100',
  euxy: '0222020002222222000002220',
  skeleton: '0111011111101010111001010',
  polymeter: '0000021100000002111100000',
  clave: '0000020101000000101000000',
  tresillo: '0000020000001000000100000',
  dembow: '0000020010000000100100000',
  swing: '0000000000210110000000000',
  fourOnFloor: '0000002010000000101000000',
  offbeat: '0000002020000001010100000',
  waltz: '0000000200000000101000000',
  breaks: '1001001000000020010010010',
  oneDrop: '0000000000000000020000000',
  roll: '0000000000101120000000000',
  bell: '0020001110011101111100100',
  motorik: '0000000000111120000000000',
  twoStep: '0200001000000100001000000',
  aksak: '0020000100110100000100000',
  threeFour: '0000010201000001101100000',
  samba: '0010002010000110001100000',
} as const;

export type ChipName = keyof typeof CHIPS;

const CHIP_NAMES = Object.keys(CHIPS) as ChipName[];

/** Curated glyphs for the factory presets + seed; everything else hashes its
 * id to a stable pick from the assortment. */
const ASSIGNED: Record<string, ChipName> = {
  pattern_seed: 'euxy',
  // ROADMAP "Six new glyphs" mapping, with two collision resolutions:
  // bossa takes clave (per the map), so cinquillo moves to tresillo (its
  // family); shuffle takes swing, so lo-fi moves to oneDrop.
  preset_lofi: 'oneDrop',
  preset_ambient: 'bloom',
  preset_house: 'fourOnFloor',
  preset_idm: 'polymeter',
  preset_cinquillo: 'tresillo',
  preset_bembe: 'bell',
  preset_bossa: 'clave',
  preset_dembow: 'dembow',
  preset_motorik: 'motorik',
  preset_twostep: 'twoStep',
  preset_halftime: 'roll',
  preset_shuffle: 'swing',
  preset_aksak: 'aksak',
  preset_hemiola: 'threeFour',
  preset_samba: 'samba',
};

export function chipForPattern(pattern: Pick<Pattern, 'id' | 'icon'>): string {
  if (pattern.icon && pattern.icon in CHIPS) return CHIPS[pattern.icon as ChipName];
  const assigned = ASSIGNED[pattern.id];
  if (assigned) return CHIPS[assigned];
  let h = 0;
  for (let i = 0; i < pattern.id.length; i++) h = (h * 31 + pattern.id.charCodeAt(i)) >>> 0;
  return CHIPS[CHIP_NAMES[h % CHIP_NAMES.length]];
}

/** The pattern's effective glyph NAME (resolving the ASSIGNED/hash fallbacks
 * exactly like the chip render). Share encoding needs the NAME — curated
 * preset glyphs live in the id-keyed ASSIGNED map, and ids don't travel in a
 * share payload. */
export function effectiveChipName(pattern: Pick<Pattern, 'id' | 'icon'>): ChipName {
  const shades = chipForPattern(pattern);
  return CHIP_NAMES.find((n) => CHIPS[n] === shades)!;
}

export function allChipNames(): ChipName[] {
  return [...CHIP_NAMES];
}

export function randomChipName(): ChipName {
  return CHIP_NAMES[Math.floor(Math.random() * CHIP_NAMES.length)];
}
