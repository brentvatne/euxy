/**
 * Factory-preset pattern library. v1: five starting points spanning lo-fi,
 * ambient/generative, and club electronic. v2 adds ten percussion-only
 * world-rhythm presets (bembé, bossa, dembow, motorik, two-step, halftime,
 * shuffle, aksak, hemiola, samba) — every lane's onsets verified against
 * core/euclid.ts. All built from the classic Euclidean recipes (Toussaint's
 * world-rhythm table: E(3,8) tresillo, E(5,8) cinquillo, E(7,12) bell,
 * E(4,9) aksak, E(5,16) bossa). v3 (2026-07-25) adds thirteen genre presets —
 * lo-fi (trip-hop, drunk swing, tape loop), hip hop (head nod, phonk),
 * electronic (techno, electro, acid, footwork), IDM (stutter) and rock
 * (money beat, half-time shuffle, d-beat) — again onset-verified against
 * core/euclid.ts. Drum lanes all target channel 0 — the
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

export const PRESETS_VERSION = 3;

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

    // ——— v3 additions: thirteen genre presets (lo-fi, hip hop, electronic,
    // IDM, rock). Every lane's onsets verified against core/euclid.ts —
    // grids in ROADMAP "Preset library v2/v3".

    // Bristol halftime: kick 0·10, one huge snare on beat 3, long ride
    // eighths carrying the haze, tambourine on the 8th offbeats.
    pattern('preset_triphop', 'Trip-Hop', 68, [
      { name: 'Kick', length: 16, genA: { pulses: 1, rotation: 0 }, genB: { pulses: 1, rotation: 6 }, op: 'OR', note: drum.kick, channel: 0, velocity: 106 },
      { name: 'Snare', length: 16, genA: { pulses: 1, rotation: 8 }, note: drum.snare, channel: 0, velocity: 98 },
      { name: 'Ride', length: 16, genA: { pulses: 8, rotation: 0 }, note: drum.ride, channel: 0, velocity: 52, gateMs: 180 },
      { name: 'Tamb', length: 16, genA: { pulses: 4, rotation: 2 }, note: drum.tamb, channel: 0, velocity: 44 },
    ]),
    // Dilla time without microtiming: swung triplet hats (12-step 1/8T lane)
    // rub against a straight-16th kick E(3,16) r6 (0·5·10) — the two grids
    // never agree and the beat lurches. Snap ghost one step before the snare.
    pattern('preset_drunk', 'Drunk Swing', 84, [
      { name: 'Kick', length: 16, genA: { pulses: 3, rotation: 6 }, note: drum.kick, channel: 0, velocity: 102 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0, velocity: 90 },
      { name: 'Hat', length: 12, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 60, gateMs: 12, resolutionTicks: 8 },
      { name: 'Snap', length: 16, genA: { pulses: 1, rotation: 13 }, note: drum.rim, channel: 0, velocity: 40 },
    ]),
    // Lo-fi drift: a 15-step four-on-the-floor hat slips one 16th every bar
    // (realigns after 15) and a 13-step airy chi layer at 1/8 drifts even
    // slower — the wobble of a tape loop cut slightly short.
    pattern('preset_tapeloop', 'Tape Loop', 72, [
      { name: 'Kick', length: 16, genA: { pulses: 2, rotation: 0 }, note: drum.kick, channel: 0, velocity: 88 },
      { name: 'Rim', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.rim, channel: 0, velocity: 58 },
      { name: 'Hat', length: 15, genA: { pulses: 4, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 46, gateMs: 10 },
      { name: 'Air', length: 13, genA: { pulses: 5, rotation: 0 }, note: drum.chi, channel: 0, velocity: 38, gateMs: 250, resolutionTicks: 12 },
    ]),
    // 90s boom bap: kick lands, pushes mid-bar, then picks up into the loop
    // (0·7·15 = E(1) OR E(2,16) r9), cracking backbeat, straight 8th hats,
    // open-hat pickup on the last 8th.
    pattern('preset_headnod', 'Head Nod', 92, [
      { name: 'Kick', length: 16, genA: { pulses: 1, rotation: 0 }, genB: { pulses: 2, rotation: 9 }, op: 'OR', note: drum.kick, channel: 0, velocity: 108 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0, velocity: 100 },
      { name: 'Hat', length: 16, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 62, gateMs: 12 },
      { name: 'Open Hat', length: 16, genA: { pulses: 1, rotation: 2 }, note: drum.openHat, channel: 0, velocity: 70, gateMs: 90 },
    ]),
    // Memphis halftime: 8-step tresillo kick doubles over the bar
    // (0·3·6·8·11·14), snare only on 3, 16th hats, and the cowbell — phonk's
    // signature — riding the cinquillo necklace against the kick.
    pattern('preset_phonk', 'Phonk', 132, [
      { name: 'Kick', length: 8, genA: { pulses: 3, rotation: 0 }, note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Snare', length: 16, genA: { pulses: 1, rotation: 8 }, note: drum.snare, channel: 0, velocity: 102 },
      { name: 'Cowbell', length: 16, genA: { pulses: 5, rotation: 0 }, note: drum.cowbell, channel: 0, velocity: 78, gateMs: 20 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 50, gateMs: 6 },
    ]),
    // Warehouse techno: the rumble lane is E(7,16) A>B E(4,16) — ghost kicks
    // in every gap BETWEEN the four (3·5·7·10·14), the sidechained-sub illusion
    // at velocity 38. Offbeat open hats over 16th closed hats.
    pattern('preset_techno', 'Warehouse', 132, [
      { name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 112 },
      { name: 'Rumble', length: 16, genA: { pulses: 7, rotation: 0 }, genB: { pulses: 4, rotation: 0 }, op: 'A>B', note: drum.kickAlt, channel: 0, velocity: 38, gateMs: 25 },
      { name: 'Open Hat', length: 16, genA: { pulses: 4, rotation: 2 }, note: drum.openHat, channel: 0, velocity: 80, gateMs: 70 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 48, gateMs: 6 },
      { name: 'Clap', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.clap, channel: 0, velocity: 84 },
    ]),
    // 808 electro: kick 0·10 answered by tuned-kick doubles on 3·11
    // (E(2,16) r13), machine snare backbeat, crisp 16th hats, cowbell in the
    // gaps at 6·14 — the Planet Rock chassis.
    pattern('preset_electro', 'Electro', 130, [
      { name: 'Kick', length: 16, genA: { pulses: 1, rotation: 0 }, genB: { pulses: 1, rotation: 6 }, op: 'OR', note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Kick 2', length: 16, genA: { pulses: 2, rotation: 13 }, note: drum.kickAlt, channel: 0, velocity: 88 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0, velocity: 96 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 52, gateMs: 5 },
      { name: 'Cowbell', length: 16, genA: { pulses: 2, rotation: 2 }, note: drum.cowbell, channel: 0, velocity: 66, gateMs: 15 },
    ]),
    // Acid/rave: the offbeat-8th sub (2·6·10·14) is the genre — it stacks with
    // the open hats between every kick. Single-pitch sub, rhythmic on any patch.
    pattern('preset_acid', 'Acid Line', 138, [
      { name: 'Kick', length: 16, genA: { pulses: 4, rotation: 0 }, note: drum.kick, channel: 0, velocity: 110 },
      { name: 'Sub', length: 16, genA: { pulses: 4, rotation: 2 }, note: 36, channel: 2, velocity: 92, gateMs: 90 },
      { name: 'Open Hat', length: 16, genA: { pulses: 4, rotation: 2 }, note: drum.openHat, channel: 0, velocity: 76, gateMs: 60 },
      { name: 'Hat', length: 16, genA: { pulses: 16, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 50, gateMs: 6 },
      { name: 'Clap', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.clap, channel: 0, velocity: 82 },
    ]),
    // Chicago footwork: the bossa necklace AS the kick (E(5,16) r10 =
    // 0·3·6·10·13) at 160, claps on the backbeat, and a 12-step 1/16T tom
    // lane (48-tick loop) whose triplet stutter drifts a half-bar before
    // realigning every 2 bars.
    pattern('preset_footwork', 'Footwork', 160, [
      { name: 'Kick', length: 16, genA: { pulses: 5, rotation: 10 }, note: drum.kick, channel: 0, velocity: 108 },
      { name: 'Clap', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.clap, channel: 0, velocity: 90 },
      { name: 'Tom', length: 12, genA: { pulses: 3, rotation: 0 }, note: drum.hiTom, channel: 0, velocity: 70, gateMs: 8, resolutionTicks: 4 },
      { name: 'Hat', length: 16, genA: { pulses: 4, rotation: 2 }, note: drum.closedHat, channel: 0, velocity: 46, gateMs: 8 },
    ]),
    // Drill'n'bass: a 7-step 1/32 snare roll (21-tick loop, realigns every
    // 7 bars) chews across a boom-bap kick, with an 11-step metal blip lane —
    // the fast, glitchy cousin of Broken Machine.
    pattern('preset_stutter', 'Stutter', 156, [
      { name: 'Kick', length: 16, genA: { pulses: 3, rotation: 0 }, note: drum.kick, channel: 0, velocity: 108 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0, velocity: 100 },
      { name: 'Roll', length: 7, genA: { pulses: 5, rotation: 0 }, note: drum.snare2, channel: 0, velocity: 40, gateMs: 4, resolutionTicks: 3 },
      { name: 'Blip', length: 11, genA: { pulses: 4, rotation: 0 }, note: drum.metal, channel: 0, velocity: 62, gateMs: 10 },
    ]),
    // The money beat: kick 1 & 3, snare 2 & 4, 8th hats, crash on the
    // downbeat — the most-recorded drum pattern in rock.
    pattern('preset_moneybeat', 'Money Beat', 116, [
      { name: 'Kick', length: 16, genA: { pulses: 2, rotation: 0 }, note: drum.kick, channel: 0, velocity: 108 },
      { name: 'Snare', length: 16, genA: { pulses: 2, rotation: 4 }, note: drum.snare, channel: 0, velocity: 104 },
      { name: 'Hat', length: 16, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 66, gateMs: 12 },
      { name: 'Crash', length: 16, genA: { pulses: 1, rotation: 0 }, note: drum.crash, channel: 0, velocity: 70, gateMs: 250 },
    ]),
    // Purdie-style half-time shuffle, all lanes on the 12-step 1/8T grid:
    // shuffled hats, one big snare on 3, ghost notes E(4,12) r1 filling the
    // swung gaps at velocity 30, kick on 1 and the swung & of 3.
    pattern('preset_purdie', 'Half-Time Shuffle', 77, [
      { name: 'Hat', length: 12, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 68, gateMs: 12, resolutionTicks: 8 },
      { name: 'Snare', length: 12, genA: { pulses: 1, rotation: 6 }, note: drum.snare, channel: 0, velocity: 102, resolutionTicks: 8 },
      { name: 'Ghost', length: 12, genA: { pulses: 4, rotation: 1 }, note: drum.snare2, channel: 0, velocity: 30, resolutionTicks: 8 },
      { name: 'Kick', length: 12, genA: { pulses: 1, rotation: 0 }, genB: { pulses: 1, rotation: 4 }, op: 'OR', note: drum.kick, channel: 0, velocity: 100, resolutionTicks: 8 },
    ]),
    // Discharge beat, one bar of 8ths: kick 0·3·4 (E(2,8) r4 OR a single at 3)
    // against snare 2·6 — the K.SK K.S. gallop under constant hats.
    pattern('preset_dbeat', 'D-Beat', 180, [
      { name: 'Kick', length: 8, genA: { pulses: 2, rotation: 4 }, genB: { pulses: 1, rotation: 5 }, op: 'OR', note: drum.kick, channel: 0, velocity: 110, resolutionTicks: 12 },
      { name: 'Snare', length: 8, genA: { pulses: 2, rotation: 6 }, note: drum.snare, channel: 0, velocity: 105, resolutionTicks: 12 },
      { name: 'Hat', length: 8, genA: { pulses: 8, rotation: 0 }, note: drum.closedHat, channel: 0, velocity: 62, gateMs: 8, resolutionTicks: 12 },
      { name: 'Crash', length: 8, genA: { pulses: 1, rotation: 0 }, note: drum.crash, channel: 0, velocity: 80, gateMs: 200, resolutionTicks: 12 },
    ]),
  ];
}
