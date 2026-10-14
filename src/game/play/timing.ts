// Presentation timing for the play screen: the peg pop cadence, the shot tally text, the Fever
// slow motion window and ramp, and the Fever zoom curve. Pure functions of their inputs so they
// can be tested; the values come from the decompiled code (research 4.4, 4.7), the visual guide
// (9.2, 12.5) or are Teggle choices recorded in spec 14.2.

import { TICKS_PER_SECOND } from '../../sim/tuning';
import { ease } from '../ui/motion';
import { formatNumber } from '../ui/text';

/** Real milliseconds per simulation tick at normal speed. */
export const TICK_MS = 1000 / TICKS_PER_SECOND;

// ---------------------------------------------------------------------------------------------
// Shot end: pops and tally (spec 11, guide 4.4 and 9.2)

/**
 * Ticks until the next lit peg pops, with `remaining` lit pegs still on the board:
 * clamp(8 - remaining / 10, 1, 5) with integer division (research 4.4). Nine pegs go 5 ticks
 * apart, fifty-odd 3 apart, seventy and more one per tick.
 */
export function popGapTicks(remaining: number): number {
  return Math.max(1, Math.min(5, 8 - Math.floor(Math.max(0, remaining) / 10)));
}

/** Tick offsets, from the first pop, at which `count` lit pegs pop. */
export function popOffsets(count: number): number[] {
  const out: number[] = [];
  let t = 0;
  for (let i = 0; i < count; i++) {
    out.push(t);
    t += popGapTicks(count - i - 1);
  }
  return out;
}

/** The tally's first line fades in over this long after the ball leaves play (guide 9.2). */
export const TALLY_FADE_MS = 170;
/** Ticks from the end of the shot to the first pop: the tally line is half faded in by then. */
export const TALLY_LEAD_TICKS = 12;
/** Ticks the finished tally holds before the board moves on (purple peg, next ball). */
export const TALLY_HOLD_TICKS = 25;

/** "2,390 X PEGS" before the first pop, then "2,390 X 1 PEG", "2,390 X 2 PEGS", ... */
export function tallyLine1(sum: number, popped: number): string {
  if (popped <= 0) return `${formatNumber(sum)} X PEGS`;
  return `${formatNumber(sum)} X ${popped} ${popped === 1 ? 'PEG' : 'PEGS'}`;
}

/** The running product under line 1; none before the first pop. */
export function tallyLine2(sum: number, popped: number): string | null {
  return popped <= 0 ? null : formatNumber(sum * popped);
}

export function stylePointsLine(points: number): string {
  return `+${formatNumber(points)} STYLE POINTS`;
}

// ---------------------------------------------------------------------------------------------
// Low-ball warnings (spec 4, guide 7.5)

/** The warning to show when a ball is loaded with `balls` in stock, or 0 for none. */
export function lowBallWarning(balls: number, lastShown: number): number {
  return balls >= 1 && balls <= 3 && balls !== lastShown ? balls : 0;
}

// ---------------------------------------------------------------------------------------------
// Fever slow motion (spec 6, research 4.7)

/** Slow motion speed: the original's default of 250 per mille (research 4.7). */
export const SLOW_MOTION_SCALE = 0.25;
/**
 * Slow motion starts when the ball will light the last orange peg within this many ticks: about
 * a second of real time at 0.25x. Teggle's choice (spec 14.2); the video shows the zoom
 * starting about 0.8 s before the hit.
 */
export const SLOW_MOTION_LEAD_TICKS = 25;
/** After the hit, slow motion holds this long in real time before it ramps back (guide 12.5). */
export const SLOW_MOTION_HOLD_MS = 3000;
/** Speed gained per tick while ramping back to normal: 20 per mille (research 4.7). */
export const SLOW_MOTION_RAMP = 0.02;

/** True when a predicted hit `ticksToHit` ticks away should start slow motion. */
export function slowMotionDue(ticksToHit: number): boolean {
  return ticksToHit >= 0 && ticksToHit <= SLOW_MOTION_LEAD_TICKS;
}

/** The next tick's speed while ramping back from slow motion. */
export function rampSpeed(speed: number): number {
  return Math.min(1, speed + SLOW_MOTION_RAMP);
}

// ---------------------------------------------------------------------------------------------
// Fever zoom (guide 12.5 and 16.6)

/** Zoom while closing in on the last orange peg, reached over APPROACH_MS. */
export const ZOOM_APPROACH = 1.5;
/** Zoom after the hit, reached over HIT_ZOOM_MS. */
export const ZOOM_HIT = 2;
const APPROACH_MS = 550;
const HIT_ZOOM_MS = 500;
/** Zooming back out at the end of slow motion or on a click. */
export const ZOOM_OUT_MS = 260;

export interface ZoomTimes {
  /** Real time slow motion began. */
  readonly start: number;
  /** Real time the last orange peg lit, or null. */
  readonly hit: number | null;
  /** Real time the zoom started back out (hold over or a click), or null. */
  readonly end: number | null;
}

function approachZoom(t: number): number {
  return 1 + (ZOOM_APPROACH - 1) * ease.outCubic(Math.min(1, Math.max(0, t / APPROACH_MS)));
}

function heldZoom(now: number, z: ZoomTimes): number {
  const approach = approachZoom(now - z.start);
  if (z.hit === null || now < z.hit) return approach;
  const from = approachZoom(z.hit - z.start);
  const t = Math.min(1, (now - z.hit) / HIT_ZOOM_MS);
  return from + (ZOOM_HIT - from) * ease.inOutSine(t);
}

/** Camera zoom at real time `now` (1 = no zoom). */
export function feverZoom(now: number, z: ZoomTimes): number {
  if (now <= z.start) return 1;
  if (z.end === null || now < z.end) return heldZoom(now, z);
  if (now - z.end >= ZOOM_OUT_MS) return 1;
  const from = heldZoom(z.end, z);
  return from + (1 - from) * ease.inOutSine((now - z.end) / ZOOM_OUT_MS);
}

// ---------------------------------------------------------------------------------------------
// Fever finish (guide 12.5): from the moment the ball lands, in game milliseconds

export const FEVER_FINISH = {
  /** The rainbow arch starts drawing in from the right. */
  archStart: 1100,
  archDraw: 700,
  /** The Fever score counts up under the arch. */
  countStart: 2000,
  countMs: 1000,
  /** The bucket value joins the count. */
  bucketAt: 3300,
  bucketMs: 350,
  /** Unused balls convert, then the clear bonus. */
  ballsAt: 3900,
  bonusAt: 4500,
  /** The arch fades, then the number rises and fades. */
  fadeStart: 5300,
  fadeMs: 600,
  /** The level complete dialog drops in. */
  dialogAt: 6000,
} as const;
