// Teggle's own words for the challenges (visual guide 15: no text from the original game): the
// short goal on a challenge's thumbnail, the goal sentence of the info panel and the end dialog,
// and why a challenge is locked. Every number comes from the challenge's definition
// (src/rules/challenges.ts), so the words always match the rules.

import {
  carriesBalls,
  isPick,
  namedSlots,
  orangeCountOf,
  randomCount,
  type ChallengeDef,
  type Unplayable,
} from '../../rules/challenges';
import { masterOfPower } from '../../rules/masters';
import { isPowerId } from '../../rules/powers';
import { DEFAULT_ORANGE_COUNT } from '../../rules/tuning';
import { formatNumber } from '../ui/text';
import { stageName } from './copy';

/** How a level is named in a sentence: "1-3 The Sky Tree", or "level 4-3" before it is built. */
export type LevelNamer = (slot: string) => string;

const NUMBER_WORDS = [
  'no',
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
];

function words(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** "a, b and c". */
export function listing(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1] ?? ''}`;
}

function duelOpponent(c: ChallengeDef): string {
  const o = c.duel?.opponents[0];
  return o !== undefined && isPowerId(o) ? masterOfPower(o).animal : 'a master';
}

const AI_NAMES = { normal: 'Normal', hard: 'Hard', master: 'Master' } as const;

/** The goal in a few capital words, for the band on a challenge's thumbnail. */
export function goalBand(c: ChallengeDef): string {
  if (c.duel !== null) {
    return c.levels.length > 1 ? 'BEAT THREE MASTERS' : `BEAT THE ${duelOpponent(c).toUpperCase()}`;
  }
  if (c.orange !== null) return `${orangeCountOf(c)} ORANGE PEGS`;
  if (c.fullClear) return 'CLEAR EVERY PEG';
  if (c.balls !== null && carriesBalls(c)) {
    return `${c.balls} BALLS FOR ${words(c.levels.length).toUpperCase()} LEVELS`;
  }
  if (c.balls !== null) return c.balls === 1 ? 'ONE BALL' : `${words(c.balls).toUpperCase()} BALLS`;
  const random = randomCount(c);
  if (c.score !== null) {
    const levels = isPick(c)
      ? 'ANY LEVEL, '
      : c.levels.length > 1
        ? `${words(c.levels.length).toUpperCase()} LEVELS, `
        : '';
    return `${levels}OVER ${formatNumber(c.score)}`;
  }
  if (random > 0) return `${words(random).toUpperCase()} RANDOM LEVELS`;
  return 'WIN';
}

/** The goal as a sentence. */
export function goalSentence(c: ChallengeDef, name: LevelNamer): string {
  const named = namedSlots(c).map(name);
  const one = named[0] ?? '';
  if (c.duel !== null) {
    if (c.levels.length > 1) {
      return 'Finish three random levels with a higher total score than three random masters, each playing a level against you.';
    }
    const ai = AI_NAMES[c.duel.ai[0] ?? 'normal'];
    return `Take turns with the ${duelOpponent(c)} on ${one} and finish with the higher score. The ${duelOpponent(c)} plays at ${ai}.`;
  }
  if (c.orange !== null) {
    const more = orangeCountOf(c) - DEFAULT_ORANGE_COUNT;
    return `Win ${one} with ${orangeCountOf(c)} orange pegs, ${words(more)} more than usual.`;
  }
  if (c.fullClear) return `Win ${one} with every peg and brick cleared, the blue ones too.`;
  if (c.balls !== null && carriesBalls(c)) {
    return `Win ${listing(named)} in a row with ${c.balls} balls in all. The balls left after each level, free balls too, carry over to the next.`;
  }
  if (c.balls !== null) {
    return c.balls === 1
      ? `Win ${one} starting with a single ball. Free balls still count.`
      : `Win ${one} starting with only ${words(c.balls)} balls. Free balls still count.`;
  }
  if (isPick(c) && c.score !== null) {
    return `Win a level of your choice with more than ${formatNumber(c.score)} points.`;
  }
  if (c.score !== null && c.levels.length > 1) {
    return `Win ${listing(named)} in a row with more than ${formatNumber(c.score)} points in all.`;
  }
  if (c.score !== null) return `Win ${one} with more than ${formatNumber(c.score)} points.`;
  const random = randomCount(c);
  if (random > 0) {
    return `Win ${words(random)} random levels in a row, each with 10 balls. Lose one and the run is over.`;
  }
  return `Win ${listing(named)}.`;
}

/** Why a challenge cannot be played, as sentences. `opensAfter` is the stage that opens it. */
export function lockSentences(
  groupOpen: boolean,
  opensAfter: number | null,
  why: Unplayable | null,
): string[] {
  const out: string[] = [];
  if (why?.kind === 'duel') {
    out.push('Duels are not in the game yet.');
    return out;
  }
  if (!groupOpen) {
    out.push(
      opensAfter === null
        ? 'Opens when you finish the Adventure.'
        : `Opens when you finish ${stageName(opensAfter)} of the Adventure.`,
    );
  }
  if (why?.kind === 'levels' && why.missing.length > 0) {
    const ids = why.missing;
    out.push(
      ids.length === 1
        ? `Level ${ids[0] ?? ''} is not in the game yet.`
        : `Levels ${listing(ids)} are not in the game yet.`,
    );
  } else if (why?.kind === 'pool') {
    out.push(
      `It draws ${words(why.needed)} random levels, and the game has only ${words(why.available)} it can draw from so far.`,
    );
  }
  return out;
}
