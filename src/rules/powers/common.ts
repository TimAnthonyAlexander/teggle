// Helpers the powers share: effect lookups across powers, the bucket's travel and cover, which
// several powers change, ball and element lookups, and rules events for the presentation.

import type { BodyDef } from '../../sim/compile';
import type { BallView, World } from '../../sim/world';
import type { AttemptView } from '../attempt';
import type { PowerAction, PowerActionKind } from '../events';
import type { PowerContext } from '../power';
import { FLIPPER_TRAVEL_INSET, PYRAMID_TRAVEL_CUT } from '../tuning';
import type { PowerId } from './ids';

/** True while an effect of any power is active (granted and not waiting for its first shot). */
export function hasActiveEffect(attempt: AttemptView, power: PowerId, tag: string): boolean {
  for (const fx of attempt.effects) {
    if (!fx.pending && fx.power === power && fx.tag === tag) return true;
  }
  return false;
}

/**
 * Sets the bucket's travel for the effects now active: the Pyramid narrows it a little, the
 * Flippers keep the bucket clear of them. Call from begin and end hooks of either.
 */
export function refreshBucketTravel(ctx: PowerContext): void {
  const level = ctx.world.level;
  let travel = level.bucketTravel;
  if (hasActiveEffect(ctx.attempt, 'pyramid', 'pyramid')) {
    travel = Math.min(travel, level.bucketTravel - PYRAMID_TRAVEL_CUT);
  }
  if (hasActiveEffect(ctx.attempt, 'flippers', 'flippers')) {
    travel = Math.min(travel, level.width / 2 - FLIPPER_TRAVEL_INSET);
  }
  ctx.world.setBucketTravel(Math.max(0, travel));
}

/** A Spooky Ball return is still to come: the bucket stays covered until the ball is back. */
export function spookyReturnPending(attempt: AttemptView): boolean {
  if (!hasActiveEffect(attempt, 'spookyBall', 'spookyBall')) return false;
  for (const b of attempt.world.balls) if (b.topReturns > 0) return true;
  return false;
}

/** The ball in play with this id, or undefined. */
export function ballById(world: World, id: number): BallView | undefined {
  for (const b of world.balls) if (b.id === id) return b;
  return undefined;
}

/** How far a body reaches from its position: a circle's radius, a polygon's farthest corner. */
export function bodyReach(def: BodyDef): number {
  if (def.shape === 'circle') return def.radius;
  let r2 = 0;
  for (const e of def.localEdges) {
    const d2 = e.ax * e.ax + e.ay * e.ay;
    if (d2 > r2) r2 = d2;
  }
  return Math.sqrt(r2);
}

/** A powerAction with every field filled, in a fixed key order. */
export function action(
  kind: PowerActionKind,
  x: number,
  y: number,
  fields: Partial<Omit<PowerAction, 'action' | 'x' | 'y'>> = {},
): PowerAction {
  return {
    action: kind,
    x,
    y,
    value: fields.value ?? 0,
    elements: fields.elements ?? [],
    detail: fields.detail ?? '',
    dx: fields.dx ?? 0,
    dy: fields.dy ?? 0,
  };
}

/**
 * Unlit pegs and bricks still on the board that `accept` takes, nearest to (x, y) first (ties by
 * body order). Distances are between positions; only exact arithmetic, so every engine agrees.
 */
export function nearestUnlit(
  attempt: AttemptView,
  x: number,
  y: number,
  accept: (element: number, d2: number) => boolean,
): number[] {
  const bodies = attempt.world.bodies;
  const found: { id: number; d2: number; order: number }[] = [];
  for (const i of attempt.level.scoringBodies) {
    const b = bodies[i];
    if (b === undefined || !b.active || b.lit) continue;
    const dx = b.x - x;
    const dy = b.y - y;
    const d2 = dx * dx + dy * dy;
    if (accept(b.def.id, d2)) found.push({ id: b.def.id, d2, order: i });
  }
  found.sort((a, b) => a.d2 - b.d2 || a.order - b.order);
  return found.map((f) => f.id);
}
