import { describe, expect, it } from 'vitest';
import {
  CHALLENGE_GROUPS,
  CHALLENGES,
  challengeById,
  groupById,
  type ChallengeDef,
  type ChallengeGroup,
} from '../../rules/challenges';
import {
  cardTitle,
  goalBand,
  goalSentence,
  groupName,
  groupText,
  levelTitle,
  listing,
  lockSentence,
  runLine,
} from './challenge-copy';

function def(id: string): ChallengeDef {
  const c = challengeById(id);
  if (c === null) throw new Error(`no challenge ${id}`);
  return c;
}

function group(id: string): ChallengeGroup {
  const g = groupById(id);
  if (g === null) throw new Error(`no group ${id}`);
  return g;
}

/** Stage 1 to 4's names as the manifest has them, a few of them. */
const NAMES: Readonly<Record<string, string>> = {
  '1-1': 'Balloon Morning',
  '1-2': 'Kite Tails',
  '1-3': 'The Sky Tree',
  '1-4': 'Cloud Ship',
  '1-5': 'Dandelion Wind',
  '2-1': 'Peanut Rows',
  '2-2': 'The Forked Lane',
  '3-1': 'Gable Row',
  '3-3': 'The Bell Tower',
  '4-3': 'Comet Shower',
};
const name = (slot: string): string => NAMES[slot] ?? `Level ${slot}`;

const HOLE = /undefined|NaN|null|\[object/;

describe('challenge copy', () => {
  it('words every challenge and group, with no hole in the text', () => {
    for (const c of CHALLENGES) {
      const texts = [
        cardTitle(c, name),
        goalBand(c),
        goalSentence(c, name),
        goalSentence(c, name, '1-3'),
        lockSentence(c, ['1-2', '1-3'], name),
      ];
      for (const text of texts) {
        expect(text.length).toBeGreaterThan(3);
        expect(text).not.toMatch(HOLE);
        expect(text).not.toMatch(/ {2}|—/);
      }
      expect(goalBand(c)).toBe(goalBand(c).toUpperCase());
      expect(cardTitle(c, name)).toBe(cardTitle(c, name).toUpperCase());
      expect(goalSentence(c, name)).toMatch(/^[A-Z].*\.$/);
      expect(lockSentence(c, [], name)).toBe('');
    }
    for (const g of CHALLENGE_GROUPS) {
      expect(groupName(g).length).toBeGreaterThan(3);
      expect(groupName(g).length).toBeLessThanOrEqual(24);
      expect(groupText(g)).toMatch(/^[A-Z0-9].*\.$/);
      expect(`${groupName(g)} ${groupText(g)}`).not.toMatch(HOLE);
    }
    // No two groups shown together share a name.
    const names = CHALLENGE_GROUPS.filter((g) => !g.duel).map(groupName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('titles a card by its level, or by what its levels are', () => {
    expect(cardTitle(def('orange-1.1'), name)).toBe('THE SKY TREE · 1-3');
    expect(levelTitle('1-4', name)).toBe('CLOUD SHIP · 1-4');
    expect(cardTitle(def('totals.1'), name)).toBe('THREE LEVELS');
    expect(cardTitle(def('runs.1'), name)).toBe('RANDOM LEVELS');
    expect(cardTitle(def('insane.5'), name)).toBe('RANDOM LEVELS');
    expect(cardTitle(def('insane.4'), name)).toBe('ANY LEVEL');
    expect(cardTitle(def('insane.4'), name, '1-3')).toBe('THE SKY TREE · 1-3');
  });

  it('puts the goal in the band, with the numbers of the definitions', () => {
    expect(goalBand(def('orange-1.1'))).toBe(`CLEAR ${def('orange-1.1').orange ?? 0} ORANGE PEGS`);
    expect(goalBand(def('orange-3.2'))).toBe('CLEAR 30 ORANGE PEGS');
    expect(goalBand(def('cup-1.1'))).toBe('OVER 300,000 POINTS');
    expect(goalBand(def('cup-2.4'))).toBe('OVER 350,000 POINTS');
    expect(goalBand(def('clear-2.1'))).toBe('CLEAR EVERY PEG');
    expect(goalBand(def('insane.1'))).toBe('START WITH 2 BALLS');
    expect(goalBand(def('insane.2'))).toBe('START WITH 1 BALL');
    expect(goalBand(def('insane.3'))).toBe('10 BALLS FOR 3 LEVELS');
    expect(goalBand(def('runs.2'))).toBe('3 IN A ROW');
    expect(goalBand(def('insane.5'))).toBe('10 IN A ROW');
    expect(goalBand(def('totals.1'))).toBe('OVER 750,000 COMBINED');
    expect(goalBand(def('totals.5'))).toBe('OVER 1,000,000 COMBINED');
    expect(goalBand(def('insane.4'))).toBe('OVER 750,000 POINTS');
  });

  it('says the goal in one plain sentence per kind', () => {
    expect(goalSentence(def('orange-1.1'), name)).toBe(
      'The Sky Tree has 26 orange pegs this time instead of 20. Clear them all with 10 balls.',
    );
    expect(goalSentence(def('cup-1.3'), name)).toBe(
      'Beat The Bell Tower and finish with more than 300,000 points.',
    );
    expect(goalSentence(def('clear-1.3'), name)).toBe(
      'Beat The Sky Tree and clear every peg and brick, blue ones too.',
    );
    expect(goalSentence(def('insane.2'), name)).toBe(
      'Beat Cloud Ship starting with 1 ball. Free balls you earn still count.',
    );
    expect(goalSentence(def('insane.1'), name)).toBe(
      'Beat Balloon Morning starting with 2 balls. Free balls you earn still count.',
    );
    expect(goalSentence(def('insane.3'), name)).toBe(
      'Beat Balloon Morning, Kite Tails and Cloud Ship in a row. You get 10 balls for all three, and leftovers carry over.',
    );
    expect(goalSentence(def('runs.2'), name)).toBe(
      'Beat 3 random levels in a row. Lose one and the streak is over.',
    );
    expect(goalSentence(def('totals.1'), name)).toBe(
      'Beat The Forked Lane, Gable Row and Comet Shower in a row with more than 750,000 points combined.',
    );
    expect(goalSentence(def('insane.4'), name)).toBe(
      "Choose any level you've beaten and score more than 750,000 on it.",
    );
    expect(goalSentence(def('insane.4'), name, '1-3')).toBe(
      'Beat The Sky Tree and finish with more than 750,000 points.',
    );
  });

  it('says which level of a run is in play', () => {
    expect(runLine(['1-1', '1-2', '1-4'], 1, name)).toBe('Level 2 of 3: Kite Tails');
    expect(runLine(['1-3'], 0, name)).toBeNull();
  });

  it('says exactly what opens a locked challenge', () => {
    expect(lockSentence(def('orange-1.1'), ['1-3'], name)).toBe(
      'Beat The Sky Tree in the Adventure to open this.',
    );
    expect(lockSentence(def('totals.1'), ['2-2', '3-1', '4-3'], name)).toBe(
      'Beat The Forked Lane, Gable Row and Comet Shower in the Adventure to open this.',
    );
    expect(lockSentence(def('runs.2'), ['1-5'], name)).toBe(
      "It draws 3 random levels from the ones you've beaten. Beat Dandelion Wind (1-5) in the Adventure to open this.",
    );
    expect(lockSentence(def('runs.5'), ['1-5', '2-1', '2-2', '3-3'], name)).toBe(
      "It draws 6 random levels from the ones you've beaten. Beat 4 more levels in the Adventure, up to The Bell Tower (3-3), to open this.",
    );
    expect(lockSentence(def('insane.4'), ['1-1'], name)).toBe(
      'Beat Balloon Morning in the Adventure to open this.',
    );
  });

  it('names and describes the groups literally', () => {
    expect(groupName(group('orange-1'))).toBe('26 Orange Pegs');
    expect(groupText(group('orange-1'))).toBe('26 orange pegs instead of 20. Clear them all.');
    expect(groupText(group('orange-3'))).toBe('30 orange pegs instead of 20. Clear them all.');
    expect(groupName(group('cup-2'))).toBe('Silver Score Target');
    expect(groupText(group('cup-2'))).toBe('Beat each level with more than 350,000 points.');
    expect(groupName(group('clear-1'))).toBe('Clean Board');
    expect(groupName(group('runs'))).toBe('Winning Streaks');
    expect(groupName(group('totals'))).toBe('Combined Scores');
    expect(groupName(group('insane'))).toBe('Gauntlet');
    expect(listing(['a'])).toBe('a');
    expect(listing(['a', 'b', 'c'])).toBe('a, b and c');
  });
});
