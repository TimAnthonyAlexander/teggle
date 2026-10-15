// Pure scoring functions (spec 5 and 6). The attempt applies them as pegs light.

import {
  BLUE_VALUE,
  CLEAR_BONUS_BY_TRY,
  FEVER_BUCKET_POINTS,
  FEVER_PEG_VALUE,
  FEVER_PURPLE_VALUE,
  FREE_BALL_THRESHOLDS,
  FULL_CLEAR_BUCKET_POINTS,
  GREEN_VALUE,
  METER_SEGMENTS,
  METER_STEPS,
  ORANGE_VALUE,
  PURPLE_VALUE,
} from './tuning';

export type PegColor = 'blue' | 'orange' | 'green' | 'purple';

export const PEG_COLORS: readonly PegColor[] = ['blue', 'orange', 'green', 'purple'];

export function baseValue(color: PegColor): number {
  switch (color) {
    case 'blue':
      return BLUE_VALUE;
    case 'orange':
      return ORANGE_VALUE;
    case 'green':
      return GREEN_VALUE;
    case 'purple':
      return PURPLE_VALUE;
  }
}

/** Fever meter segments for a level with `orangeCount` orange pegs: one per orange peg, 25 at most. */
export function meterSegments(orangeCount: number): number {
  return Math.min(orangeCount, METER_SEGMENTS);
}

/**
 * The multiplier steps for `orangeCount` orange pegs, as [orange left at or below which it
 * applies, multiplier]. With 25 or more orange the original's bounds (research 4.9): 16 or more
 * left x1, 11 to 15 x2, 7 to 10 x3, 4 to 6 x5, 1 to 3 x10, so a level with more than 25 orange
 * stays at x1 until 25 remain. With fewer, every bound scales by count / 25, rounded up, so the
 * last orange peg is always worth x10 (20 orange: 12, 8, 5 and 3 left).
 */
export function meterSteps(orangeCount: number): readonly (readonly [number, number])[] {
  const s = meterSegments(orangeCount);
  if (s === METER_SEGMENTS) return METER_STEPS;
  let steps = scaledSteps.get(s);
  if (steps === undefined) {
    steps = METER_STEPS.map(
      ([left, mult]) => [Math.ceil((left * s) / METER_SEGMENTS), mult] as const,
    );
    scaledSteps.set(s, steps);
  }
  return steps;
}

/** Scaled steps by segment count, built once each: pegValue runs for every peg that lights. */
const scaledSteps = new Map<number, readonly (readonly [number, number])[]>();

/** The steps as [lit meter segments at which it applies, multiplier], for drawing the meter. */
export function meterLevelSteps(orangeCount: number): (readonly [number, number])[] {
  const s = meterSegments(orangeCount);
  return meterSteps(orangeCount).map(([left, mult]) => [s - left, mult] as const);
}

/** Fever meter multiplier by orange pegs left. Fever (0 left) has fixed values: see pegValue. */
export function multiplierFor(orangeLeft: number, orangeCount: number): number {
  let m = 1;
  for (const [left, mult] of meterSteps(orangeCount)) if (orangeLeft <= left) m = mult;
  return m;
}

/** Lit fever meter segments (0 to meterSegments): frozen at 0 while more than 25 orange remain. */
export function meterLevel(orangeLeft: number, orangeCount: number): number {
  return Math.max(0, meterSegments(orangeCount) - orangeLeft);
}

/**
 * Value of a peg lighting now. `orangeLeft` is the count before this peg lit, so the peg that
 * steps the meter still scores at the old multiplier; pegs after it score at the new one.
 */
export function pegValue(
  color: PegColor,
  orangeLeft: number,
  orangeCount: number,
  fever: boolean,
): number {
  if (fever) return color === 'purple' ? FEVER_PURPLE_VALUE : FEVER_PEG_VALUE;
  return baseValue(color) * multiplierFor(orangeLeft, orangeCount);
}

/** Patent formula: the sum of the lit pegs' values times their number. */
export function shotScore(sum: number, count: number): number {
  return sum * count;
}

/** Free ball thresholds a shot score has reached (0 to 3). */
export function thresholdsReached(score: number): number {
  let n = 0;
  for (const t of FREE_BALL_THRESHOLDS) if (score >= t) n++;
  return n;
}

/** The spec 5 Orange Rush table for a 25-orange level; null below 5 left. */
function orangeRushTable(orangeLeft: number): number | null {
  if (orangeLeft >= 21) return 10;
  if (orangeLeft >= 16) return 9;
  if (orangeLeft >= 10) return 8;
  if (orangeLeft === 9) return 7;
  if (orangeLeft === 8) return 6;
  if (orangeLeft >= 6) return 5;
  if (orangeLeft === 5) return 4;
  return null;
}

/**
 * Orange Rush: orange pegs one shot must light, by orange left before the shot (spec 5). Null
 * when the table has no entry, so no Orange Rush is possible. With fewer than 25 orange pegs the
 * orange left scales up to the 25-orange table (rounded down) and the target scales back down
 * (rounded), so the shot must still light the same share of the level's orange pegs. A target
 * under 2 means none: one orange peg is no rush.
 */
export function orangeRushTarget(orangeLeft: number, orangeCount: number): number | null {
  const s = meterSegments(orangeCount);
  if (s === METER_SEGMENTS) return orangeRushTable(orangeLeft);
  const target = orangeRushTable(Math.floor((orangeLeft * METER_SEGMENTS) / s));
  if (target === null) return null;
  const scaled = Math.round((target * s) / METER_SEGMENTS);
  return scaled < 2 ? null : scaled;
}

/** Points of Fever bucket `bucket` (0 = leftmost); every bucket pays 100,000 on a full clear. */
export function feverBucketPoints(bucket: number, fullClear: boolean): number {
  if (fullClear) return FULL_CLEAR_BUCKET_POINTS;
  return FEVER_BUCKET_POINTS[bucket] ?? 0;
}

/** Campaign clear bonus for the 1-based try number; none outside the campaign (null). */
export function clearBonus(campaignTry: number | null): number {
  if (campaignTry === null) return 0;
  return CLEAR_BONUS_BY_TRY[campaignTry - 1] ?? 0;
}
