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
