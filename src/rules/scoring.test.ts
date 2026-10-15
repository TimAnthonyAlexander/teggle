import { describe, expect, it } from 'vitest';
import {
  clearBonus,
  feverBucketPoints,
  meterLevel,
  meterLevelSteps,
  meterSegments,
  meterSteps,
  multiplierFor,
  orangeRushTarget,
  pegValue,
  shotScore,
  thresholdsReached,
} from './scoring';

/** Orange hits at which the multiplier changes on a level with `count` orange pegs. */
function stepHits(count: number): number[] {
  const steps = [];
  for (let hit = 1; hit < count; hit++) {
    if (multiplierFor(count - hit, count) !== multiplierFor(count - hit + 1, count))
      steps.push(hit);
  }
  return steps;
}

describe('fever meter', () => {
  it('steps the multiplier by orange pegs left: 16+ x1, 11-15 x2, 7-10 x3, 4-6 x5, 1-3 x10', () => {
    const table: [number, number][] = [];
    for (let left = 25; left >= 1; left--) table.push([left, multiplierFor(left, 25)]);
    const expected = (left: number): number =>
      left >= 16 ? 1 : left >= 11 ? 2 : left >= 7 ? 3 : left >= 4 ? 5 : 10;
    expect(table).toEqual(table.map(([left]) => [left, expected(left)]));
    // The steps fall at the 10th, 15th, 19th and 22nd orange hit (spec 11).
    expect(stepHits(25)).toEqual([10, 15, 19, 22]);
    expect(meterLevelSteps(25)).toEqual([
      [10, 2],
      [15, 3],
      [19, 5],
      [22, 10],
    ]);
  });

  it('scales the steps and the segments to a level with fewer orange pegs', () => {
    // 20 orange: the bounds 15, 10, 6, 3 scale to 12, 8, 4.8 and 2.4 left, rounded up.
    expect(meterSegments(20)).toBe(20);
    expect(meterSteps(20)).toEqual([
      [12, 2],
      [8, 3],
      [5, 5],
      [3, 10],
    ]);
    expect(stepHits(20)).toEqual([8, 12, 15, 17]);
    expect(meterLevelSteps(20).map(([at]) => at)).toEqual([8, 12, 15, 17]);
    expect(meterLevel(20, 20)).toBe(0);
    expect(meterLevel(0, 20)).toBe(20);
    expect(pegValue('orange', 20, 20, false)).toBe(100);
    expect(pegValue('orange', 3, 20, false)).toBe(1000);
  });

  it('keeps the last orange peg at x10 however few orange pegs a level has', () => {
    for (let count = 1; count <= 25; count++) expect(multiplierFor(1, count)).toBe(10);
  });

  it('stays frozen while more than 25 orange pegs remain', () => {
    for (const left of [55, 45, 35, 26, 25]) {
      expect(multiplierFor(left, 55)).toBe(1);
      expect(meterLevel(left, 55)).toBe(0);
    }
    expect(meterSegments(55)).toBe(25);
    expect(meterLevel(24, 55)).toBe(1);
    expect(meterLevel(0, 55)).toBe(25);
  });

  it('values every peg type by the table in spec 5', () => {
    const rows: [number, number, number, number][] = [
      [25, 10, 100, 500],
      [15, 20, 200, 1000],
      [10, 30, 300, 1500],
      [6, 50, 500, 2500],
      [3, 100, 1000, 5000],
    ];
    for (const [left, blue, orange, purple] of rows) {
      expect(pegValue('blue', left, 25, false)).toBe(blue);
      expect(pegValue('green', left, 25, false)).toBe(blue);
      expect(pegValue('orange', left, 25, false)).toBe(orange);
      expect(pegValue('purple', left, 25, false)).toBe(purple);
    }
    expect(pegValue('blue', 0, 25, true)).toBe(1000);
    expect(pegValue('green', 0, 25, true)).toBe(1000);
    expect(pegValue('purple', 0, 25, true)).toBe(10000);
  });
});

describe('shot score', () => {
  it('multiplies the sum of the values by the number of pegs (patent example)', () => {
    // Nine pegs whose values add up to 850 give 7,650.
    expect(shotScore(850, 9)).toBe(7650);
    expect(shotScore(0, 0)).toBe(0);
  });

  it('counts the free ball thresholds reached', () => {
    expect(thresholdsReached(24999)).toBe(0);
    expect(thresholdsReached(25000)).toBe(1);
    expect(thresholdsReached(74999)).toBe(1);
    expect(thresholdsReached(75000)).toBe(2);
    expect(thresholdsReached(125000)).toBe(3);
    expect(thresholdsReached(1e9)).toBe(3);
  });

  it('sets the Orange Rush target by orange pegs left before the shot', () => {
    const expected: [number, number | null][] = [
      [55, 10],
      [25, 10],
      [21, 10],
      [20, 9],
      [16, 9],
      [15, 8],
      [10, 8],
      [9, 7],
      [8, 6],
      [7, 5],
      [6, 5],
      [5, 4],
      [4, null],
      [1, null],
    ];
    expect(expected.map(([left]) => [left, orangeRushTarget(left, 55)])).toEqual(expected);
    expect(expected.map(([left]) => [left, orangeRushTarget(left, 25)])).toEqual(expected);
  });

  it('scales the Orange Rush target to a level with fewer orange pegs', () => {
    // 20 orange: 20 left reads the 25 row (10) and needs 8; 16 left reads 20 (9) and needs 7.
    expect(orangeRushTarget(20, 20)).toBe(8);
    expect(orangeRushTarget(16, 20)).toBe(7);
    expect(orangeRushTarget(8, 20)).toBe(6);
    expect(orangeRushTarget(4, 20)).toBe(3);
    expect(orangeRushTarget(3, 20)).toBeNull();
  });
});

describe('level-end bonuses', () => {
  it('pays the Fever buckets, all 100,000 on a full clear', () => {
    expect([0, 1, 2, 3, 4].map((b) => feverBucketPoints(b, false))).toEqual([
      10000, 50000, 100000, 50000, 10000,
    ]);
    expect([0, 1, 2, 3, 4].map((b) => feverBucketPoints(b, true))).toEqual([
      100000, 100000, 100000, 100000, 100000,
    ]);
  });

  it('pays the campaign clear bonus by try', () => {
    expect([1, 2, 3, 4, 9].map(clearBonus)).toEqual([100000, 50000, 25000, 0, 0]);
    expect(clearBonus(null)).toBe(0);
  });
});
