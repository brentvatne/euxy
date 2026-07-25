/**
 * Generated pattern names (ROADMAP §9) — adjective × rhythm/machine noun in
 * the app's register: monochrome, hardware, rhythm. Two 24-word banks give
 * 576 combos ("Velvet Tresillo", "Copper Pulse"), so collisions are rare and
 * a reroll never has to work hard to avoid the current name.
 */

/** Textures, metals, greys, light — things the OP-XY palette is made of. */
const ADJECTIVES = [
  'Velvet',
  'Copper',
  'Hollow',
  'Midnight',
  'Chrome',
  'Carbon',
  'Phantom',
  'Slate',
  'Ivory',
  'Onyx',
  'Rusty',
  'Analog',
  'Silent',
  'Broken',
  'Lunar',
  'Ashen',
  'Granite',
  'Parallel',
  'Magnetic',
  'Dusty',
  'Iron',
  'Ghost',
  'Liquid',
  'Neon',
] as const;

/** Rhythms, circuits, signals — what a sequencer pattern actually is. */
const NOUNS = [
  'Tresillo',
  'Clave',
  'Cascade',
  'Circuit',
  'Pendulum',
  'Pulse',
  'Static',
  'Drift',
  'Echo',
  'Relay',
  'Motorik',
  'Dembow',
  'Ratchet',
  'Cadence',
  'Syncope',
  'Ostinato',
  'Filament',
  'Phosphor',
  'Voltage',
  'Dynamo',
  'Tremor',
  'Strobe',
  'Solder',
  'Vector',
] as const;

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)];
}

/**
 * A fresh two-word pattern name. Pass the current name so a reroll never
 * hands back what's already in the field (bounded retry — with 576 combos
 * one exclusion can't exhaust it).
 */
export function generatePatternName(exclude?: string): string {
  let name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  for (let i = 0; i < 8 && name === exclude; i++) {
    name = `${pick(ADJECTIVES)} ${pick(NOUNS)}`;
  }
  return name;
}
