/**
 * MIDI note number → name, e.g. 60 → "C3" (Yamaha convention, C3 = middle C).
 * The Paper designs label note 36 as "C1" (nodes 12U-0 / WV-0), i.e. octave =
 * floor(n/12) - 2 — match them exactly rather than scientific pitch.
 */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  return `${NAMES[n % 12]}${Math.floor(n / 12) - 2}`;
}
