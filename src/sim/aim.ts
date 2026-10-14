// Aim helpers for the input layer. The simulation only ever sees a direction vector; the angle
// stays in the input layer, which converts it here with dmath so every engine agrees.

import { cos, sin } from '../core/dmath';
import type { Vec2 } from '../level/geometry';
import { BARREL_LENGTH, BALL_RADIUS, CANNON_PIVOT_Y, MAX_AIM_ANGLE } from './tuning';

/**
 * Unit launch direction for an aim angle in radians measured from straight down, positive
 * toward the right (+x). 0 shoots straight down; +/-PI/2 shoots horizontally.
 */
export function aimDirection(angle: number): Vec2 {
  return { x: sin(angle), y: cos(angle) };
}

/** Clamps an aim angle to the cannon's range, 97 degrees either side of straight down. */
export function clampAim(angle: number): number {
  return angle > MAX_AIM_ANGLE ? MAX_AIM_ANGLE : angle < -MAX_AIM_ANGLE ? -MAX_AIM_ANGLE : angle;
}

/** Cannon pivot on a board of the given width. */
export function cannonPivot(boardWidth: number): Vec2 {
  return { x: boardWidth / 2, y: CANNON_PIVOT_Y };
}

/** Where a ball of the given radius leaves the barrel for a unit direction. */
export function launchPoint(boardWidth: number, direction: Vec2, radius = BALL_RADIUS): Vec2 {
  const reach = BARREL_LENGTH + radius;
  return { x: boardWidth / 2 + reach * direction.x, y: CANNON_PIVOT_Y + reach * direction.y };
}
