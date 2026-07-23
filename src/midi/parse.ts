import type { InboundEvent } from './types';

/** Parse one inbound MIDI message (already framed) into a typed event. */
export function parseMidi(bytes: readonly number[]): InboundEvent | null {
  if (bytes.length === 0) return null;
  const status = bytes[0];

  // System real-time (single byte, >= 0xF8) — arrive standalone.
  if (status >= 0xf8) {
    switch (status) {
      case 0xf8:
        return { type: 'clock' };
      case 0xfa:
        return { type: 'start' };
      case 0xfb:
        return { type: 'continue' };
      case 0xfc:
        return { type: 'stop' };
      default:
        return null;
    }
  }

  if (status === 0xf2) {
    return { type: 'songpos', position: (bytes[1] ?? 0) | ((bytes[2] ?? 0) << 7) };
  }

  const kind = status & 0xf0;
  const channel = status & 0x0f;
  if (kind === 0x90) {
    const velocity = bytes[2] ?? 0;
    // note-on with velocity 0 is a note-off by convention
    return velocity > 0
      ? { type: 'noteon', note: bytes[1] ?? 0, velocity, channel }
      : { type: 'noteoff', note: bytes[1] ?? 0, channel };
  }
  if (kind === 0x80) {
    return { type: 'noteoff', note: bytes[1] ?? 0, channel };
  }
  return null;
}
