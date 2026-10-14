// Color assignment (spec 3 and 14.2). Every attempt draws its colors from its own seeded Rng:
// the orange pegs from the pegs flagged canBeOrange, then 2 green and 1 purple from the
// remaining flagged pegs, falling back to unflagged pegs only when the flagged set runs out.
// Colors are indexed by body index (level elements first, in file order).

import type { Rng } from '../core/rng';
import type { CompiledLevel } from '../sim/compile';
import type { BodyView } from '../sim/world';
import { GREEN_COUNT } from './tuning';
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
  for (const i of rng.sample(pool, config.orangeCount)) colors[i] = 'orange';

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
