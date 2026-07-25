/**
 * Factory-preset pattern library. v1: five starting points spanning lo-fi,
 * ambient/generative, and club electronic. v2 adds ten percussion-only
 * world-rhythm presets (bembé, bossa, dembow, motorik, two-step, halftime,
 * shuffle, aksak, hemiola, samba) — every lane's onsets verified against
 * core/euclid.ts. All built from the classic Euclidean recipes (Toussaint's
 * world-rhythm table: E(3,8) tresillo, E(5,8) cinquillo, E(7,12) bell,
 * E(4,9) aksak, E(5,16) bossa). Drum lanes all target channel 0 — the
 * OP-XY's track 1 drum kit — using the factory slot notes (see core/opxy.ts).
 * NO preset depends on tonality (2026-07-24): the only non-kit lanes are
 * single-pitch subs (one low note, rhythmic on any patch).
 *
 * Seeding: `PRESETS_VERSION` is recorded in the persisted blob after the
 * presets are appended once, so a user who deletes one never has it respawn.
 * Bump the version only when ADDING presets (append-only; ids are stable).
 */
import { drum } from '@/core/opxy';
import { timing } from '@/theme/tokens';
import { makeLane } from './lane';
import type { Lane, Pattern } from './types';

export const PRESETS_VERSION = 2;

/** True for the factory presets (NOT the seed pattern). */
export const isPresetPattern = (id: string) => id.startsWith('preset_');

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
      { name: 'Kick', length: 16, genA: { pulses: 3, rotation: 0 }, note: drum.kick, channel: 0, velocity: 105 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0, velocity: 92 },
      {
        name: 'Hat',
        length: 16,
        genA: { pulses: 8, rotation: 0 },
        genB: { pulses: 3, rotation: 1 },
        op: 'XOR',
        note: drum.closedHat,
        channel: 0,
        velocity: 68,
        gateMs: 15,
      },
      { name: 'Snap', length: 16, genA: { pulses: 1, rotation: 14 }, note: drum.rim, channel: 0, velocity: 55 },
    ]),
    // Coprime lane lengths (11·13·16) never realign inside a listenable span —
    // the pattern generates itself. Slow resolutions, long gates, low velocity.
    // Percussion-only (2026-07-24): the kit's atmospheric slots (tom, triangle,
    // chi, metal) instead of melodic instrument tracks — no tonality needed.
    pattern('preset_ambient', 'Ambient Drift', 60, [
      {
        name: 'Pulse',
        length: 11,
        genA: { pulses: 1, rotation: 0 },
        note: drum.lowTom,
        channel: 0,
        velocity: 70,
        gateMs: 400,
        resolutionTicks: 24,
      },
      {
        name: 'Chime',
        length: 13,
        genA: { pulses: 3, rotation: 0 },
        note: drum.triangle,
        channel: 0,
        velocity: 60,
        gateMs: 300,
        resolutionTicks: 12,
      },
      {
        name: 'Air',
        length: 11,
        genA: { pulses: 2, rotation: 3 },
        note: drum.chi,
        channel: 0,
        velocity: 50,
        gateMs: 450,
        resolutionTicks: 24,
      },
      {
        name: 'Bell',
        length: 16,
        genA: { pulses: 5, rotation: 2 },
        note: drum.metal,
        channel: 0,
        velocity: 45,
        gateMs: 200,
        resolutionTicks: 12,
      },
    ]),
    // House: kick on the floor, clap backbeat, open hats on the offbeats,
    // 16th closed hats underneath, offbeat tresillo bassline (rotated off the
    // downbeat so it never stacks on the kick — the classic house pocket).
    pattern('preset_house', 'Four on the Floor', 124, [
      { name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Clap', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.clap, channel: 0, velocity: 95 },
      { name: 'Open Hat', length: 16, genA: { pulses: 4, rotation: 2 }, note: drum.openHat, channel: 0, velocity: 85, gateMs: 80 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 58, gateMs: 10 },
      // Single-pitch sub — rhythmic, not melodic, so it works on any patch.
      { name: 'Sub', length: 8, genA: { pulses: 3, rotation: 1 }, note: 36, channel: 2, velocity: 90, gateMs: 100 },
    ]),
    // IDM/electro: aksak kick in 9 against a 7-step snap and the 12-step
    // Ghanaian bell — three coprime meters chewing on each other.
    pattern('preset_idm', 'Broken Machine', 100, [
      { name: 'Kick', length: 9, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 105 },
      { name: 'Snap', length: 7, genA: { pulses: 3, rotation: 0 }, note: drum.clap, channel: 0, velocity: 85 },
      { name: 'Bell', length: 12, genA: { pulses: 7, rotation: 0 }, note: drum.cowbell, channel: 0, velocity: 65, gateMs: 15 },
      {
        name: 'Blip',
        length: 12,
        genA: { pulses: 5, rotation: 0 },
        genB: { pulses: 2, rotation: 0 },
        op: 'XOR',
        note: drum.metal,
        channel: 0,
        velocity: 75,
      },
    ]),
    // Electro-latin: tresillo kick with the cinquillo (its complement-family
    // partner) on the rim, offbeat hats, rotated tresillo bass.
    pattern('preset_cinquillo', 'Cinquillo', 110, [
      { name: 'Kick', length: 8, genA: { pulses: 3, rotation: 0 }, note: drum.kick, channel: 0, velocity: 108 },
      { name: 'Rim', length: 8, genA: { pulses: 5, rotation: 0 }, note: drum.rim, channel: 0, velocity: 80 },
      { name: 'Hat', length: 8, genA: { pulses: 4, rotation: 1 }, note: drum.closedHat, channel: 0, velocity: 70, gateMs: 15 },
      // Single-pitch sub — rhythmic, not melodic, so it works on any patch.
      { name: 'Sub', length: 8, genA: { pulses: 3, rotation: 2 }, note: 36, channel: 2, velocity: 88, gateMs: 110 },
    ]),

    // ——— v2 additions: ten percussion-only presets (no melodic lanes) built
    // from verified world-rhythm onsets. Every lane below was checked against
    // core/euclid.ts — grids in docs: ROADMAP "Preset library v2".

    // Afro-Cuban 12/8: E(7,12) rotated 7 IS the bembé bell (x.x.xx.x.x.x).
    // All lanes at triplet-eighths (8 ticks) so 12 steps = one 4/4 bar.
    pattern('preset_bembe', 'Bembé', 96, [
      { name: 'Bell', length: 12, genA: { pulses: 7, rotation: 7 }, note: drum.cowbell, channel: 0, velocity: 82, gateMs: 15, resolutionTicks: 8 },
      { name: 'Kick', length: 12, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 105, resolutionTicks: 8 },
      { name: 'Conga', length: 12, genA: { pulses: 5, rotation: 0 }, note: drum.lowConga, channel: 0, velocity: 85, resolutionTicks: 8 },
      { name: 'Shaker', length: 12, genA: { pulses: 6, rotation: 11 }, note: drum.shaker, channel: 0, velocity: 52, gateMs: 12, resolutionTicks: 8 },
    ]),
    // E(5,16) rotated 10 is the bossa-nova clave (x..x..x...x..x..) — the one
    // Toussaint timeline that's a pure Euclid rotation.
    pattern('preset_bossa', 'Bossa Nova', 112, [
      { name: 'Clave', length: 16, genA: { pulses: 5, rotation: 10 }, note: drum.clave, channel: 0, velocity: 92, gateMs: 20 },
      { name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 96 },
      { name: 'Tamb', length: 16, genA: { pulses: 2, rotation: 12 }, note: drum.tamb, channel: 0, velocity: 70 },
      { name: 'Shaker', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.shaker, channel: 0, velocity: 48, gateMs: 10 },
    ]),
    // Reggaeton: the dembow snare is tresillo-minus-the-downbeat — an 8-step
    // lane playing E(3,8) A>B E(1,8) = hits 3·6, i.e. 3·6·11·14 over the bar.
    pattern('preset_dembow', 'Dembow', 95, [
      { name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Snare', length: 8, genA: { pulses: 3, rotation: 0 }, genB: { pulses: 1, rotation: 0 }, op: 'A>B', note: drum.snare, channel: 0, velocity: 96 },
      { name: 'Hat', length: 16, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 64, gateMs: 12 },
      { name: 'Shaker', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.shaker, channel: 0, velocity: 42, gateMs: 8 },
    ]),
    // Krautrock: relentless straight eighth kick, bare backbeat, one pickup
    // rim before the loop — the apparent motion is all in the repetition.
    pattern('preset_motorik', 'Motorik', 120, [
      { name: 'Kick', length: 16, genA: { pulses: 8, rotation: 0 }, note: drum.kick, channel: 0, velocity: 100 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 12 }, note: drum.snare, channel: 0, velocity: 92 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 54, gateMs: 8 },
      { name: 'Rim', length: 16, genA: { pulses: 1, rotation: 2 }, note: drum.rim, channel: 0, velocity: 50 },
    ]),
    // UK garage / DnB: the two-step kick (0 and 10) is two single-pulse
    // generators OR'd — a shape one Euclid can't make.
    pattern('preset_twostep', 'Two-Step', 172, [
      { name: 'Kick', length: 16, genA: { pulses: 1, rotation: 0 }, genB: { pulses: 1, rotation: 6 }, op: 'OR', note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 12 }, note: drum.snare, channel: 0, velocity: 100 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 48, gateMs: 6 },
      { name: 'Ghost', length: 16, genA: { pulses: 3, rotation: 15 }, note: drum.rim, channel: 0, velocity: 45 },
    ]),
    // Halftime trap: snare only on beat 3; the roll lane is a 12-step
    // 1/32-resolution polymeter (36-tick loop against the 96-tick bar) so the
    // hat stutter drifts across the grid instead of repeating.
    pattern('preset_halftime', 'Halftime', 140, [
      { name: 'Kick', length: 16, genA: { pulses: 3, rotation: 0 }, note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Snare', length: 16, genA: { pulses: 1, rotation: 8 }, note: drum.snare, channel: 0, velocity: 105 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 58, gateMs: 8 },
      { name: 'Roll', length: 12, genA: { pulses: 4, rotation: 0 }, note: drum.closedHat2, channel: 0, velocity: 44, gateMs: 5, resolutionTicks: 3 },
    ]),
    // Blues shuffle: E(8,12) at triplet-eighths is the swung-eighth grid
    // (x.xx.xx.xx.x) — long-short, long-short.
    pattern('preset_shuffle', 'Shuffle', 88, [
      { name: 'Hat', length: 12, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 72, gateMs: 12, resolutionTicks: 8 },
      { name: 'Kick', length: 12, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 104, resolutionTicks: 8 },
      { name: 'Snare', length: 12, genA: { pulses: 2, rotation: 9 }, note: drum.snare, channel: 0, velocity: 95, resolutionTicks: 8 },
      { name: 'Rim', length: 12, genA: { pulses: 1, rotation: 1 }, note: drum.rim, channel: 0, velocity: 48, resolutionTicks: 8 },
    ]),
    // Turkish 9/8 karşılama: E(4,9) = the 2+2+2+3 aksak limp; the rim plays
    // E(5,9) A>B kick so the two interlock without ever doubling.
    pattern('preset_aksak', 'Aksak', 104, [
      { name: 'Kick', length: 9, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 105 },
      { name: 'Rim', length: 9, genA: { pulses: 5, rotation: 0 }, genB: { pulses: 4, rotation: 0 }, op: 'A>B', note: drum.rim, channel: 0, velocity: 82 },
      { name: 'Hat', length: 9, genA: { pulses: 9, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 56, gateMs: 10 },
      { name: 'Bell', length: 9, genA: { pulses: 2, rotation: 0 }, note: drum.cowbell, channel: 0, velocity: 72, gateMs: 15 },
    ]),
    // The hemiola, stated plainly: 3 bell strokes against 4 kicks in the same
    // 12 steps — twist either rotation live and the argument changes.
    pattern('preset_hemiola', 'Three Over Four', 110, [
      { name: 'Kick', length: 12, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 105 },
      { name: 'Bell', length: 12, genA: { pulses: 3, rotation: 0 }, note: drum.cowbell, channel: 0, velocity: 85, gateMs: 15 },
      { name: 'Shaker', length: 12, genA: { pulses: 6, rotation: 11 }, note: drum.shaker, channel: 0, velocity: 50, gateMs: 12 },
      { name: 'Clap', length: 12, genA: { pulses: 1, rotation: 6 }, note: drum.clap, channel: 0, velocity: 80 },
    ]),
    // Rio batucada: surdo answers on 2 & 4, tamborim rides E(7,16) (the
    // Brazilian samba necklace), agogo plays the bossa necklace, chocalho
    // fills the offbeats.
    pattern('preset_samba', 'Samba', 104, [
      { name: 'Surdo', length: 16, genA: { pulses: 2, rotation: 12 }, note: drum.lowTom, channel: 0, velocity: 110, gateMs: 120 },
      { name: 'Tamborim', length: 16, genA: { pulses: 7, rotation: 0 }, note: drum.rim, channel: 0, velocity: 85 },
      { name: 'Agogo', length: 16, genA: { pulses: 5, rotation: 10 }, note: drum.cowbell, channel: 0, velocity: 70, gateMs: 15 },
      { name: 'Chocalho', length: 16, genA: { pulses: 8, rotation: 15 }, note: drum.shaker, channel: 0, velocity: 55, gateMs: 8 },
    ]),
  ];
}
