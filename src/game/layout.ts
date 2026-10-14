// Play screen layout in world units (docs/design/visual-language.md 16.1 and 16.2). World units
// are original pixels; the screen is 1066.67 x 600, exactly 16:9. Elements centered on the
// original x = 400 move to x = 533.33, and right-anchored ones move right by 266.67.

import { BARREL_LENGTH, BALL_RADIUS, CANNON_PIVOT_Y } from '../sim/tuning';

export const WORLD_W = 3200 / 3;
export const WORLD_H = 600;
export const CENTER_X = WORLD_W / 2;
/** How far right-anchored elements move compared with the 800-wide original. */
export const RIGHT_SHIFT = WORLD_W - 800;

export interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function box(x: number, y: number, w: number, h: number): Box {
  return { x, y, w, h };
}

export function contains(b: Box, x: number, y: number): boolean {
  return x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
}

/** The board (level and physics coordinates) sits at this offset on screen (2.1). */
export const BOARD_X = 75;
export const BOARD_Y = 40;
export const BOARD_W = WORLD_W - 2 * BOARD_X;
export const BOARD_H = 560;

export const layout = {
  ballCounter: box(0, 62, 86, 538),
  feverMeter: box(800 - 86 + RIGHT_SHIFT, 62, 86, 538),
  cornerLeft: box(0, 0, 130, 78),
  cornerRight: box(673 + RIGHT_SHIFT, 0, 127, 78),
  housing: box(CENTER_X - 88, 0, 176, 121),
  banner: box(CENTER_X - 57, 1, 114, 42),
  portrait: { x: CENTER_X, y: 78, r: 42 },
  turnsCounter: { x: CENTER_X, y: 27, w: 44, h: 20 },
  scoreLeft: box(110, 0, CENTER_X - 88 - 110, 46),
  scoreRight: box(CENTER_X + 88, 0, CENTER_X - 88 - 110, 45),
  /** Visible playfield opening; the bottom edge is covered by the rim strip. */
  opening: box(78, 52, WORLD_W - 156, 548),
  bottomRim: box(96, 591, WORLD_W - 192, 9),
  cornerBottomLeft: box(0, 499, 99, 101),
  cornerBottomRight: box(WORLD_W - 93, 499, 93, 101),
  menuButton: { x: 37, y: 566, r: 25.5 },
  holdButton: { x: 763 + RIGHT_SHIFT, y: 566, r: 23 },
  shotTally: { x: CENTER_X, y: 216 },
  warning: { x: CENTER_X, y: 152 },
  resultDialog: box(187 + 133.33, 147, 425, 305),
  bucketY: 580,
} as const;

/** Cannon pivot on screen: the physics pivot (board center, CANNON_PIVOT_Y) moved to the screen. */
export const CANNON_PIVOT = { x: BOARD_X + BOARD_W / 2, y: BOARD_Y + CANNON_PIVOT_Y } as const;
/** Distance from the pivot to the center of a loaded ball (research 1.2). */
export const CANNON_BALL_REACH = BARREL_LENGTH + BALL_RADIUS;

/** Board (level) coordinates to screen world coordinates. */
export function boardToWorld(x: number, y: number): { x: number; y: number } {
  return { x: x + BOARD_X, y: y + BOARD_Y };
}
