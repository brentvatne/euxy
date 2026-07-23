/**
 * Euclidean rhythm engine — pure, platform-agnostic, testable.
 * Rotation is applied at read time (never baked into the stored pattern) so a
 * lane can be twisted live without regenerating. Two generators can be combined
 * by a boolean op (the Digitakt dual-generator model).
 */

export type BoolOp = 'OR' | 'AND' | 'XOR' | 'A>B';

/**
 * Distribute `hits` across `steps` as evenly as possible (Bresenham form).
 * Returns an array of 0/1 of length `steps`.
 */
export function euclid(hits: number, steps: number): number[] {
  const out: number[] = [];
  if (steps <= 0) return out;
  const h = Math.max(0, Math.min(Math.floor(hits), steps));
  let bucket = 0;
  for (let i = 0; i < steps; i++) {
    bucket += h;
    if (bucket >= steps) {
      bucket -= steps;
      out.push(1);
    } else {
      out.push(0);
    }
  }
  return out;
}

/** Read a pattern with rotation applied at read time (positive = shift left). */
export function withRotation(pattern: number[], rotation: number): number[] {
  const n = pattern.length;
  if (n === 0) return pattern;
  const r = ((rotation % n) + n) % n;
  return pattern.map((_, i) => pattern[(i + r) % n]);
}

/** A single generator's played pattern: euclid + rotation. */
export function generator(hits: number, steps: number, rotation: number): number[] {
  return withRotation(euclid(hits, steps), rotation);
}

/** Combine two equal-length generator patterns by a boolean op. */
export function combine(a: number[], b: number[], op: BoolOp): number[] {
  const n = Math.max(a.length, b.length);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = a[i] ? 1 : 0;
    const y = b[i] ? 1 : 0;
    let v = 0;
    switch (op) {
      case 'OR':
        v = x | y;
        break;
      case 'AND':
        v = x & y;
        break;
      case 'XOR':
        v = x ^ y;
        break;
      case 'A>B':
        v = x && !y ? 1 : 0;
        break;
    }
    out.push(v);
  }
  return out;
}

/**
 * The step index a lane plays at a given global tick. Polymeter is derived here,
 * never stored: each lane advances independently off the shared tick.
 */
export function laneStepAt(globalTick: number, ticksPerStep: number, steps: number): number {
  if (ticksPerStep <= 0 || steps <= 0) return 0;
  return Math.floor(globalTick / ticksPerStep) % steps;
}
