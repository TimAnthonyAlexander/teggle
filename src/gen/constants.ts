// Generator constants. Sizes and spacing come from the measured original levels
// (docs/research/original-levels.md); the gap was found by dropping balls into gaps in the
// simulation (tools/gap-probe.ts, spec 14.2). Units are board px and ticks.

import { PI } from '../core/dmath';
import { BALL_RADIUS, CANNON_PIVOT_Y, CEILING_BOTTOM } from '../sim/tuning';

/** Teggle's standard board (spec 14.1). */
export const BOARD_W = 916;
export const BOARD_H = 560;
export const CENTER_X = BOARD_W / 2;

/** Every round peg in the original files has radius 10. */
export const PEG_RADIUS = 10;
/** Every brick is 20 wide; straight bricks are mostly 35 long (30 to 40 occur). */
export const BRICK_WIDTH = 20;
export const BRICK_LENGTH = 35;
export const BRICK_LENGTH_MIN = 30;
export const BRICK_LENGTH_MAX = 40;
/** Curved bricks: the most common inner radius and the measured sector range. */
export const CURVED_INNER_RADIUS = 35;
export const CURVED_SECTOR_MIN = (3 * PI) / 180;
export const CURVED_SECTOR_MAX = (30 * PI) / 180;
/** A curved brick is a polygon of 2 x 4 points, like 1,801 of the original's 1,825. */
export const CURVED_POINTS = 4;

/**
 * Smallest free distance between two objects that are not joined. A ball (radius 6) that
 * lands in a narrower gap between two pegs, two bricks or a peg and a brick can come to rest
 * there; at this gap and wider, no drop in the gap probe stayed put (spec 14.2).
 */
export const MIN_GAP = 12.5;
/**
 * Bricks closer than this are joined: the ball cannot enter the seam, so the pair counts as
 * one surface. Gaps between this and MIN_GAP are rejected.
 */
export const JOIN_GAP = 1.5;
/** Seam left between consecutive bricks of a chain (drawn as a thin dark line). */
export const SEAM = 1;
/** Pegs never come closer than this (center to center): 2 radii plus the minimum gap. */
export const MIN_PEG_SPACING = 2 * PEG_RADIUS + MIN_GAP;
/** Nearest-neighbor spacing the templates aim for (original median 40.7). */
export const PEG_SPACING = 41;

/** Cannon pivot on the board. */
export const CANNON_X = CENTER_X;
export const CANNON_Y = CANNON_PIVOT_Y;
/**
 * Nothing comes closer to the cannon pivot than this. The ball leaves the barrel at 92 px
 * (86 + its radius), so its edge reaches 98; the original keeps peg centers at least 120 away.
 */
export const CANNON_CLEARANCE = 110;

/** Lowest point any object may reach: the bucket's rims rise to about y 532.7, minus the gap. */
export const BOTTOM_LIMIT = 520;
/** Highest point: the ceiling's bottom edge plus the gap. */
export const TOP_LIMIT = CEILING_BOTTOM + MIN_GAP;
/** Side margins: the walls' inner faces are at x = 0 and x = board width. */
export const SIDE_LIMIT = MIN_GAP;

export { BALL_RADIUS };
