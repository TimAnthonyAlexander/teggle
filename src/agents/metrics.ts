// Metrics per level and agent (spec 13.5), aggregated from the runs in run order, so the numbers
// do not depend on which worker played which run. Plain data, written to the report's JSON.

import type { FreeBallCounts, RunResult } from './run';
import { Z95 } from './tuning';

export interface Interval {
  readonly low: number;
  readonly high: number;
}

export interface Spread {
  readonly mean: number;
  readonly p10: number;
  readonly median: number;
  readonly p90: number;
}

export interface LevelMetrics {
  readonly runs: number;
  readonly wins: number;
  /** Share of runs that cleared every orange peg. */
  readonly clearRate: number;
  /** Wilson score interval, 95%. */
  readonly clearCi: Interval;
  /** Balls used (shots) in the cleared runs, and how many cleared runs used each count. */
  readonly ballsUsed: Spread | null;
  readonly ballsUsedHistogram: Readonly<Record<string, number>>;
  /** Mean free balls per run, by kind and in all. */
  readonly freeBalls: FreeBallCounts & { readonly total: number };
  /** Can-be-orange pegs and bricks lit at least once over all runs. */
  readonly coverage: {
    readonly flagged: number;
    readonly hit: number;
    readonly share: number;
    readonly neverHit: readonly number[];
  };
  /** Stuck-ball removals per run, and the share of runs with at least one. */
  readonly stuckPerRun: number;
  readonly stuckRunShare: number;
  readonly score: Spread;
  readonly winScore: Spread | null;
  /** Runs whose first Fever ball landed in each Fever bucket, left to right. */
  readonly feverBuckets: readonly number[];
  /** Share of the cleared runs whose first Fever ball found the center bucket. */
  readonly feverCenterShare: number;
  readonly fullClearRate: number;
  /** Orange pegs left when a run failed. */
  readonly orangeLeftOnFailure: Spread | null;
  /** Shot that first lit an orange peg, over the runs where one did. */
  readonly firstOrangeShot: number;
  /** Shots that lit no orange peg, as a share of all shots. */
  readonly deadShotShare: number;
  /** Mean orange pegs left after shot 1, 2, ...; a finished run keeps its last value. */
  readonly orangeLeftByShot: readonly number[];
  readonly shotsPerRun: number;
  readonly greensPerRun: number;
  readonly styleShotsPerRun: number;
  /** Runs stopped by the shot limit. */
  readonly capped: number;
  /** Simulated ticks per run: the real shots and the agent's trial shots. */
  readonly ticksPerRun: number;
  readonly searchTicksPerRun: number;
}

/** Wilson score interval for `wins` successes in `runs` trials (95% unless z says otherwise). */
export function wilson(wins: number, runs: number, z = Z95): Interval {
  if (runs <= 0) return { low: 0, high: 1 };
  const p = wins / runs;
  const z2 = z * z;
  const denom = 1 + z2 / runs;
  const center = (p + z2 / (2 * runs)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / runs + z2 / (4 * runs * runs))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/** Linear-interpolation quantile (q in [0, 1]) of values sorted ascending. */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  const a = sorted[lo] ?? Number.NaN;
  const b = sorted[hi] ?? Number.NaN;
  return a + (b - a) * (pos - lo);
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return Number.NaN;
  let sum = 0;
  for (const v of values) sum += v;
  return sum / values.length;
}

/** Mean, 10th percentile, median and 90th percentile, or null for no values. */
export function spread(values: readonly number[]): Spread | null {
  if (values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  return {
    mean: mean(values),
    p10: quantile(sorted, 0.1),
    median: quantile(sorted, 0.5),
    p90: quantile(sorted, 0.9),
  };
}

const EMPTY_SPREAD: Spread = { mean: 0, p10: 0, median: 0, p90: 0 };

/**
 * Aggregates the runs of one level and agent. `flagged` lists the level's can-be-orange element
 * ids. The runs may come in any order; they are sorted by run index first.
 */
export function levelMetrics(
  input: readonly RunResult[],
  flagged: readonly number[],
): LevelMetrics {
  const runs = input.slice().sort((a, b) => a.run - b.run);
  const n = runs.length;
  const won = runs.filter((r) => r.won);
  const lost = runs.filter((r) => !r.won);

  const histogram: Record<string, number> = {};
  for (const r of won) histogram[String(r.shots)] = (histogram[String(r.shots)] ?? 0) + 1;

  const lit = new Set<number>();
  for (const r of runs) for (const id of r.litFlagged) lit.add(id);
  const neverHit = flagged.filter((id) => !lit.has(id));

  const feverBuckets = [0, 0, 0, 0, 0];
  for (const r of runs) {
    if (r.feverBucket >= 0 && r.feverBucket < feverBuckets.length) {
      feverBuckets[r.feverBucket] = (feverBuckets[r.feverBucket] ?? 0) + 1;
    }
  }

  const free = {
    bucket: mean(runs.map((r) => r.freeBalls.bucket)),
    threshold: mean(runs.map((r) => r.freeBalls.threshold)),
    coinFlip: mean(runs.map((r) => r.freeBalls.coinFlip)),
    power: mean(runs.map((r) => r.freeBalls.power)),
  };

  let shots = 0;
  let dead = 0;
  let longest = 0;
  for (const r of runs) {
    for (const lit of r.orangePerShot) if (lit === 0) dead++;
    shots += r.orangePerShot.length;
    longest = Math.max(longest, r.orangePerShot.length);
  }
  // Orange left after shot k + 1, averaged over all runs; a finished run keeps its last value.
  const byShot = new Array<number>(longest).fill(0);
  for (const r of runs) {
    let left = r.orangeStart;
    for (let k = 0; k < longest; k++) {
      left -= r.orangePerShot[k] ?? 0;
      byShot[k] = (byShot[k] ?? 0) + left / n;
    }
  }

  const firstOrange = runs.filter((r) => r.firstOrangeShot > 0).map((r) => r.firstOrangeShot);

  return {
    runs: n,
    wins: won.length,
    clearRate: n > 0 ? won.length / n : 0,
    clearCi: wilson(won.length, n),
    ballsUsed: spread(won.map((r) => r.shots)),
    ballsUsedHistogram: histogram,
    freeBalls: { ...free, total: free.bucket + free.threshold + free.coinFlip + free.power },
    coverage: {
      flagged: flagged.length,
      hit: flagged.length - neverHit.length,
      share: flagged.length > 0 ? (flagged.length - neverHit.length) / flagged.length : 1,
      neverHit,
    },
    stuckPerRun: mean(runs.map((r) => r.stuck)),
    stuckRunShare: n > 0 ? runs.filter((r) => r.stuck > 0).length / n : 0,
    score: spread(runs.map((r) => r.score)) ?? EMPTY_SPREAD,
    winScore: spread(won.map((r) => r.score)),
    feverBuckets,
    feverCenterShare: won.length > 0 ? (feverBuckets[2] ?? 0) / won.length : 0,
    fullClearRate: n > 0 ? runs.filter((r) => r.fullClear).length / n : 0,
    orangeLeftOnFailure: spread(lost.map((r) => r.orangeLeft)),
    firstOrangeShot: firstOrange.length > 0 ? mean(firstOrange) : Number.NaN,
    deadShotShare: shots > 0 ? dead / shots : 0,
    orangeLeftByShot: byShot,
    shotsPerRun: mean(runs.map((r) => r.shots)),
    greensPerRun: mean(runs.map((r) => r.greens)),
    styleShotsPerRun: mean(runs.map((r) => r.styleShots)),
    capped: runs.filter((r) => r.capped).length,
    ticksPerRun: mean(runs.map((r) => r.ticks + r.searchTicks)),
    searchTicksPerRun: mean(runs.map((r) => r.searchTicks)),
  };
}
