// Shot helpers for physics tests, the engine digest and the benchmark.

import type { Vec2 } from '../../src/level/geometry';
import type { LaunchOptions, World } from '../../src/sim/world';

/** Stuck-counter value at which the helper removes a peg, standing in for the rules layer. */
export const STUCK_LIMIT = 300;
export const MAX_SHOT_TICKS = 6000;

/**
 * Stands in for the rules layer's stuck-ball handling: when a ball has made no progress for
 * STUCK_LIMIT ticks, remove the lit element nearest to it (any active one if none is lit).
 */
export function unstick(world: World): void {
  for (const b of world.balls) {
    if (b.stuckTicks < STUCK_LIMIT) continue;
    let best = -1;
    let bestD2 = Infinity;
    const consider = (litOnly: boolean): void => {
      for (const s of world.bodies) {
        if (!s.def.scoring || !s.active || (litOnly && !s.lit)) continue;
        const d2 = (s.x - b.x) * (s.x - b.x) + (s.y - b.y) * (s.y - b.y);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = s.def.id;
        }
      }
    };
    consider(true);
    if (best < 0) consider(false);
    if (best >= 0) world.removePeg(best, 'stuck');
  }
}

export interface ShotOptions {
  readonly maxTicks?: number;
  readonly launch?: LaunchOptions;
  /** Called after the launch and after every tick, with that tick's events in world.events. */
  readonly onTick?: (world: World) => void;
}

/** Launches, steps until every ball has left play, then ends the shot. Returns the ticks. */
export function runShot(world: World, direction: Vec2, options: ShotOptions = {}): number {
  const maxTicks = options.maxTicks ?? MAX_SHOT_TICKS;
  world.launch(direction, options.launch);
  options.onTick?.(world);
  let ticks = 0;
  while (world.ballsInPlay > 0 && ticks < maxTicks) {
    world.step();
    unstick(world);
    options.onTick?.(world);
    ticks++;
  }
  for (const b of [...world.balls]) world.removeBall(b.id);
  world.endShot();
  return ticks;
}

/** Drops a ball at a point (a scripted test shot), then runs and ends the shot like runShot. */
export function runDrop(
  world: World,
  at: { readonly x: number; readonly y: number },
  options: Omit<ShotOptions, 'launch'> = {},
): number {
  const maxTicks = options.maxTicks ?? MAX_SHOT_TICKS;
  world.spawnBall({ x: at.x, y: at.y, vx: 0, vy: 0 });
  options.onTick?.(world);
  let ticks = 0;
  while (world.ballsInPlay > 0 && ticks < maxTicks) {
    world.step();
    unstick(world);
    options.onTick?.(world);
    ticks++;
  }
  for (const b of [...world.balls]) world.removeBall(b.id);
  world.endShot();
  return ticks;
}

/** Steps until the free ball bucket stands still at one end of its path. */
export function waitForBucketEnd(world: World, side: 'left' | 'right'): void {
  const middle = world.level.width / 2;
  for (let i = 0; i < 4 * world.level.bucketCycle; i++) {
    const before = world.bucketX;
    world.step();
    const atSide = side === 'left' ? world.bucketX < middle : world.bucketX > middle;
    if (atSide && Math.abs(world.bucketX - before) < 0.05) return;
  }
  throw new Error('the bucket never came to rest');
}

/** Steps the world without a ball, as while the player aims. */
export function idle(world: World, ticks: number): void {
  for (let i = 0; i < ticks; i++) world.step();
}
