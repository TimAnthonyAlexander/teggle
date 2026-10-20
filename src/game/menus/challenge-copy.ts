// Teggle's own words for the challenges (visual guide 15: no text from the original game): a
// card's title (its level), the goal in capitals for the band on its picture, the goal as a
// sentence for the briefing card, the goal card in the level and the end dialog, the group names
// and texts, and what opens a locked challenge. Every number comes from the challenge's
// definition (src/rules/challenges.ts), so the words always match the rules. Plain words, short
// sentences (spec 14.2, "Decided in the challenges").

import {
  carriesBalls,
  challengesOf,
  isPick,
  namedSlots,
  orangeCountOf,
  randomCount,
  type ChallengeDef,
  type ChallengeGroup,
} from '../../rules/challenges';
import { masterOfPower } from '../../rules/masters';
import { isPowerId } from '../../rules/powers';
import { DEFAULT_BALLS, DEFAULT_ORANGE_COUNT } from '../../rules/tuning';
import { formatNumber } from '../ui/text';

/** How a level is named in a sentence: "The Sky Tree", or "Level 4-3" before it is built. */
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

/** "1 ball", "10 balls". */
function balls(n: number): string {
  return `${formatNumber(n)} ${n === 1 ? 'ball' : 'balls'}`;
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

/** A level's title in capitals: "THE SKY TREE · 1-3". */
export function levelTitle(slot: string, name: LevelNamer): string {
  return `${name(slot).toUpperCase()} · ${slot}`;
}

/**
 * A card's title, in capitals: its level and slot ("THE SKY TREE · 1-3"), or what its levels are
 * ("THREE LEVELS", "RANDOM LEVELS", "ANY LEVEL"). The pick challenge, once `picked`, is titled by
 * the level chosen.
 */
export function cardTitle(c: ChallengeDef, name: LevelNamer, picked: string | null = null): string {
  if (isPick(c)) return picked === null ? 'ANY LEVEL' : levelTitle(picked, name);
  if (randomCount(c) > 0) return 'RANDOM LEVELS';
  const slots = namedSlots(c);
  if (slots.length > 1) return `${words(slots.length).toUpperCase()} LEVELS`;
  return levelTitle(slots[0] ?? '', name);
}

/** The goal in a few capital words, for the band on a challenge's picture. */
export function goalBand(c: ChallengeDef): string {
  const n = c.levels.length;
  if (c.duel !== null) {
    return n > 1 ? 'BEAT THREE MASTERS' : `BEAT THE ${duelOpponent(c).toUpperCase()}`;
  }
  if (c.orange !== null) return `CLEAR ${orangeCountOf(c)} ORANGE PEGS`;
  if (c.fullClear) return 'CLEAR EVERY PEG';
  if (c.balls !== null && carriesBalls(c)) return `${c.balls} BALLS FOR ${n} LEVELS`;
  if (c.balls !== null) return `START WITH ${balls(c.balls).toUpperCase()}`;
  if (c.score !== null) {
    return `OVER ${formatNumber(c.score)} ${n > 1 ? 'COMBINED' : 'POINTS'}`;
  }
  if (randomCount(c) > 0) return `${n} IN A ROW`;
  return 'BEAT THE LEVEL';
}

/**
 * The goal as a sentence. `picked` is the level chosen for the pick challenge, once there is one.
 */
export function goalSentence(
  c: ChallengeDef,
  name: LevelNamer,
  picked: string | null = null,
): string {
  const named = namedSlots(c).map(name);
  const one = named[0] ?? (picked === null ? '' : name(picked));
  const n = c.levels.length;
  if (c.duel !== null) {
    if (n > 1) {
      return `Beat ${n} random levels with a higher total score than three masters, each playing a level against you.`;
    }
    return `Take turns with the ${duelOpponent(c)} on ${one} and finish with the higher score.`;
  }
  if (c.orange !== null) {
    return `${one} has ${orangeCountOf(c)} orange pegs this time instead of ${DEFAULT_ORANGE_COUNT}. Clear them all with ${balls(c.balls ?? DEFAULT_BALLS)}.`;
  }
  if (c.fullClear) return `Beat ${one} and clear every peg and brick, blue ones too.`;
  if (c.balls !== null && carriesBalls(c)) {
    return `Beat ${listing(named)} in a row. You get ${c.balls} balls for all ${words(n)}, and leftovers carry over.`;
  }
  if (c.balls !== null) {
    return `Beat ${one} starting with ${balls(c.balls)}. Free balls you earn still count.`;
  }
  if (c.score !== null) {
    const target = formatNumber(c.score);
    if (isPick(c) && picked === null) {
      return `Choose any level you've beaten and score more than ${target} on it.`;
    }
    if (n > 1) return `Beat ${listing(named)} in a row with more than ${target} points combined.`;
    return `Beat ${one} and finish with more than ${target} points.`;
  }
  if (randomCount(c) > 0) {
    return `Beat ${n} random levels in a row. Lose one and the streak is over.`;
  }
  return `Beat ${listing(named)}.`;
}

/** "Level 2 of 3: Kite Tails" for a level of a run of several, else null. */
export function runLine(levels: readonly string[], index: number, name: LevelNamer): string | null {
  if (levels.length < 2) return null;
  return `Level ${index + 1} of ${levels.length}: ${name(levels[index] ?? '')}`;
}

/**
 * What opens a locked challenge, as sentences; `toOpen` is the levels still to beat in the
 * Adventure, in campaign order (src/rules/challenges.ts, levelsToOpen).
 */
export function lockSentence(c: ChallengeDef, toOpen: readonly string[], name: LevelNamer): string {
  const last = toOpen.at(-1);
  if (last === undefined) return '';
  const random = randomCount(c);
  if (random > 0) {
    const draws = `It draws ${random} random levels from the ones you've beaten.`;
    if (toOpen.length === 1) {
      return `${draws} Beat ${name(last)} (${last}) in the Adventure to open this.`;
    }
    return `${draws} Beat ${toOpen.length} more levels in the Adventure, up to ${name(last)} (${last}), to open this.`;
  }
  return `Beat ${listing(toOpen.map(name))} in the Adventure to open this.`;
}

// ---------------------------------------------------------------------------------------------
// Groups

const CUP_TIERS: Readonly<Record<string, string>> = {
  'cup-1': 'Bronze',
  'cup-2': 'Silver',
  'cup-3': 'Gold',
};

/** The first challenge of a group, for the numbers its words quote. */
function firstOf(g: ChallengeGroup): ChallengeDef | null {
  return challengesOf(g.id)[0] ?? null;
}

/** A group's name, for the list's title pill and info panel. */
export function groupName(g: ChallengeGroup): string {
  const first = firstOf(g);
  if (g.id.startsWith('orange-') && first !== null) return `${orangeCountOf(first)} Orange Pegs`;
  const tier = CUP_TIERS[g.id];
  if (tier !== undefined) return `${tier} Score Target`;
  switch (g.id) {
    case 'clear-1':
      return 'Clean Board';
    case 'clear-2':
      return 'More Clean Boards';
    case 'runs':
      return 'Winning Streaks';
    case 'totals':
      return 'Combined Scores';
    case 'insane':
      return 'Gauntlet';
    case 'tri-duel':
      return 'Duel Series';
    default:
      return 'Duels';
  }
}

/** A group's text, one or two short sentences with its numbers. */
export function groupText(g: ChallengeGroup): string {
  const first = firstOf(g);
  if (g.id.startsWith('orange-') && first !== null) {
    return `${orangeCountOf(first)} orange pegs instead of ${DEFAULT_ORANGE_COUNT}. Clear them all.`;
  }
  if (g.id.startsWith('cup-') && first !== null && first.score !== null) {
    return `Beat each level with more than ${formatNumber(first.score)} points.`;
  }
  switch (g.id) {
    case 'clear-1':
      return 'Beat each level and clear every peg and brick, blue ones too.';
    case 'clear-2':
      return 'Clear every peg and brick on later levels, blue ones too.';
    case 'runs':
      return 'Beat random levels in a row. Lose one and the streak is over.';
    case 'totals':
      return 'Beat three levels in a row with a combined score over the target.';
    case 'insane':
      return 'The hardest ones: fewer balls, a higher score and a longer streak.';
    default:
      return 'Take turns with a master on one board.';
  }
}
