// Every physics constant in one place. Values marked "original" come from the decompiled 1.01
// code (docs/research/original-tech.md section 4) or from the original's `_base` level, which
// holds the walls, ceiling, buckets and flippers. Teggle-only choices are recorded in spec
// section 14.2. Lengths are board px, times are ticks of 1/100 s, angles are radians.

import { PI } from '../core/dmath';
import type { Vec2 } from '../level/geometry';

export const TICKS_PER_SECOND = 100;

// Ball (research 4.1, original).
export const GRAVITY = 0.05;
export const MAX_SPEED = 15;
export const LAUNCH_SPEED = 4;
export const BALL_RADIUS = 6;
export const FIREBALL_RADIUS = 10;

// Contact solver (research 4.1 and 4.3, original).
export const MAX_CONTACT_ITERATIONS = 20;
/** Contact surfaces sit this far inside the touching distance ("ball radius minus 0.01"). */
export const CONTACT_SKIN = 0.01;
/** An overlap is ignored while the ball already separates faster than this (px/tick). */
export const SEPARATING_SKIP = 0.2;
export const CIRCLE_BOUNCY = 0.9;
export const CIRCLE_ROLLY = 1.0;
export const LINE_BOUNCY = 0.82;
export const LINE_ROLLY = 1.4;
/** Surfaces whose normal is this close to horizontal multiply the impact speed... */
export const STEEP_NORMAL_X = 0.99;
/** ...by this factor, so balls nearly always bounce off walls. */
export const STEEP_IMPACT_SCALE = 5;
export const BALL_BALL_RESTITUTION = 0.95;

// Cannon (research 1.2 and 4.5, original). The pivot sits at (board width / 2, CANNON_PIVOT_Y);
// the ball starts BARREL_LENGTH + its radius along the launch direction.
export const CANNON_PIVOT_Y = 30;
export const BARREL_LENGTH = 86;
/** The cannon turns up to 97 degrees either side of straight down. */
export const MAX_AIM_ANGLE = (97 * PI) / 180;

// Stuck ball (research 4.4, original): every STUCK_SAMPLE_TICKS the ball compares its position
// with the last STUCK_HISTORY samples.
export const STUCK_SAMPLE_TICKS = 10;
export const STUCK_HISTORY = 6;
export const STUCK_RESET_DISTANCE = 2;
export const STUCK_EASE_DISTANCE = 0.2;
export const STUCK_EASE_TICKS = 5;

// Quick disappear (research 4.4, original): the crumble count starts at 3 when the peg lights,
// rises by 1 per tick, and the peg goes at 100.
export const CRUMBLE_START = 3;
export const CRUMBLE_END = 100;

/** A ball leaves play once its center is this far below the board's bottom edge. */
export const BALL_OUT_DEPTH = 50;
/** A returning ball (Spooky Ball) reappears with this much room below the ceiling. */
export const RETURN_CLEARANCE = 0.5;

// Walls and ceiling (original `_base`): solid polygons. The walls' inner edges sit at x = 0 and
// x = board width; the ceiling spans the whole width.
export const BASE_BOUNCY = 0.75;
export const WALL_ROLLY = 1e-5;
export const WALL_THICKNESS = 39;
export const WALL_TOP = -759.5;
/** Wall bottom, below the board's bottom edge. */
export const WALL_BOTTOM_DEPTH = 679.5;
export const CEILING_BOTTOM = 9.375;
export const CEILING_TOP = -15.375;

/** Width of the original's board; base geometry that scales with the board is defined at it. */
export const ORIGINAL_BOARD_WIDTH = 650;

// Free ball bucket (original `_base`). Every part rides one HorizontalCycle mover centered on
// the board; offsets are relative to the bucket center and to the board's bottom edge.
// On the original board the center travels 260 px either way in 600 ticks. Teggle keeps that
// peak speed on any width: cycle = round(BUCKET_REFERENCE_CYCLE * travel / BUCKET_REFERENCE_TRAVEL)
// (905 ticks on the 916 px board).
export const BUCKET_REFERENCE_CYCLE = 600;
export const BUCKET_REFERENCE_TRAVEL = 260;
export const BUCKET_PHASE = 0.25;
/** The bucket center travels from this far from the left wall to as far from the right. */
export const BUCKET_TRAVEL_INSET = 66;
/** Travel changes animate by 1 px every this many ticks (research 4.6). */
export const BUCKET_TRAVEL_STEP_TICKS = 2;
export const BUCKET_CATCH_WIDTH = 130;
export const BUCKET_CATCH_HEIGHT = 20;
export const BUCKET_CATCH_Y = -4;
export const BUCKET_RIM_X = 69;
export const BUCKET_RIM_Y = -13.5;
/** Left rim outline relative to its center; the right rim is its mirror image. */
export const BUCKET_RIM_VERTICES: readonly Vec2[] = [
  { x: 7.42087, y: -13.83331 },
  { x: -18.91278, y: 6.5625 },
  { x: -19.24582, y: 30.83331 },
  { x: 13.74971, y: 7.0 },
  { x: 7.58722, y: -4.25 },
];
// Pyramid power: two long sloped edges on the bucket, solid only while the power runs.
export const PYRAMID_X = 112;
export const PYRAMID_Y = -12;
/** Left slope outline; the right slope is its mirror image. */
export const PYRAMID_VERTICES: readonly Vec2[] = [
  { x: 25, y: 4.33334 },
  { x: 45.33334, y: -14 },
  { x: -72.99998, y: 1.66669 },
  { x: -72.66664, y: 5 },
];
// Fireball cover: a curved brick over the bucket, solid only while covered.
export const COVER_Y = -20.33331;
export const COVER_INNER_RADIUS = 230;
export const COVER_WIDTH = 15;
export const COVER_SECTOR = PI / 6;
export const COVER_POINTS = 7;
export const COVER_ROTATION = PI / 2;

// Flippers (original `_base`): polygons on a rotateBackAndForth mover whose clock the player
// drives. Rest is mover phase 0.75; holding the button runs the clock up to FLIPPER_SWING_TICKS.
export const FLIPPER_PERIOD = 30;
export const FLIPPER_PHASE = 0.75;
export const FLIPPER_MAX_ANGLE = 0.5236;
export const FLIPPER_SWING_TICKS = 15;
export const FLIPPER_MAX_BOUNCE_VELOCITY = 7;
/** Left pivot: x from the left wall, y from the board's bottom edge. */
export const FLIPPER_LEFT_PIVOT: Vec2 = { x: 2.5, y: -68 };
/** Right pivot: x from the right wall (leftward), y from the board's bottom edge. */
export const FLIPPER_RIGHT_PIVOT: Vec2 = { x: 3, y: -66.75 };
export const FLIPPER_LEFT_VERTICES: readonly Vec2[] = [
  { x: -19.35429, y: 7.27786 },
  { x: -4.57743, y: 26.987 },
  { x: 50.91231, y: 30.64618 },
  { x: 65.92085, y: 27.68921 },
  { x: 87.4222, y: 27.25085 },
  { x: 86.30238, y: 10.91425 },
  { x: 69.66734, y: -0.13353 },
  { x: 49.02944, y: -10.19278 },
  { x: 27.71723, y: -17.58725 },
  { x: 8.72495, y: -20.30838 },
  { x: -2.60355, y: -22.00757 },
  { x: -13.95405, y: -16.0401 },
];
export const FLIPPER_RIGHT_VERTICES: readonly Vec2[] = [
  { x: 22.82959, y: -1.31549 },
  { x: 11.42896, y: -24.7829 },
  { x: -5.56573, y: -22.90079 },
  { x: -36.88165, y: -16.81094 },
  { x: -64.84814, y: -5.064 },
  { x: -84.80304, y: 10.65994 },
  { x: -84.93011, y: 24.49365 },
  { x: -64.43018, y: 24.43488 },
  { x: -50.41876, y: 28.39471 },
  { x: 8.06665, y: 23.22693 },
];

// Fever buckets (original `_base`): five catch boxes separated by six round dividers, all below
// the board's bottom edge, at the original board's x positions. They rise on a VerticalCycle
// mover when Fever starts. On a wider board every x position, box width and divider radius
// scales by width / ORIGINAL_BOARD_WIDTH, so each bucket keeps its odds; the dividers' tops stay
// at the original height. y values are measured from the board's bottom edge.
export const FEVER_HOLE_X: readonly number[] = [65, 197, 325, 452, 578];
export const FEVER_HOLE_WIDTH = 80;
export const FEVER_HOLE_Y = 32;
export const FEVER_HOLE_HEIGHT = 18;
export const FEVER_DIVIDER_X: readonly number[] = [0, 133, 262, 386.5, 512, 646.5];
export const FEVER_DIVIDER_Y: readonly number[] = [31, 31, 31, 31, 31, 28.5];
export const FEVER_DIVIDER_RADIUS = 37;
export const FEVER_RISE_PERIOD = 20;
export const FEVER_RISE_RADIUS = 30;
export const FEVER_RISE_PHASE = 0.75;
export const FEVER_RISE_TICKS = 5;

/** Broadphase cell size. */
export const GRID_CELL = 32;
