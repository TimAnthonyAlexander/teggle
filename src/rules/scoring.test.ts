import { describe, expect, it } from 'vitest';
import {
  clearBonus,
  feverBucketPoints,
  meterLevel,
  multiplierFor,
  orangeRushTarget,
  pegValue,
  shotScore,
  thresholdsReached,
} from './scoring';

describe('fever meter', () => {
  it('steps the multiplier by orange pegs left: 16+ x1, 11-15 x2, 7-10 x3, 4-6 x5, 1-3 x10', () => {
    const table: [number, number][] = [];
    for (let left = 25; left >= 1; left--) table.push([left, multiplierFor(left)]);
    const expected = (left: number): number =>
      left >= 16 ? 1 : left >= 11 ? 2 : left >= 7 ? 3 : left >= 4 ? 5 : 10;
    expect(table).toEqual(table.map(([left]) => [left, expected(left)]));
    // The steps fall at the 10th, 15th, 19th and 22nd orange hit (spec 11).
    const steps = [];
    for (let hit = 1; hit <= 24; hit++) {
      if (multiplierFor(25 - hit) !== multiplierFor(26 - hit)) steps.push(hit);
    }
    expect(steps).toEqual([10, 15, 19, 22]);
  });

  it('stays frozen while more than 25 orange pegs remain', () => {
    for (const left of [55, 45, 35, 26, 25]) {
      expect(multiplierFor(left)).toBe(1);
      expect(meterLevel(left)).toBe(0);
    }
    expect(meterLevel(24)).toBe(1);
    expect(meterLevel(0)).toBe(25);
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
      expect(pegValue('blue', left, false)).toBe(blue);
      expect(pegValue('green', left, false)).toBe(blue);
      expect(pegValue('orange', left, false)).toBe(orange);
      expect(pegValue('purple', left, false)).toBe(purple);
    }
    expect(pegValue('blue', 0, true)).toBe(1000);
    expect(pegValue('green', 0, true)).toBe(1000);
    expect(pegValue('purple', 0, true)).toBe(10000);
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
    expect(expected.map(([left]) => [left, orangeRushTarget(left)])).toEqual(expected);
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
