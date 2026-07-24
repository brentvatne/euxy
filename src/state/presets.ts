/**
 * Factory-preset pattern library. Five starting points spanning the styles the
 * app is most used for — lo-fi, ambient/generative, and club electronic — each
 * built from the classic Euclidean recipes (Toussaint's world-rhythm table:
 * E(3,8) tresillo, E(5,8) cinquillo, E(7,12) bell, E(4,9) aksak, E(5,16)
 * bossa) mapped onto OP-XY tracks 1–5.
 *
 * Seeding: `PRESETS_VERSION` is recorded in the persisted blob after the
 * presets are appended once, so a user who deletes one never has it respawn.
 * Bump the version only when ADDING presets (append-only; ids are stable).
 */
import { timing } from '@/theme/tokens';
import { makeLane } from './lane';
import type { Lane, Pattern } from './types';

export const PRESETS_VERSION = 1;

type LaneSpec = Partial<Lane> & Pick<Lane, 'name' | 'note' | 'channel'>;

function pattern(id: string, name: string, bpm: number, lanes: LaneSpec[]): Pattern {
  return {
    id,
    name,
    bpm,
    baseResolutionTicks: timing.defaultResolutionTicks,
    updatedAt: Date.now(),
    lanes: lanes.map((spec) => makeLane(spec)),
  };
}

/** Fresh copies (new lane ids) of every factory preset. */
export function presetPatterns(): Pattern[] {
  return [
    // Boom-bap kick E(3,16) lands 0·6·11 — the drag behind the beat is the
    // genre; hats are straight 8ths broken up by a XOR'd 3-necklace.
    pattern('preset_lofi', 'Lo-Fi Bounce', 76, [
      { name: 'Kick', length: 16, genA: { pulses: 3, rotation: 0 }, note: 36, channel: 0, velocity: 105 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: 38, channel: 1, velocity: 92 },
      {
        name: 'Hat',
        length: 16,
        genA: { pulses: 8, rotation: 0 },
        genB: { pulses: 3, rotation: 1 },
        op: 'XOR',
        note: 42,
        channel: 2,
        velocity: 68,
        gateMs: 15,
      },
      { name: 'Snap', length: 16, genA: { pulses: 1, rotation: 14 }, note: 39, channel: 3, velocity: 55 },
    ]),
    // Coprime lane lengths (11·13·16) never realign inside a listenable span —
    // the pattern generates itself. Slow resolutions, long gates, low velocity.
    pattern('preset_ambient', 'Ambient Drift', 60, [
      {
        name: 'Pulse',
        length: 11,
        genA: { pulses: 1, rotation: 0 },
        note: 48,
        channel: 0,
        velocity: 70,
        gateMs: 400,
        resolutionTicks: 24,
      },
      {
        name: 'Chime',
        length: 13,
        genA: { pulses: 3, rotation: 0 },
        note: 72,
        channel: 1,
        velocity: 60,
        gateMs: 300,
        resolutionTicks: 12,
      },
      {
        name: 'Air',
        length: 11,
        genA: { pulses: 2, rotation: 3 },
        note: 67,
        channel: 2,
        velocity: 50,
        gateMs: 450,
        resolutionTicks: 24,
      },
      {
        name: 'Bell',
        length: 16,
        genA: { pulses: 5, rotation: 2 },
        note: 79,
        channel: 3,
        velocity: 45,
        gateMs: 200,
        resolutionTicks: 12,
      },
    ]),
    // House: kick on the floor, clap backbeat, open hats on the offbeats,
    // 16th closed hats underneath, tresillo bassline.
    pattern('preset_house', 'Four on the Floor', 124, [
      { name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: 36, channel: 0, velocity: 110 },
      { name: 'Clap', length: 16, genA: { pulses: 2, rotation: 4 }, note: 39, channel: 1, velocity: 95 },
      { name: 'Open Hat', length: 16, genA: { pulses: 4, rotation: 2 }, note: 46, channel: 2, velocity: 85, gateMs: 80 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: 42, channel: 3, velocity: 58, gateMs: 10 },
      { name: 'Bass', length: 8, genA: { pulses: 3, rotation: 0 }, note: 48, channel: 4, velocity: 90, gateMs: 100 },
    ]),
    // IDM/electro: aksak kick in 9 against a 7-step snap and the 12-step
    // Ghanaian bell — three coprime meters chewing on each other.
    pattern('preset_idm', 'Broken Machine', 100, [
      { name: 'Kick', length: 9, genA: { pulses: 4, rotation: 0 }, note: 36, channel: 0, velocity: 105 },
      { name: 'Snap', length: 7, genA: { pulses: 3, rotation: 0 }, note: 38, channel: 1, velocity: 85 },
      { name: 'Bell', length: 12, genA: { pulses: 7, rotation: 0 }, note: 42, channel: 2, velocity: 65, gateMs: 15 },
      {
        name: 'Blip',
        length: 12,
        genA: { pulses: 5, rotation: 0 },
        genB: { pulses: 2, rotation: 0 },
        op: 'XOR',
        note: 63,
        channel: 3,
        velocity: 75,
      },
    ]),
    // Electro-latin: tresillo kick with the cinquillo (its complement-family
    // partner) on the rim, offbeat hats, rotated tresillo bass.
    pattern('preset_cinquillo', 'Cinquillo', 110, [
      { name: 'Kick', length: 8, genA: { pulses: 3, rotation: 0 }, note: 36, channel: 0, velocity: 108 },
      { name: 'Rim', length: 8, genA: { pulses: 5, rotation: 0 }, note: 37, channel: 1, velocity: 80 },
      { name: 'Hat', length: 8, genA: { pulses: 4, rotation: 1 }, note: 42, channel: 2, velocity: 70, gateMs: 15 },
      { name: 'Bass', length: 8, genA: { pulses: 3, rotation: 2 }, note: 48, channel: 4, velocity: 88, gateMs: 110 },
    ]),
  ];
}
