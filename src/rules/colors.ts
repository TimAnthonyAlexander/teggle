// Color assignment (spec 3 and 14.2). Every attempt draws its colors from its own seeded Rng:
// the orange pegs from the pegs flagged canBeOrange (weighted toward the cannon and toward each
// other, see drawOrange; uniformly where the config asks for the original's draw), then 2 green
// and 1 purple uniformly from the remaining flagged pegs,
// falling back to unflagged pegs only when the flagged set runs out.
// Colors are indexed by body index (level elements first, in file order).

import type { Rng } from '../core/rng';
import type { CompiledLevel } from '../sim/compile';
import type { BodyView } from '../sim/world';
import { CANNON_PIVOT_Y } from '../sim/tuning';
import {
  GREEN_COUNT,
  ORANGE_CLUSTER_FLOOR,
  ORANGE_CLUSTER_RADIUS,
  ORANGE_PULL_RADIUS,
} from './tuning';
import type { AttemptConfig } from './config';
import type { PegColor } from './scoring';

export class AttemptSetupError extends Error {
  override readonly name = 'AttemptSetupError';
}

export interface ColorAssignment {
  /** Color of every body by body index; null for bodies that are not pegs or bricks. */
  readonly colors: (PegColor | null)[];
  /** Body index of the purple peg, or -1. */
  readonly purple: number;
}

function flagged(level: CompiledLevel, index: number): boolean {
  const e = level.bodies[index]?.element;
  return e !== null && e !== undefined && 'canBeOrange' in e && e.canBeOrange;
}

/** 1 / (1 + (d / r)^4) for the squared distance d2: near 1 inside r, falling fast beyond it. */
function falloff(d2: number, r: number): number {
  const q = d2 / (r * r);
  return 1 / (1 + q * q);
}

/**
 * Draws k orange pegs from `pool` without replacement (spec 14.1, "Orange pegs"): each draw
 * picks a peg with probability proportional to its weight, which falls with its distance from
 * the cannon pivot and rises with its nearness to the orange pegs already drawn, so orange pegs
 * gather near the shooter and near each other while any flagged peg can still be one.
 */
function drawOrange(level: CompiledLevel, pool: readonly number[], k: number, rng: Rng): number[] {
  const n = pool.length;
  const xs = new Array<number>(n);
  const ys = new Array<number>(n);
  const pull = new Array<number>(n);
  const near = new Array<number>(n).fill(ORANGE_CLUSTER_FLOOR);
  const taken = new Array<boolean>(n).fill(false);
  const px = level.level.board.width / 2;
  for (let j = 0; j < n; j++) {
    const e = level.bodies[pool[j] ?? -1]?.element;
    const x = e?.x ?? px;
    const y = e?.y ?? CANNON_PIVOT_Y;
    xs[j] = x;
    ys[j] = y;
    pull[j] = falloff(
      (x - px) * (x - px) + (y - CANNON_PIVOT_Y) * (y - CANNON_PIVOT_Y),
      ORANGE_PULL_RADIUS,
    );
  }
  const out: number[] = [];
  for (let drawn = 0; drawn < k; drawn++) {
    let total = 0;
    for (let j = 0; j < n; j++) if (!taken[j]) total += (pull[j] ?? 0) * (near[j] ?? 0);
    let r = rng.nextFloat() * total;
    let pick = -1;
    for (let j = 0; j < n; j++) {
      if (taken[j]) continue;
      pick = j;
      r -= (pull[j] ?? 0) * (near[j] ?? 0);
      if (r < 0) break;
    }
    if (pick < 0) break;
    taken[pick] = true;
    out.push(pool[pick] ?? -1);
    const x = xs[pick] ?? 0;
    const y = ys[pick] ?? 0;
    for (let j = 0; j < n; j++) {
      if (taken[j]) continue;
      const dx = (xs[j] ?? 0) - x;
      const dy = (ys[j] ?? 0) - y;
      near[j] = (near[j] ?? 0) + falloff(dx * dx + dy * dy, ORANGE_CLUSTER_RADIUS);
    }
  }
  return out;
}

/** Draws k blue pegs from `candidates`, flagged ones first. */
function drawBlue(
  level: CompiledLevel,
  colors: readonly (PegColor | null)[],
  candidates: readonly number[],
  k: number,
  rng: Rng,
): number[] {
  const blue = candidates.filter((i) => colors[i] === 'blue');
  const preferred = blue.filter((i) => flagged(level, i));
  if (preferred.length >= k) return rng.sample(preferred, k);
  const rest = blue.filter((i) => !flagged(level, i));
  return [...preferred, ...rng.sample(rest, Math.min(k - preferred.length, rest.length))];
}

export function assignColors(
  level: CompiledLevel,
  config: AttemptConfig,
  rng: Rng,
): ColorAssignment {
  const colors: (PegColor | null)[] = level.bodies.map((b) => (b.scoring ? 'blue' : null));
  const scoring = level.scoringBodies;

  let greens: number[] = [];
  const seeded = level.level.seededGreens;
  if (config.greens && config.seededGreens && seeded !== undefined) {
    greens = seeded.map((id) => level.bodyIndexById.get(id) ?? -1).filter((i) => i >= 0);
    for (const i of greens) colors[i] = 'green';
  }

  const pool = scoring.filter((i) => colors[i] === 'blue' && flagged(level, i));
  if (pool.length < config.orangeCount) {
    throw new AttemptSetupError(
      `level "${level.level.name}" flags ${pool.length} pegs as canBeOrange; ` +
        `${config.orangeCount} orange pegs are needed`,
    );
  }
  // The original's uniform draw only where the config asks for it (config.ts, ORANGE_DRAWS).
  const orange =
    config.orangeDraw === 'uniform'
      ? rng.sample(pool, config.orangeCount)
      : drawOrange(level, pool, config.orangeCount, rng);
  for (const i of orange) colors[i] = 'orange';

  if (config.greens && greens.length === 0) {
    for (const i of drawBlue(level, colors, scoring, GREEN_COUNT, rng)) colors[i] = 'green';
  }

  let purple = -1;
  if (config.purple) {
    purple = drawBlue(level, colors, scoring, 1, rng)[0] ?? -1;
    if (purple >= 0) colors[purple] = 'purple';
  }
  return { colors, purple };
}

/**
 * Moves the purple peg after a shot (spec 10): it turns back to blue if it was not hit, and a
 * different blue peg still on the board turns purple, flagged pegs first. With no other blue
 * peg left it stays where it is, or there is no purple once it was hit. Returns the new purple
 * body index or -1; updates `colors` in place.
 */
export function movePurple(
  level: CompiledLevel,
  colors: (PegColor | null)[],
  current: number,
  bodies: readonly BodyView[],
  rng: Rng,
): number {
  const candidates = level.scoringBodies.filter((i) => i !== current && bodies[i]?.active === true);
  const next = drawBlue(level, colors, candidates, 1, rng)[0] ?? -1;
  const stillThere = current >= 0 && bodies[current]?.active === true;
  if (next < 0) return stillThere ? current : -1;
  if (stillThere) colors[current] = 'blue';
  colors[next] = 'purple';
  return next;
}
