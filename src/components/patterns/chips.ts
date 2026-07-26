/**
 * Pattern chip glyphs — Paper "Preset icons — assortment": 50 5×5 LED grids.
 * Each glyph is 25 shade digits (row-major): 0 rest-dim, 1 lit, 2 light.
 * The first 30 were extracted 1:1 from the artboard's SVGs; the 13 v3-preset
 * glyphs (triphop…bang) and the 7 spare ones (star…ladder) were designed in
 * code and drawn back onto the artboard from these same strings.
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
  // v3 preset glyphs (2026-07-25), same language: greys + one #F6F4F4 pixel.
  triphop: '0000010010000000020000000', // kicks 0+10 over one deep snare hit
  stagger: '2000001000000100010000001', // a diagonal that wobbles — drunk walk
  loop: '0111010001100011000101210', // circle with a bright playhead
  nod: '0000010001010100020000000', // chevron down, bright tip
  stack: '2001000000100100000000100', // cowbell / kick / snare rows
  room: '1111110001102011000111111', // hollow square, pulsing center
  bolt: '0001100110011110011002100', // lightning, bright tail
  drop: '0010001110111111121101110', // droplet, bright core
  steps: '1000100000002000000010001', // quincunx — dance-step chart
  glitch: '0000011011000002011000000', // broken bursts
  backbeat: '0101001010020100101001010', // two full pillars on 2 & 4
  ghosts: '0000010110002000110100000', // swung pairs around one big hit
  bang: '0010000100001000000000200', // exclamation mark
  // Rounding the registry out to 50 (2026-07-25). No preset claims these —
  // they exist purely for users picking an icon by hand.
  star: '0010011111012100101010001',
  moon: '0110010000200001000001100', // crescent, bright on the inner arc
  spiral: '1111100001112011000111111', // a loop that never closes
  pulse: '0000001210010101101100000', // square wave, bright at the high step
  orbit: '0000001110102010111000000', // ring around a bright center
  plus: '0010000100112110010000100',
  ladder: '1000111211100011111110001',
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
  // v3 presets — each gets its own bespoke glyph (the assortment glyphs they
  // briefly borrowed go back to the user-pickable pool).
  preset_triphop: 'triphop',
  preset_drunk: 'stagger',
  preset_tapeloop: 'loop',
  preset_headnod: 'nod',
  preset_phonk: 'stack',
  preset_techno: 'room',
  preset_electro: 'bolt',
  preset_acid: 'drop',
  preset_footwork: 'steps',
  preset_stutter: 'glitch',
  preset_moneybeat: 'backbeat',
  preset_purdie: 'ghosts',
  preset_dbeat: 'bang',
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
