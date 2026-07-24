import type { InboundEvent } from './types';

/**
 * Split a raw MIDI byte stream into individually framed messages.
 *
 * A CoreMIDI packet routinely carries SEVERAL messages: realtime bytes ride in
 * the same packet as other traffic (`F8 FA` = clock + start — how a Start
 * arrives from a device that's already sending clock), multiple clocks batch
 * together (`F8 F8 F8` = three ticks), and realtime bytes may interleave in
 * the middle of a channel message. Feeding an unsplit packet to `parseMidi`
 * silently drops everything after the first message — which ate the OP-XY's
 * Start events. Handles running status and skips sysex payloads.
 */
export function splitMidiMessages(bytes: readonly number[]): number[][] {
  const out: number[][] = [];
  let current: number[] = [];
  let expected = 0;
  let runningStatus = 0;
  let inSysex = false;

  const dataLen = (status: number): number => {
    if (status >= 0xf0) {
      if (status === 0xf1 || status === 0xf3) return 1;
      if (status === 0xf2) return 2;
      return 0;
    }
    const kind = status & 0xf0;
    return kind === 0xc0 || kind === 0xd0 ? 1 : 2;
  };

  for (const b of bytes) {
    // Realtime (>= 0xF8): standalone, legal ANYWHERE — even mid-message.
    if (b >= 0xf8) {
      out.push([b]);
      continue;
    }
    if (b === 0xf0) {
      inSysex = true;
      current = [];
      expected = 0;
      continue;
    }
    if (b === 0xf7) {
      inSysex = false;
      continue;
    }
    if (inSysex) continue; // sysex payload — not ours to parse

    if (b & 0x80) {
      // New status byte starts a message (cancels any partial one).
      current = [b];
      expected = dataLen(b);
      if (b < 0xf0) runningStatus = b;
      else runningStatus = 0; // system common cancels running status
      if (expected === 0) {
        out.push(current);
        current = [];
      }
      continue;
    }

    // Data byte.
    if (current.length === 0) {
      if (!runningStatus) continue; // stray data with no status — drop
      current = [runningStatus];
      expected = dataLen(runningStatus);
    }
    current.push(b);
    if (current.length - 1 >= expected) {
      out.push(current);
      current = [];
    }
  }
  return out;
}

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
