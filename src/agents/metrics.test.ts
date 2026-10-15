import { describe, expect, it } from 'vitest';
import { levelMetrics, quantile, spread, wilson } from './metrics';
import type { RunResult } from './run';

function run(over: Partial<RunResult> & { run: number }): RunResult {
  return {
    seed: over.run,
    power: null,
    won: false,
    fullClear: false,
    capped: false,
    shots: 10,
    ballsLeft: 0,
    score: 1000,
    orangeStart: 25,
    orangeLeft: 5,
    freeBalls: { bucket: 0, threshold: 0, coinFlip: 0, power: 0 },
    coinFlips: 0,
    stuck: 0,
    feverBucket: -1,
    greens: 0,
    styleShots: 0,
    firstOrangeShot: 1,
    orangePerShot: [],
    litFlagged: [],
    ticks: 100,
    searchTicks: 1000,
    ...over,
  };
}

describe('wilson', () => {
  it('matches the closed form at known points', () => {
    const zero = wilson(0, 10);
    expect(zero.low).toBe(0);
    // With no successes the upper end is z^2 / (n + z^2).
    expect(zero.high).toBeCloseTo(3.841459 / 13.841459, 6);
    const half = wilson(5, 10);
    expect(half.low).toBeCloseTo(0.2366, 4);
    expect(half.high).toBeCloseTo(0.7634, 4);
    const all = wilson(10, 10);
    expect(all.high).toBeCloseTo(1, 12);
    expect(all.low).toBeCloseTo(1 - zero.high, 10);
  });

  it('narrows with more runs and covers nothing without runs', () => {
    const a = wilson(20, 100);
    const b = wilson(200, 1000);
    expect(b.high - b.low).toBeLessThan(a.high - a.low);
    expect(wilson(0, 0)).toEqual({ low: 0, high: 1 });
  });
});

describe('quantile and spread', () => {
  it('interpolate between sorted values', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([1, 2, 3, 4], 0.1)).toBeCloseTo(1.3, 10);
    expect(quantile([7], 0.9)).toBe(7);
    expect(quantile([], 0.5)).toBeNaN();
  });

  it('summarize unsorted values and nothing as null', () => {
    const s = spread([4, 1, 3, 2]);
    expect(s?.mean).toBe(2.5);
    expect(s?.median).toBe(2.5);
    expect(s?.p10).toBeCloseTo(1.3, 12);
    expect(s?.p90).toBeCloseTo(3.7, 12);
    expect(spread([])).toBeNull();
  });
});

describe('levelMetrics', () => {
  const runs: RunResult[] = [
    run({
      run: 0,
      won: true,
      shots: 8,
      orangeLeft: 0,
      score: 300000,
      feverBucket: 2,
      fullClear: true,
      orangePerShot: [5, 5, 0, 5, 5, 0, 5, 0],
      litFlagged: [1, 2, 3],
      freeBalls: { bucket: 2, threshold: 1, coinFlip: 0, power: 0 },
    }),
    run({
      run: 1,
      won: true,
      shots: 12,
      orangeLeft: 0,
      score: 200000,
      feverBucket: 0,
      orangePerShot: [3, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      litFlagged: [2, 4],
      stuck: 2,
    }),
    run({
      run: 2,
      shots: 10,
      orangeLeft: 5,
      score: 50000,
      orangePerShot: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
      litFlagged: [1],
      freeBalls: { bucket: 1, threshold: 0, coinFlip: 1, power: 1 },
      firstOrangeShot: 1,
    }),
    run({
      run: 3,
      shots: 10,
      orangeLeft: 25,
      score: 9000,
      orangePerShot: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      firstOrangeShot: 0,
    }),
  ];
  const flagged = [1, 2, 3, 4, 5];
  const m = levelMetrics(runs, flagged);

  it('counts clears with their interval and the balls they used', () => {
    expect(m.runs).toBe(4);
    expect(m.wins).toBe(2);
    expect(m.clearRate).toBe(0.5);
    expect(m.clearCi).toEqual(wilson(2, 4));
    expect(m.ballsUsed?.median).toBe(10);
    expect(m.ballsUsedHistogram).toEqual({ '8': 1, '12': 1 });
  });

  it('averages free balls by kind and stuck removals per run', () => {
    expect(m.freeBalls).toEqual({
      bucket: 0.75,
      threshold: 0.25,
      coinFlip: 0.25,
      power: 0.25,
      total: 1.5,
    });
    expect(m.stuckPerRun).toBe(0.5);
    expect(m.stuckRunShare).toBe(0.25);
  });

  it('merges coverage over the runs', () => {
    expect(m.coverage).toEqual({ flagged: 5, hit: 4, share: 0.8, neverHit: [5] });
  });

  it('reads Fever, full clears, failures and dead shots', () => {
    expect(m.feverBuckets).toEqual([1, 0, 1, 0, 0]);
    expect(m.feverCenterShare).toBe(0.5);
    expect(m.fullClearRate).toBe(0.25);
    expect(m.orangeLeftOnFailure?.mean).toBe(15);
    expect(m.firstOrangeShot).toBe(1);
    // 3 dead shots in run 0, none in runs 1 and 2, 10 in run 3, of 40 shots.
    expect(m.deadShotShare).toBe(13 / 40);
  });

  it('follows the orange count shot by shot, holding finished runs at their end', () => {
    expect(m.orangeLeftByShot).toHaveLength(12);
    expect(m.orangeLeftByShot[0]).toBeCloseTo((20 + 22 + 23 + 25) / 4, 10);
    expect(m.orangeLeftByShot[11]).toBeCloseTo((0 + 0 + 5 + 25) / 4, 10);
  });

  it('does not depend on the order the runs arrive in', () => {
    expect(levelMetrics([...runs].reverse(), flagged)).toEqual(m);
  });
});
