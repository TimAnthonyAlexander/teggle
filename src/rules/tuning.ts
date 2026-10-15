// Every rules constant in one place. Values from the spec (sections 3 to 6 and 10) or the
// decompiled code (docs/research/original-tech.md 4.4, 4.5, 4.9) are marked with their source;
// everything else is a Teggle choice recorded in spec section 14.2.

import { PI } from '../core/dmath';

/** Orange pegs per level unless a challenge sets more (spec 3; research 4.9). */
export const DEFAULT_ORANGE_COUNT = 25;
/** Balls at the start of a level (spec 4; research 4.9). */
export const DEFAULT_BALLS = 10;
export const GREEN_COUNT = 2;
/** Campaign levels (1-based, in play order) from which green and purple pegs appear (spec 8). */
export const FIRST_GREEN_LEVEL = 3;
export const FIRST_PURPLE_LEVEL = 4;

// Peg values (spec 5).
export const BLUE_VALUE = 10;
export const ORANGE_VALUE = 100;
export const GREEN_VALUE = 10;
export const PURPLE_VALUE = 500;
/** Fever: every blue or green peg is worth this much, purple FEVER_PURPLE_VALUE (spec 6). */
export const FEVER_PEG_VALUE = 1000;
export const FEVER_PURPLE_VALUE = 10000;

/** The fever meter has one segment per orange peg of a 25-orange level (spec 3, visual guide 7.2). */
export const METER_SEGMENTS = 25;

/** Free ball thresholds on the shot score, style points excluded (spec 4; research 4.9). */
export const FREE_BALL_THRESHOLDS: readonly number[] = [25000, 75000, 125000];

// Level-end bonuses (spec 5 and 6).
export const UNUSED_BALL_POINTS = 10000;
/** Fever buckets, left to right. */
export const FEVER_BUCKET_POINTS: readonly number[] = [10000, 50000, 100000, 50000, 10000];
export const FULL_CLEAR_BUCKET_POINTS = 100000;
/** Campaign clear bonus by try: first, second, third; later tries get nothing. */
export const CLEAR_BONUS_BY_TRY: readonly number[] = [100000, 50000, 25000];

// Stuck ball (spec 10; research 4.4). The decompiled LogicMgr names KILLBALL_TIME3 = 500 and
// KILLBALL_TIME1 = 1500 ticks; Teggle uses them as the two stages of CheckBallStop.
/** Stuck counter at which the lit peg the ball touched most recently is removed. */
export const STUCK_REMOVE_TICKS = 500;
/** Stuck counter at which a ball that touches no lit peg leaves play. */
export const STUCK_KILL_TICKS = 1500;
/** A lit peg counts as touching the stuck ball if the ball contacted it this recently. */
export const STUCK_CONTACT_TICKS = 100;
/**
 * Safety net for balls caught in a loop that never stalls (between two bumpers, say): after
 * this many ticks every ball still in play is removed. Long enough for any flipper rally.
 */
export const SHOT_TICK_LIMIT = 30000;

// Style shot detection (spec 5 and 14.2).
/** Long Shot and Super Long Shot: straight-line distance as a fraction of the board width. */
export const LONG_SHOT_FRACTION = 1 / 3;
export const SUPER_LONG_SHOT_FRACTION = 2 / 3;
/** Lucky Bounce: rise after a bucket contact as a fraction of the board height. */
export const LUCKY_BOUNCE_FRACTION = 1 / 4;
/** Long Slide: distinct pegs and bricks in one unbroken run of slide contacts. */
export const LONG_SLIDE_PEGS = 12;
/** A slide run ends after this many ticks without a slide contact. */
export const SLIDE_GAP_TICKS = 25;
export const BUCKET_STREAK_SHOTS = 5;
export const BIG_BUCKET_STREAK_SHOTS = 10;
/**
 * Flipper Rally: pegs and bricks lit in one shot by balls that had touched a flipper before
 * ("using the Flippers to hit lots of pegs", the original's tip).
 */
export const FLIPPER_RALLY_PEGS = 10;

/**
 * Aim guide length in simulation ticks: 40 normally (research 4.5). 40 ticks from the barrel tip
 * cover about 200 px straight down, the length measured on screen (visual guide 5.3).
 */
export const AIM_GUIDE_TICKS = 40;

// Powers (spec 7 and 14.2). Durations count shots; "now" includes the shot that granted it.
/** Guide: the next 3 shots, aim guide 80 ticks long through the first bounce (research 4.5). */
export const GUIDE_SHOTS = 3;
export const GUIDE_AIM_TICKS = 80;
/** Pyramid: 5 shots starting now. */
export const PYRAMID_SHOTS = 5;
/**
 * The Pyramid takes this much off the bucket's travel, so the wider bucket stays near the board
 * (the original sets 200 instead of 260 for one of its two bucket states, research 4.6).
 */
export const PYRAMID_TRAVEL_CUT = 60;
/** Flippers: 3 shots starting now. */
export const FLIPPER_SHOTS = 3;
/**
 * While the flippers are up the bucket's center stays this far from either wall: the original
 * narrows its travel to 130 on the 650 board (research 4.6), 195 from each wall.
 */
export const FLIPPER_TRAVEL_INSET = 195;
/** Multiball: the new ball leaves the green peg's side toward the board's other half. */
export const MULTIBALL_SPEED_X = 3;
export const MULTIBALL_SPEED_UP = 2;
/** Gap between the green peg and the new ball as it appears, px. */
export const MULTIBALL_GAP = 1;
/** Space Blast lights every peg and brick whose position is this close to the green peg's. */
export const SPACE_BLAST_RADIUS = 80;
/** Flower Power lights the nearest 1 / FLOWER_POWER_SHARE of the orange pegs left, rounded up. */
export const FLOWER_POWER_SHARE = 5;
/** Lucky Spin: Triple Score covers this shot and the next; Big Ball the next two. */
export const LUCKY_SPIN_SHOTS = 2;
export const TRIPLE_SCORE_FACTOR = 3;
/** Big Ball's radius (the plain ball's is 6, the Fireball's 10). */
export const BIG_BALL_RADIUS = 9;
/** Fireball and Zen Ball: the next shot. */
export const FIREBALL_SHOTS = 1;
export const ZEN_SHOTS = 1;
/**
 * Zen Ball's search: the player's shot and the angles ZEN_STEP apart up to ZEN_STEPS steps either
 * side of it (inside the cannon's range), each played out on a copy of the attempt for at most
 * ZEN_TICK_LIMIT ticks. A candidate's value is its score gain (style points included) plus these
 * weights for orange pegs lit, free balls won (not the coin flip) and a win.
 */
export const ZEN_STEP = (0.1 * PI) / 180;
export const ZEN_STEPS = 40;
export const ZEN_TICK_LIMIT = 3000;
export const ZEN_ORANGE_WEIGHT = 10000;
export const ZEN_BALL_WEIGHT = 25000;
export const ZEN_WIN_WEIGHT = 1000000;
