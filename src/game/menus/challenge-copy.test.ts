import { describe, expect, it } from 'vitest';
import { CHALLENGES, challengeById, type ChallengeDef } from '../../rules/challenges';
import { goalBand, goalSentence, listing, lockSentences } from './challenge-copy';

function def(id: string): ChallengeDef {
  const c = challengeById(id);
  if (c === null) throw new Error(`no challenge ${id}`);
  return c;
}

const name = (slot: string): string => (slot === '1-3' ? '1-3 The Sky Tree' : `level ${slot}`);

describe('challenge copy', () => {
  it('words every challenge, with no hole in the text', () => {
    for (const c of CHALLENGES) {
      for (const text of [goalBand(c), goalSentence(c, name)]) {
        expect(text.length).toBeGreaterThan(3);
        expect(text).not.toMatch(/undefined|NaN|null/);
      }
      expect(goalBand(c)).toBe(goalBand(c).toUpperCase());
    }
  });

  it('takes its numbers from the definitions', () => {
    expect(goalBand(def('orange-1.1'))).toBe(`${def('orange-1.1').orange ?? 0} ORANGE PEGS`);
    expect(goalSentence(def('orange-1.1'), name)).toBe(
      'Win 1-3 The Sky Tree with 26 orange pegs, six more than usual.',
    );
    expect(goalSentence(def('orange-3.2'), name)).toBe(
      'Win level 4-2 with 30 orange pegs, ten more than usual.',
    );
    expect(goalBand(def('cup-2.4'))).toBe('OVER 350,000');
    expect(goalBand(def('totals.5'))).toBe('THREE LEVELS, OVER 1,000,000');
    expect(goalSentence(def('totals.5'), name)).toBe(
      'Win level 1-5, level 2-1 and level 3-5 in a row with more than 1,000,000 points in all.',
    );
    expect(goalBand(def('runs.4'))).toBe('FIVE RANDOM LEVELS');
    expect(goalBand(def('insane.2'))).toBe('ONE BALL');
    expect(goalBand(def('insane.3'))).toBe('10 BALLS FOR THREE LEVELS');
    expect(goalBand(def('insane.4'))).toBe('ANY LEVEL, OVER 750,000');
    expect(goalBand(def('duel-2.3'))).toBe('BEAT THE RABBIT');
  });

  it('says why a challenge is locked', () => {
    expect(lockSentences(true, 3, { kind: 'duel' })).toEqual(['Duels are not in the game yet.']);
    expect(lockSentences(false, 5, null)).toEqual([
      'Opens when you finish Stage Five of the Adventure.',
    ]);
    expect(lockSentences(false, null, { kind: 'levels', missing: ['4-3'] })).toEqual([
      'Opens when you finish the Adventure.',
      'Level 4-3 is not in the game yet.',
    ]);
    expect(lockSentences(true, 3, { kind: 'levels', missing: ['2-2', '3-1', '4-3'] })).toEqual([
      'Levels 2-2, 3-1 and 4-3 are not in the game yet.',
    ]);
    expect(lockSentences(true, null, { kind: 'pool', needed: 4, available: 3 })).toEqual([
      'It draws four random levels, and the game has only three it can draw from so far.',
    ]);
    expect(listing(['a'])).toBe('a');
  });
});
