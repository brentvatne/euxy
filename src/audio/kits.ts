/**
 * Built-in sound kits: one 44.1 kHz / 16-bit mono one-shot per OP-XY drum
 * slot (core/opxy.ts), bundled as app assets. Built by scripts/build-sound-kits.py
 * from CC0 sources — provenance in assets/audio/LICENSES.md.
 */
import { DRUM_KIT_LO } from '@/core/opxy';

export type SoundKit = 'off' | '808' | '909' | 'analog';

export const SOUND_KITS: readonly Exclude<SoundKit, 'off'>[] = ['808', '909', 'analog'];

/** Slot order = MIDI 53..76 (DRUM_SLOT_NAMES). */
export const SLOT_KEYS = [
  'kick',
  'kickAlt',
  'snare',
  'snare2',
  'rim',
  'clap',
  'tamb',
  'shaker',
  'closedHat',
  'closedHat2',
  'openHat',
  'clave',
  'lowTom',
  'ride',
  'midTom',
  'crash',
  'hiTom',
  'triangle',
  'lowConga',
  'hiConga',
  'cowbell',
  'guiro',
  'metal',
  'chi',
] as const;

export type SlotKey = (typeof SLOT_KEYS)[number];

// Static requires so Metro bundles every file; a kit is a slot → module map.
export const KIT_MODULES: Record<Exclude<SoundKit, 'off'>, Record<SlotKey, number>> = {
  '808': {
    kick: require('../../assets/audio/808/kick.wav'),
    kickAlt: require('../../assets/audio/808/kickAlt.wav'),
    snare: require('../../assets/audio/808/snare.wav'),
    snare2: require('../../assets/audio/808/snare2.wav'),
    rim: require('../../assets/audio/808/rim.wav'),
    clap: require('../../assets/audio/808/clap.wav'),
    tamb: require('../../assets/audio/808/tamb.wav'),
    shaker: require('../../assets/audio/808/shaker.wav'),
    closedHat: require('../../assets/audio/808/closedHat.wav'),
    closedHat2: require('../../assets/audio/808/closedHat2.wav'),
    openHat: require('../../assets/audio/808/openHat.wav'),
    clave: require('../../assets/audio/808/clave.wav'),
    lowTom: require('../../assets/audio/808/lowTom.wav'),
    ride: require('../../assets/audio/808/ride.wav'),
    midTom: require('../../assets/audio/808/midTom.wav'),
    crash: require('../../assets/audio/808/crash.wav'),
    hiTom: require('../../assets/audio/808/hiTom.wav'),
    triangle: require('../../assets/audio/808/triangle.wav'),
    lowConga: require('../../assets/audio/808/lowConga.wav'),
    hiConga: require('../../assets/audio/808/hiConga.wav'),
    cowbell: require('../../assets/audio/808/cowbell.wav'),
    guiro: require('../../assets/audio/808/guiro.wav'),
    metal: require('../../assets/audio/808/metal.wav'),
    chi: require('../../assets/audio/808/chi.wav'),
  },
  '909': {
    kick: require('../../assets/audio/909/kick.wav'),
    kickAlt: require('../../assets/audio/909/kickAlt.wav'),
    snare: require('../../assets/audio/909/snare.wav'),
    snare2: require('../../assets/audio/909/snare2.wav'),
    rim: require('../../assets/audio/909/rim.wav'),
    clap: require('../../assets/audio/909/clap.wav'),
    tamb: require('../../assets/audio/909/tamb.wav'),
    shaker: require('../../assets/audio/909/shaker.wav'),
    closedHat: require('../../assets/audio/909/closedHat.wav'),
    closedHat2: require('../../assets/audio/909/closedHat2.wav'),
    openHat: require('../../assets/audio/909/openHat.wav'),
    clave: require('../../assets/audio/909/clave.wav'),
    lowTom: require('../../assets/audio/909/lowTom.wav'),
    ride: require('../../assets/audio/909/ride.wav'),
    midTom: require('../../assets/audio/909/midTom.wav'),
    crash: require('../../assets/audio/909/crash.wav'),
    hiTom: require('../../assets/audio/909/hiTom.wav'),
    triangle: require('../../assets/audio/909/triangle.wav'),
    lowConga: require('../../assets/audio/909/lowConga.wav'),
    hiConga: require('../../assets/audio/909/hiConga.wav'),
    cowbell: require('../../assets/audio/909/cowbell.wav'),
    guiro: require('../../assets/audio/909/guiro.wav'),
    metal: require('../../assets/audio/909/metal.wav'),
    chi: require('../../assets/audio/909/chi.wav'),
  },
  'analog': {
    kick: require('../../assets/audio/analog/kick.wav'),
    kickAlt: require('../../assets/audio/analog/kickAlt.wav'),
    snare: require('../../assets/audio/analog/snare.wav'),
    snare2: require('../../assets/audio/analog/snare2.wav'),
    rim: require('../../assets/audio/analog/rim.wav'),
    clap: require('../../assets/audio/analog/clap.wav'),
    tamb: require('../../assets/audio/analog/tamb.wav'),
    shaker: require('../../assets/audio/analog/shaker.wav'),
    closedHat: require('../../assets/audio/analog/closedHat.wav'),
    closedHat2: require('../../assets/audio/analog/closedHat2.wav'),
    openHat: require('../../assets/audio/analog/openHat.wav'),
    clave: require('../../assets/audio/analog/clave.wav'),
    lowTom: require('../../assets/audio/analog/lowTom.wav'),
    ride: require('../../assets/audio/analog/ride.wav'),
    midTom: require('../../assets/audio/analog/midTom.wav'),
    crash: require('../../assets/audio/analog/crash.wav'),
    hiTom: require('../../assets/audio/analog/hiTom.wav'),
    triangle: require('../../assets/audio/analog/triangle.wav'),
    lowConga: require('../../assets/audio/analog/lowConga.wav'),
    hiConga: require('../../assets/audio/analog/hiConga.wav'),
    cowbell: require('../../assets/audio/analog/cowbell.wav'),
    guiro: require('../../assets/audio/analog/guiro.wav'),
    metal: require('../../assets/audio/analog/metal.wav'),
    chi: require('../../assets/audio/analog/chi.wav'),
  },
};

/** Slot key for a MIDI note, or null outside the kit range. */
export function slotKeyFor(note: number): SlotKey | null {
  const i = note - DRUM_KIT_LO;
  return i >= 0 && i < SLOT_KEYS.length ? SLOT_KEYS[i] : null;
}
