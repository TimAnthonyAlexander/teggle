// The Flippers power's keep-out zone (spec 7 and 14.2). Any level can get the power, so every
// level keeps the flippers' whole swing free: the area each flipper sweeps from rest to fully
// raised, plus the minimum gap. The swing is sampled from the simulation's own flipper bodies and
// movers (src/sim/compile.ts), at SUBSTEPS poses per tick of the flipper clock, so the zone is
// exactly where the physics moves them.

import { parseLevel, type Level } from '../level/schema';
import { compileLevel } from '../sim/compile';
import { movementPose, type Pose } from '../sim/movement';
import { FLIPPER_LEFT_VERTICES, FLIPPER_RIGHT_VERTICES, FLIPPER_SWING_TICKS } from '../sim/tuning';
import { MIN_GAP } from './constants';
import { boundsGap, polyShape, shapeGap, type PolyShape, type Shape } from './shapes';

/** Poses sampled per tick of the flipper clock (a flipper turns 4 degrees per tick). */
export const SWING_SUBSTEPS = 4;

/** One flipper's swept area: its outline at every sampled pose, and the box around them all. */
export interface FlipperSweep {
  readonly side: 'left' | 'right';
  readonly poses: readonly PolyShape[];
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

const cache = new Map<string, readonly FlipperSweep[]>();

function emptyLevel(width: number, height: number): Level {
  return parseLevel({
    formatVersion: 1,
    name: 'base',
    background: 'base',
    board: { width, height },
    elements: [],
  });
}

/** Both flippers' swept areas on a board of this size. */
export function flipperSweeps(width: number, height: number): readonly FlipperSweep[] {
  const key = `${width}x${height}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const compiled = compileLevel(emptyLevel(width, height));
  const pose: Pose = { x: 0, y: 0, rotation: 0 };
  const sweeps: FlipperSweep[] = [];
  for (const index of compiled.flipperBodies) {
    const def = compiled.bodies[index];
    if (def === undefined) continue;
    const right = def.side === 'right';
    const mover = right ? compiled.movers.rightFlipper : compiled.movers.leftFlipper;
    const vertices = right ? FLIPPER_RIGHT_VERTICES : FLIPPER_LEFT_VERTICES;
    const poses: PolyShape[] = [];
    for (let k = 0; k <= FLIPPER_SWING_TICKS * SWING_SUBSTEPS; k++) {
      const tick = Math.floor(k / SWING_SUBSTEPS);
      const frac = (k % SWING_SUBSTEPS) / SWING_SUBSTEPS;
      movementPose(mover, def.baseX, def.baseY, def.baseRotation, tick, pose, frac);
      poses.push(polyShape(vertices, pose, true));
    }
    sweeps.push({
      side: right ? 'right' : 'left',
      poses,
      minX: Math.min(...poses.map((p) => p.minX)),
      minY: Math.min(...poses.map((p) => p.minY)),
      maxX: Math.max(...poses.map((p) => p.maxX)),
      maxY: Math.max(...poses.map((p) => p.maxY)),
    });
  }
  cache.set(key, sweeps);
  return sweeps;
}

/**
 * Free distance from a shape to the nearer flipper's swept area (negative when they overlap),
 * or Infinity when the shape is farther than `margin` from both.
 */
export function flipperGap(
  s: Shape,
  width: number,
  height: number,
  margin: number = MIN_GAP,
): number {
  let best = Infinity;
  for (const sweep of flipperSweeps(width, height)) {
    if (boundsGap(sweep, s) >= margin) continue;
    for (const p of sweep.poses) {
      if (boundsGap(p, s) >= Math.min(margin, best)) continue;
      best = Math.min(best, shapeGap(p, s));
    }
  }
  return best;
}
