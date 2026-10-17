import { describe, expect, it } from 'vitest';
import { challengeById, type ChallengeDef } from '../../src/rules/challenges';
import {
  CARRY_MAX,
  chainOutcome,
  equalPassScore,
  originalNumbers,
  passes,
  teggleNumbers,
  type ChainOutcome,
  type LevelRun,
  type Numbers,
} from './chains';

function def(id: string): ChallengeDef {
  const c = challengeById(id);
  if (c === null) throw new Error(`no challenge ${id}`);
  return c;
}

const plain: Numbers = { orange: 20, score: null, balls: null, fullClear: false };
const won = (score: number, ballsLeft = 0, fullClear = false): LevelRun => ({
  won: true,
  fullClear,
  score,
  ballsLeft,
});
const lost: LevelRun = { won: false, fullClear: false, score: 40_000, ballsLeft: 0 };

describe('challenge numbers', () => {
  it("knows the original's numbers", () => {
    expect(originalNumbers(def('orange-1.3')).orange).toBe(35);
    expect(originalNumbers(def('orange-3.5')).orange).toBe(55);
    expect(originalNumbers(def('cup-2.1')).score).toBe(350_000);
    expect(originalNumbers(def('totals.5')).score).toBe(1_000_000);
    expect(originalNumbers(def('insane.2')).balls).toBe(1);
    expect(originalNumbers(def('clear-2.4'))).toEqual({
      orange: 25,
      score: null,
      balls: null,
      fullClear: true,
    });
  });

  it("reads Teggle's from the definitions", () => {
    expect(teggleNumbers(def('orange-2.1')).orange).toBe(def('orange-2.1').orange);
    expect(teggleNumbers(def('runs.1')).orange).toBe(20);
  });
});

describe('a chain of level runs', () => {
  it('passes when every level is won and the total beats the score', () => {
    const runs: Record<string, LevelRun> = { a: won(300_000), b: won(450_000), c: won(260_000) };
    const o = chainOutcome(['a', 'b', 'c'], plain, false, (s) => runs[s]);
    expect(o).toEqual({ complete: true, total: 1_010_000, clamped: false });
    expect(passes(o, { ...plain, score: 1_000_000 })).toBe(true);
    expect(passes(o, { ...plain, score: 1_010_000 })).toBe(false);
  });

  it('stops at the first lost level, or at a win that leaves pegs where every peg must go', () => {
    expect(
      chainOutcome(['a', 'b'], plain, false, (s) => (s === 'a' ? won(1) : lost)).complete,
    ).toBe(false);
    const clear = { ...plain, fullClear: true };
    expect(chainOutcome(['a'], clear, false, () => won(5)).complete).toBe(false);
    expect(chainOutcome(['a'], clear, false, () => won(5, 0, true)).complete).toBe(true);
  });

  it('plays the next level with the balls the last one left when the stock carries', () => {
    const asked: [string, number][] = [];
    const runOf = (slot: string, balls: number): LevelRun => {
      asked.push([slot, balls]);
      return slot === 'a' ? won(1, 3) : slot === 'b' ? won(1, 20) : won(1, 0);
    };
    const o = chainOutcome(['a', 'b', 'c'], { ...plain, balls: 10 }, true, runOf);
    expect(asked).toEqual([
      ['a', 10],
      ['b', 3],
      ['c', CARRY_MAX],
    ]);
    expect(o).toEqual({ complete: true, total: 3, clamped: true });
    // Without a carried stock every level starts with 10.
    asked.length = 0;
    chainOutcome(['a', 'b'], plain, false, runOf);
    expect(asked).toEqual([
      ['a', 10],
      ['b', 10],
    ]);
    // A stock that runs out ends the chain.
    expect(chainOutcome(['c', 'a'], { ...plain, balls: 10 }, true, runOf).complete).toBe(false);
  });
});

describe('the equal-pass score', () => {
  const chains = (totals: readonly (number | null)[]): ChainOutcome[] =>
    totals.map((t) => ({ complete: t !== null, total: t ?? 0, clamped: false }));

  it('lies between the k-th and the next best complete chain', () => {
    const o = chains([500_000, 200_000, null, 400_000, 300_000, null, 100_000, null, null, null]);
    // 20% of 10 chains: the 2nd and 3rd best are 400,000 and 300,000.
    expect(equalPassScore(o, 0.2)).toBe(350_000);
    expect(equalPassScore(o, 0.04)).toBeNull();
    expect(equalPassScore(o, 0.6)).toBeNull();
  });
});
