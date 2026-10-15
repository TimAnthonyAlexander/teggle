// Aim error for the noisy agent: a standard normal draw by the Box-Muller transform, built from
// the deterministic log and cos in src/core/dmath.ts so every engine draws the same bits.

import { cos, log, TAU } from '../core/dmath';
import type { Rng } from '../core/rng';

/** One standard normal number. Takes two uniforms from `rng`. */
export function gaussian(rng: Rng): number {
  // 1 - [0, 1) is in (0, 1], so the log is finite.
  const u = 1 - rng.nextFloat();
  const v = rng.nextFloat();
  return Math.sqrt(-2 * log(u)) * cos(TAU * v);
}
