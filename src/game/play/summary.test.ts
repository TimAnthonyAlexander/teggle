import { describe, expect, it } from 'vitest';
import { fixedColors, newAttempt, pegGrid, randomPlay } from '../../../tests/fixtures/rules';
import { ScoreLedger } from './summary';

function play(levelPegs: number, orange: number, balls: number, seed: number, campaignTry = 0) {
  const attempt = newAttempt(
    pegGrid(levelPegs, (id) => id <= orange),
    fixedColors(orange, { balls, campaignTry: campaignTry > 0 ? campaignTry : null }),
    seed,
  );
  const ledger = new ScoreLedger();
  for (const e of randomPlay(attempt, seed)) ledger.add(e);
  return { attempt, ledger };
}

describe('score breakdown', () => {
  it('adds up to the score of a lost attempt', () => {
    const { attempt, ledger } = play(60, 25, 3, 7);
    expect(attempt.result).toBe('lost');
    const b = ledger.breakdown(attempt);
    expect(b.result).toBe('lost');
    expect(b.total).toBe(attempt.score);
    expect(b.shots).toBe(attempt.shotsTaken);
    expect(b.feverPoints + b.unusedPoints + b.clearBonus).toBe(0);
    expect(b.cleared).toBeGreaterThanOrEqual(0);
    expect(b.cleared).toBeLessThan(100);
  });

  it('adds up to the score of a won attempt, Fever bucket and unused balls included', () => {
    let checked = 0;
    for (let seed = 1; seed <= 40 && checked < 3; seed++) {
      const { attempt, ledger } = play(40, 2, 30, seed, 1);
      if (attempt.result !== 'won') continue;
      checked++;
      const b = ledger.breakdown(attempt);
      expect(b.total).toBe(attempt.score);
      expect(b.unusedBalls).toBe(attempt.ballsLeft);
      expect(b.unusedPoints).toBe(attempt.ballsLeft * 10_000);
      expect(b.clearBonus).toBe(100_000);
      expect(b.clearTry).toBe(1);
      expect(b.feverPoints).toBeGreaterThanOrEqual(0);
      expect(b.shotPoints).toBeGreaterThan(0);
    }
    expect(checked).toBeGreaterThan(0);
  });
});
