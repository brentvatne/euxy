/**
 * Lane → played pattern, as pure math. Lives in core (not state/selectors) so
 * the web app can derive the same steps without touching the store. A lane
 * with `genB.pulses === 0` is single-generator (just A) regardless of `op`,
 * so default lanes never fall silent under AND.
 */
import type { Lane } from '@/state/types';
import { combine, generator, withRotation } from './euclid';

type LaneRhythm = Pick<Lane, 'length' | 'genA' | 'genB' | 'op' | 'trackRot'>;

export function patternForLane(lane: LaneRhythm): number[] {
  const a = generator(lane.genA.pulses, lane.length, lane.genA.rotation);
  const combined =
    lane.genB.pulses > 0
      ? combine(a, generator(lane.genB.pulses, lane.length, lane.genB.rotation), lane.op)
      : a;
  return withRotation(combined, lane.trackRot);
}

/**
 * Whether a lane should sound, honoring solo precedence: if any lane is soloed,
 * only soloed lanes sound; otherwise all non-muted lanes sound.
 *
 * Here rather than in state/selectors for the same reason as patternForLane —
 * it is pure, and core modules that need it must not drag the store (and with
 * it React) in behind it. Re-exported from selectors so existing imports work.
 */
export function laneAudible(lane: Pick<Lane, 'muted' | 'solo'>, anySolo: boolean): boolean {
  return anySolo ? lane.solo : !lane.muted;
}
