// Movement helpers for templates. A movement's start phase is rounded to a whole tick of its
// period (research 3.2), which would shift parts placed at exact angles by up to a pixel. The
// helpers therefore set start angles with pathRotation, which is exact, wherever a group has
// to stay rigid; phases are only used between separate groups. Periods should be multiples
// of 4 so quarter and half phases are exact.

import { atan2 } from '../core/dmath';
import type { MovementInput } from '../level/schema';
import type { ScoringDraft } from './draft';

function wrap(p: number): number {
  const r = p - Math.floor(p);
  return r === 1 ? 0 : r;
}

/**
 * The draft turned into one that orbits (cx, cy) once per period, starting where it is now,
 * like a spoke of a wheel: bricks keep their facing relative to the center. Counterclockwise
 * on screen unless `clockwise`. The file position becomes the center (the movement's anchor).
 */
export function orbit<T extends ScoringDraft>(
  d: T,
  cx: number,
  cy: number,
  period: number,
  clockwise = false,
): T {
  const dx = d.x - cx;
  const dy = d.y - cy;
  const r = Math.sqrt(dx * dx + dy * dy);
  const a = r > 0 ? atan2(-dy, dx) : 0;
  const movement: MovementInput = {
    type: 'rotateAroundCircle',
    period,
    radius: r,
    pathRotation: a,
    reverse: clockwise,
  };
  return { ...d, x: cx, y: cy, movement };
}

/**
 * The draft moving back and forth horizontally, `amplitude` either side of its position,
 * starting at its position heading left; `phase` (a cycle fraction) shifts the start.
 */
export function slide<T extends ScoringDraft>(
  d: T,
  amplitude: number,
  period: number,
  phase = 0,
): T {
  // horizontalCycle is at +amplitude at phase 0 and passes the anchor heading left at 0.25.
  return {
    ...d,
    movement: { type: 'horizontalCycle', period, radius: amplitude, phase: wrap(0.25 + phase) },
  };
}

/** The draft bobbing vertically, `amplitude` either side of its position, heading up first. */
export function bob<T extends ScoringDraft>(d: T, amplitude: number, period: number, phase = 0): T {
  return {
    ...d,
    movement: { type: 'verticalCycle', period, radius: amplitude, phase: wrap(phase) },
  };
}

/**
 * The draft circling on a small circle of `radius` around its position, starting at `angle`
 * (math convention: 0 = right of the position, PI/2 = above). All drafts of a floating group
 * get the same arguments, so the group moves as one.
 */
export function float<T extends ScoringDraft>(
  d: T,
  radius: number,
  period: number,
  angle: number,
  clockwise = false,
): T {
  return {
    ...d,
    movement: { type: 'circle', period, radius, pathRotation: angle, reverse: clockwise },
  };
}
