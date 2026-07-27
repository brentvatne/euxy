/**
 * Pattern share codec — the wire format inside a shared euxy URL:
 *
 *   https://euxy.expo.app/p/<base64url(bytes)>      (canonical)
 *   https://euxy.expo.app/p?d=<base64url(bytes)>    (legacy, still accepted)
 *
 * Versioned compact binary (byte-aligned; ~13 B + name per lane, so a 4-lane
 * pattern lands around 100 B → a scannable QR at EC level H). Encoded by the
 * app's share sheet; decoded by BOTH the app's /p route and the web app —
 * this module must stay dependency-free and platform-pure (no zustand, no
 * react, no TextEncoder — Hermes and browsers both run it).
 *
 * Decode is the untrusted-input boundary: every field is clamped to the same
 * ranges the editor enforces, and malformed input throws CodecError (callers
 * show a friendly error, never crash).
 *
 * v1 layout (all multi-byte ints big-endian):
 *   version u8 (=1) · flags u8 (reserved) · bpm×10 u16 · baseResolutionTicks u8
 *   · iconLen u8 + utf8 (chip glyph NAME — not an index, so chips.ts stays
 *     free to reorder) · nameLen u8 + utf8 · laneCount u8
 *   per lane:
 *     length u8 · pulsesA u8 · rotA u8 · pulsesB u8 · rotB u8 · op u8
 *     · trackRot u8 · note u8 · channel u8 · velocity u8 · gateMs u16
 *     · resolutionTicks u8 · nameLen u8 + utf8
 *
 * Mute/solo are deliberately NOT encoded — patterns share clean. Future
 * fields append after the v1 payload (bump version; old decoders reject
 * newer versions loudly rather than misread them).
 */
import type { CombineOp, Lane, Pattern } from '@/state/types';

export const CODEC_VERSION = 1;

/** A decoded shared pattern: everything but ids/timestamps/mix state. */
export type SharedLane = Omit<Lane, 'id' | 'muted' | 'solo'>;
export interface SharedPattern {
  name: string;
  bpm: number;
  baseResolutionTicks: number;
  icon?: string;
  lanes: SharedLane[];
}

export class CodecError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CodecError';
  }
}

const OPS: CombineOp[] = ['OR', 'AND', 'XOR', 'A>B'];

const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, Math.floor(Number.isFinite(v) ? v : lo)));

// ---------------------------------------------------------------------------
// utf8 + base64url without TextEncoder/btoa (Hermes- and browser-safe)

function utf8Encode(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let cp = s.codePointAt(i)!;
    if (cp > 0xffff) i++; // surrogate pair consumed
    if (cp < 0x80) out.push(cp);
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f));
    else if (cp < 0x10000)
      out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    else
      out.push(
        0xf0 | (cp >> 18),
        0x80 | ((cp >> 12) & 0x3f),
        0x80 | ((cp >> 6) & 0x3f),
        0x80 | (cp & 0x3f),
      );
  }
  return out;
}

function utf8Decode(bytes: number[]): string {
  let s = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number;
    if (b < 0x80) {
      cp = b;
      i += 1;
    } else if ((b & 0xe0) === 0xc0) {
      cp = ((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f);
      i += 2;
    } else if ((b & 0xf0) === 0xe0) {
      cp = ((b & 0x0f) << 12) | ((bytes[i + 1] & 0x3f) << 6) | (bytes[i + 2] & 0x3f);
      i += 3;
    } else {
      cp =
        ((b & 0x07) << 18) |
        ((bytes[i + 1] & 0x3f) << 12) |
        ((bytes[i + 2] & 0x3f) << 6) |
        (bytes[i + 3] & 0x3f);
      i += 4;
    }
    // Corrupted bytes can form NaN, out-of-range, or surrogate code points —
    // substitute U+FFFD like every standards decoder instead of throwing.
    if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) cp = 0xfffd;
    s += String.fromCodePoint(cp);
  }
  return s;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function base64urlEncode(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += B64[b0 >> 2];
    out += B64[((b0 & 3) << 4) | ((b1 ?? 0) >> 4)];
    if (b1 === undefined) break;
    out += B64[((b1 & 15) << 2) | ((b2 ?? 0) >> 6)];
    if (b2 === undefined) break;
    out += B64[b2 & 63];
  }
  return out;
}

function base64urlDecode(s: string): number[] {
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of s) {
    const v = B64.indexOf(ch);
    if (v < 0) throw new CodecError('invalid character in payload');
    buffer = (buffer << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >> bits) & 0xff);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------

class Writer {
  bytes: number[] = [];
  u8(v: number) {
    this.bytes.push(v & 0xff);
  }
  u16(v: number) {
    this.bytes.push((v >> 8) & 0xff, v & 0xff);
  }
  str(s: string) {
    const b = utf8Encode(s).slice(0, 255);
    this.u8(b.length);
    this.bytes.push(...b);
  }
}

class Reader {
  private i = 0;
  constructor(private bytes: number[]) {}
  u8(): number {
    if (this.i >= this.bytes.length) throw new CodecError('payload truncated');
    return this.bytes[this.i++];
  }
  u16(): number {
    return (this.u8() << 8) | this.u8();
  }
  str(): string {
    const len = this.u8();
    if (this.i + len > this.bytes.length) throw new CodecError('payload truncated');
    const b = this.bytes.slice(this.i, this.i + len);
    this.i += len;
    return utf8Decode(b);
  }
}

export function encodePattern(pattern: Pattern | SharedPattern): string {
  const w = new Writer();
  w.u8(CODEC_VERSION);
  w.u8(0); // flags, reserved
  w.u16(clamp(pattern.bpm * 10, 200, 4000));
  w.u8(clamp(pattern.baseResolutionTicks, 1, 96));
  w.str(pattern.icon ?? '');
  w.str(pattern.name);
  const lanes = pattern.lanes.slice(0, 32);
  w.u8(lanes.length);
  for (const lane of lanes) {
    const len = clamp(lane.length, 1, 64);
    w.u8(len);
    w.u8(clamp(lane.genA.pulses, 0, len));
    w.u8(clamp(lane.genA.rotation, 0, len - 1));
    w.u8(clamp(lane.genB.pulses, 0, len));
    w.u8(clamp(lane.genB.rotation, 0, len - 1));
    w.u8(Math.max(0, OPS.indexOf(lane.op)));
    w.u8(clamp(lane.trackRot, 0, len - 1));
    w.u8(clamp(lane.note, 0, 127));
    w.u8(clamp(lane.channel, 0, 15));
    w.u8(clamp(lane.velocity, 1, 127));
    w.u16(clamp(lane.gateMs, 1, 5000));
    w.u8(clamp(lane.resolutionTicks, 1, 96));
    w.str(lane.name ?? '');
  }
  return base64urlEncode(w.bytes);
}

export function decodePattern(payload: string): SharedPattern {
  if (!payload || payload.length > 4096) throw new CodecError('payload missing or oversized');
  const r = new Reader(base64urlDecode(payload));
  const version = r.u8();
  if (version !== CODEC_VERSION) throw new CodecError(`unsupported version ${version}`);
  r.u8(); // flags
  const bpm = clamp(r.u16(), 200, 4000) / 10;
  const baseResolutionTicks = clamp(r.u8(), 1, 96);
  const icon = r.str();
  const name = r.str();
  const laneCount = r.u8();
  if (laneCount < 1 || laneCount > 32) throw new CodecError('bad lane count');
  const lanes: SharedLane[] = [];
  for (let i = 0; i < laneCount; i++) {
    const length = clamp(r.u8(), 1, 64);
    const lane: SharedLane = {
      length,
      genA: { pulses: clamp(r.u8(), 0, length), rotation: clamp(r.u8(), 0, length - 1) },
      genB: { pulses: clamp(r.u8(), 0, length), rotation: clamp(r.u8(), 0, length - 1) },
      op: OPS[clamp(r.u8(), 0, OPS.length - 1)],
      trackRot: clamp(r.u8(), 0, length - 1),
      note: clamp(r.u8(), 0, 127),
      channel: clamp(r.u8(), 0, 15),
      velocity: clamp(r.u8(), 1, 127),
      gateMs: clamp(r.u16(), 1, 5000),
      resolutionTicks: clamp(r.u8(), 1, 96),
      name: undefined,
    };
    const laneName = r.str();
    if (laneName) lane.name = laneName;
    lanes.push(lane);
  }
  return {
    name: name || 'Shared pattern',
    bpm,
    baseResolutionTicks,
    icon: icon || undefined,
    lanes,
  };
}

/**
 * The full share URL for a pattern.
 *
 * The payload is a PATH segment, not a query param: the web CDN's cache key is
 * query-blind, so `?d=A` and `?d=B` collided on one cached entry and every
 * shared link unfurled with whichever pattern cached first. A path segment
 * varies the key, which is what makes the per-pattern OG card possible.
 * Unpadded base64url is already path-safe, so nothing needs escaping.
 *
 * `/p?d=<payload>` still resolves — both the web page and the app's `p` route
 * keep handling it for links already in the wild.
 */
export function shareUrl(pattern: Pattern | SharedPattern): string {
  return `https://euxy.expo.app/p/${encodePattern(pattern)}`;
}
