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

/** Width of Teggle's own board (src/gen/constants.ts); the original's is 650. */
export const TEGGLE_BOARD_W = 916;

/**
 * Screen position of a board's (0, 0): the board centered across the screen, its bottom edge on
 * the screen's. Every board position the play screen draws or aims at goes through it, so the
 * cannon pivot (board center, CANNON_PIVOT_Y) is CANNON_PIVOT for any width. Teggle's board starts
 * at (75.33, 40), the original's 650-wide one at (208.33, 40).
 */
export function boardOrigin(width: number, height: number): { x: number; y: number } {
  return { x: CENTER_X - width / 2, y: WORLD_H - height };
}

/**
 * How far the machine's sides stand in from the screen's for a board `width` wide: 0 for
 * Teggle's 916 board, which fills the screen, and for a narrower one as far as gives it a frame
 * 75 units wider on each side, as the original's 800-wide frame is around its 650 board (133.33,
 * whole device pixels at the usual screen widths).
 */
export function frameInset(width: number): number {
  return width >= TEGGLE_BOARD_W ? 0 : (WORLD_W - width - 2 * BOARD_X) / 2;
}

/**
 * The board area a board `width` wide spans on screen, which the Fever buckets and the flippers
 * are laid out across: (BOARD_X, BOARD_W) for Teggle's board, the board itself for a narrower one.
 * BOARD_W is 916.67, so Teggle's runs a third of a unit wider than the board that boardOrigin
 * places; its parts have always been drawn from it.
 */
export function boardFrame(width: number): { x: number; w: number } {
  const inset = frameInset(width);
  return { x: BOARD_X + inset, w: BOARD_W - 2 * inset };
}

/** A round button's place: center and radius. */
export interface RoundButton {
  readonly x: number;
  readonly y: number;
  readonly r: number;
}

/**
 * The machine around a board: the frame's edges and opening and the parts that sit along its
 * sides. Teggle's 916 board fills the 16:9 screen with it (`layout`). A narrower board brings the
 * frame in with it (frameInset): the left side's parts (ball counter, menu button, corner pieces)
 * move right by the inset and the right side's (Fever meter, hold button) left by as much, the
 * score windows shorten toward the screen's middle, and plain bars fill the screen beside the
 * frame. The original's 650 board so gets its own 800-wide 4:3 frame, centered, its opening on
 * board x 3 to 647 as in the original.
 */
export interface MachineLayout {
  /** How far each side of the frame stands in from the screen's; 0 for Teggle's board. */
  readonly inset: number;
  /** The frame's outer edges on screen. */
  readonly left: number;
  readonly right: number;
  readonly opening: Box;
  readonly scoreLeft: Box;
  readonly scoreRight: Box;
  readonly menuButton: RoundButton;
  readonly holdButton: RoundButton;
}

const TEGGLE_MACHINE: MachineLayout = {
  inset: 0,
  left: 0,
  right: WORLD_W,
  opening: layout.opening,
  scoreLeft: layout.scoreLeft,
  scoreRight: layout.scoreRight,
  menuButton: layout.menuButton,
  holdButton: layout.holdButton,
};

/** The machine around a board `width` wide (Teggle's own, `layout`, for 916 and wider). */
export function machineLayout(width: number): MachineLayout {
  const d = frameInset(width);
  if (!(d > 0)) return TEGGLE_MACHINE;
  const { opening: o, scoreLeft: l, scoreRight: r, menuButton: m, holdButton: h } = layout;
  return {
    inset: d,
    left: d,
    right: WORLD_W - d,
    opening: box(o.x + d, o.y, o.w - 2 * d, o.h),
    scoreLeft: box(l.x + d, l.y, l.w - d, l.h),
    scoreRight: box(r.x, r.y, r.w - d, r.h),
    menuButton: { ...m, x: m.x + d },
    holdButton: { ...h, x: h.x - d },
  };
}
