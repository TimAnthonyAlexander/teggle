// Every self-play constant in one place (spec 13.5). Values are Teggle choices recorded in spec
// section 14.2 ("Decided in the self-play agents").

import { MAX_AIM_ANGLE } from '../sim/tuning';

/** Agents aim anywhere in the cannon's range: up to 97 degrees either side of straight down. */
export const AIM_LIMIT = MAX_AIM_ANGLE;

/**
 * Greedy search: launch angles tried per shot. They are spread evenly over the aim range with
 * one random offset per shot (stratified), so over many shots every angle gets tried.
 */
export const SEARCH_ANGLES = 40;
/** A searched shot is played out for at most this many ticks, as Zen Ball's search is. */
export const SEARCH_TICK_LIMIT = 3000;

/** Aim error (standard deviation of a normal error, radians) of the reference bands. */
export const REFERENCE_NOISE = 0.03;

/**
 * Flipper policy: the button is held while any ball in play falls (vy > 0) within
 * FLIPPER_ZONE_X px of either side wall and FLIPPER_ZONE_HEIGHT px of the board's bottom edge,
 * and released otherwise. The flippers' pivots sit 2.5 and 3 px from the walls, 68 px above the
 * bottom edge, and they reach about 87 px into the board.
 */
export const FLIPPER_ZONE_X = 100;
export const FLIPPER_ZONE_HEIGHT = 120;

/**
 * Safety net: an attempt that is still going after this many shots stops and counts as not
 * cleared. Free balls make every attempt finite with probability 1, but not bounded.
 */
export const MAX_RUN_SHOTS = 300;

/** Runs per level and agent when the report is not told otherwise. */
export const DEFAULT_RUNS = 100;

/** Two-sided 95% quantile of the standard normal, for the Wilson score interval. */
export const Z95 = 1.959963984540054;
