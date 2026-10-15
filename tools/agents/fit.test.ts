import { describe, expect, it } from 'vitest';
import { bestFit, fitOf, type PlayedLevel } from './fit';

const played: PlayedLevel[] = [
  { id: '1-1', tries: 4, wins: 2 },
  { id: '1-2', tries: 10, wins: 1 },
];

describe('fitOf', () => {
  it('scores the binomial likelihood and the absolute errors', () => {
    const f = fitOf(0.03, played, [0.5, 0.1], 100);
    expect(f.logLikelihood).toBeCloseTo(4 * Math.log(0.5) + Math.log(0.1) + 9 * Math.log(0.9), 10);
    expect(f.mae).toBe(0);
    expect(f.weightedMae).toBe(0);
    const g = fitOf(0.03, played, [0.25, 0.3], 100);
    expect(g.mae).toBeCloseTo((0.25 + 0.2) / 2, 10);
    expect(g.weightedMae).toBeCloseTo((4 * 0.25 + 10 * 0.2) / 14, 10);
    expect(g.logLikelihood).toBeLessThan(f.logLikelihood);
  });

  it('keeps agent rates of 0 and 1 finite', () => {
    const f = fitOf(0, played, [0, 1], 50);
    expect(Number.isFinite(f.logLikelihood)).toBe(true);
  });
});

describe('bestFit', () => {
  it('picks the most likely aim error', () => {
    const fits = [0.6, 0.5, 0.2].map((r, i) => fitOf(i / 100, played, [r, 0.1], 100));
    expect(bestFit(fits)?.noise).toBe(0.01);
    expect(bestFit([])).toBeUndefined();
  });
});
