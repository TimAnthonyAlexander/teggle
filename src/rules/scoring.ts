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

/**
 * Fever meter multiplier by orange pegs left (research 4.9): 16 or more x1, 11 to 15 x2, 7 to 10
 * x3, 4 to 6 x5, 1 to 3 x10. With more than 25 orange the meter stays at x1 until 25 remain,
 * which this table already gives. Fever (0 left) has fixed values instead: see pegValue.
 */
export function multiplierFor(orangeLeft: number): number {
  if (orangeLeft >= 16) return 1;
  if (orangeLeft >= 11) return 2;
  if (orangeLeft >= 7) return 3;
  if (orangeLeft >= 4) return 5;
  return 10;
}

/** Lit fever meter segments (0 to 25): frozen at 0 while more than 25 orange remain. */
export function meterLevel(orangeLeft: number): number {
  return Math.max(0, METER_SEGMENTS - orangeLeft);
}

/**
 * Value of a peg lighting now. `orangeLeft` is the count before this peg lit, so the peg that
 * steps the meter still scores at the old multiplier; pegs after it score at the new one.
 */
export function pegValue(color: PegColor, orangeLeft: number, fever: boolean): number {
  if (fever) return color === 'purple' ? FEVER_PURPLE_VALUE : FEVER_PEG_VALUE;
  return baseValue(color) * multiplierFor(orangeLeft);
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

/**
 * Orange Rush: orange pegs one shot must light, by orange left before the shot (spec 5).
 * Null when fewer than 5 remain: the table has no entry, so no Orange Rush is possible.
 */
export function orangeRushTarget(orangeLeft: number): number | null {
  if (orangeLeft >= 21) return 10;
  if (orangeLeft >= 16) return 9;
  if (orangeLeft >= 10) return 8;
  if (orangeLeft === 9) return 7;
  if (orangeLeft === 8) return 6;
  if (orangeLeft >= 6) return 5;
  if (orangeLeft === 5) return 4;
  return null;
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
