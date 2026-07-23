/** MIDI note number → name, e.g. 60 → "C4" (scientific pitch, C4 = middle C). */
const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export function midiNoteName(note: number): string {
  const n = Math.max(0, Math.min(127, Math.round(note)));
  return `${NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
}
