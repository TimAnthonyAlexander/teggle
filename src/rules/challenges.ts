// The base game's 75 challenges in 15 groups of 5 (spec 8; research 6), as validated data, and
// the rules of a challenge run. The groups, their order, the levels each challenge names and its
// kind of goal follow the original's own challenge file (the owner's copy, `levels/trophy.cfg`);
// a level is named by its campaign slot, so Teggle's level in that slot is used. Names and
// descriptions are Teggle's own (visual guide 15), and the numbers are fitted to Teggle's
// 20-orange levels (spec 14.2, "Decided in the challenges").
//
// A challenge is the original's model: levels to win in a row, optionally with more orange pegs,
// fewer balls (carried from level to level where they span several), a total score to beat or
// every peg to clear. Losing any level fails it. Duel and the three-level duels are post-MVP:
// listed, never playable.

import { z } from 'zod';
import type { Rng } from '../core/rng';
import { attemptConfig, type AttemptConfig } from './config';
import { POWER_IDS, type PowerId } from './powers/ids';
import { DEFAULT_BALLS, DEFAULT_ORANGE_COUNT } from './tuning';

// ---------------------------------------------------------------------------------------------
// Numbers (spec 14.2, "Decided in the challenges")

/**
 * Orange pegs of the three more-orange groups. The original's 35, 45 and 55 (of its usual 25)
 * took its stage 1 from 39% to 24%, 21% and 16% for the reference agent; Teggle's stage 1 gives
 * 24%, 21% and 16% at 26, 27 and 30 (of its usual 20).
 */
export const CHALLENGE_ORANGE = [26, 27, 30] as const;
/**
 * Score to beat on one level in the three cup groups: the original's, kept, since the reference
 * agent's winning scores on Teggle's stage 1 run only about 5% above the original's.
 */
export const CUP_SCORES = [300_000, 350_000, 400_000] as const;
/** Total to beat over three named levels: the original's, kept. */
export const TOTAL_SCORES = [750_000, 800_000, 850_000, 900_000, 1_000_000] as const;
/** The insane group: start balls of the first two, balls for the three-level trial (kept). */
export const GAUNTLET_BALLS = [2, 1, 10] as const;
/** The insane group: score to beat on a level of the player's choice (kept). */
export const PICK_SCORE = 750_000;

// ---------------------------------------------------------------------------------------------
// The random pool

/** Stages whose five levels are all in the random pool. */
const RANDOM_STAGES: readonly number[] = [2, 3, 4, 6, 7, 8];
/** Levels of the other stages that are in it. */
const RANDOM_EXTRA: readonly string[] = [
  '1-2',
  '1-3',
  '1-5',
  '5-2',
  '5-3',
  '5-4',
  '5-5',
  '9-1',
  '9-2',
  '9-4',
  '10-1',
  '10-2',
  '10-4',
];

/**
 * Levels a random challenge level is drawn from, by campaign slot, in campaign order: the
 * original's random pool (`stages.cfg`: ExcludeRandStages 1, 5, 9, 10, 11 and IncludeRandLevels),
 * 43 levels. A run never draws a level twice; only levels in the game can be drawn.
 */
export const RANDOM_POOL: readonly string[] = Array.from({ length: 55 }, (_, i) => {
  const stage = Math.floor(i / 5) + 1;
  return `${stage}-${(i % 5) + 1}`;
}).filter((id) => RANDOM_STAGES.includes(Number(id.split('-')[0])) || RANDOM_EXTRA.includes(id));

// ---------------------------------------------------------------------------------------------
// Schema

const SLOT = /^(?:[1-9]|1[01])-[1-5]$/;
/** A level a challenge names: a campaign slot, a random level, or one the player picks. */
const levelRefSchema = z.union([z.string().regex(SLOT), z.literal('random'), z.literal('pick')]);
export type LevelRef = z.output<typeof levelRefSchema>;

export const DUEL_AI = ['normal', 'hard', 'master'] as const;
export type DuelAi = (typeof DUEL_AI)[number];

const duelSchema = z.strictObject({
  /** The master to beat on each level; 'random' draws one. */
  opponents: z.array(z.union([z.enum(POWER_IDS), z.literal('random')])).min(1),
  /** The opponent's skill on each level (spec 8: the noisy agent at three error sizes). */
  ai: z.array(z.enum(DUEL_AI)).min(1),
});
export type DuelDef = z.output<typeof duelSchema>;

const GROUP_ID = /^[a-z]+(?:-[a-z0-9]+)*$/;

const groupSchema = z.strictObject({
  id: z.string().regex(GROUP_ID),
  name: z.string().min(1).max(24),
  description: z.string().min(1).max(160),
  /** Post-MVP (Duel): listed, never playable. */
  duel: z.boolean(),
});
export type ChallengeGroup = z.output<typeof groupSchema>;

const challengeSchema = z.strictObject({
  /** "<group id>.<index>", stable: the save keys results by it. */
  id: z.string().regex(/^[a-z]+(?:-[a-z0-9]+)*\.[1-5]$/),
  group: z.string().regex(GROUP_ID),
  /** 1 to 5 within the group. */
  index: z.int().min(1).max(5),
  name: z.string().min(1).max(24),
  /** The levels to win in a row. */
  levels: z.array(levelRefSchema).min(1).max(10),
  /** Orange pegs per level, or null for the usual count. */
  orange: z.int().min(1).max(200).nullable(),
  /** Balls at the start of the first level, carried to the next ones; null: 10 every level. */
  balls: z.int().min(1).max(100).nullable(),
  /** Total score over all levels to beat (strictly more), or null for none. */
  score: z.int().min(1).max(1e9).nullable(),
  /** Every peg and brick must be cleared in each win. */
  fullClear: z.boolean(),
  duel: duelSchema.nullable(),
});
export type ChallengeDef = z.output<typeof challengeSchema>;

export const GROUP_COUNT = 15;
export const CHALLENGES_PER_GROUP = 5;

const challengeSetSchema = z
  .strictObject({ groups: z.array(groupSchema), challenges: z.array(challengeSchema) })
  .superRefine((set, ctx) => {
    const issue = (message: string): void => {
      ctx.addIssue({ code: 'custom', message });
    };
    if (set.groups.length !== GROUP_COUNT) issue(`${set.groups.length} groups, not ${GROUP_COUNT}`);
    const groupIds = new Set(set.groups.map((g) => g.id));
    if (groupIds.size !== set.groups.length) issue('two groups share an id');
    const names = new Set<string>();
    for (const g of set.groups) {
      const list = set.challenges.filter((c) => c.group === g.id);
      if (list.length !== CHALLENGES_PER_GROUP)
        issue(`group ${g.id} has ${list.length} challenges`);
      list.forEach((c, i) => {
        if (c.index !== i + 1) issue(`${c.id} is listed as number ${i + 1} of its group`);
        if (c.id !== `${g.id}.${c.index}`) issue(`${c.id} should be ${g.id}.${c.index}`);
        if ((c.duel !== null) !== g.duel) issue(`${c.id}: duel challenges belong to duel groups`);
      });
    }
    for (const c of set.challenges) {
      if (!groupIds.has(c.group)) issue(`${c.id} names the unknown group ${c.group}`);
      if (names.has(c.name)) issue(`the name "${c.name}" is used twice`);
      names.add(c.name);
      const slots = c.levels.filter((l) => SLOT.test(l));
      if (new Set(slots).size !== slots.length) issue(`${c.id} names a level twice`);
      if (c.levels.includes('pick') && c.levels.length !== 1) issue(`${c.id}: a pick stands alone`);
      if (c.duel !== null) {
        const n = c.levels.length;
        if (c.duel.opponents.length !== n || c.duel.ai.length !== n) {
          issue(`${c.id}: one opponent and one AI per level`);
        }
      }
    }
  });

// ---------------------------------------------------------------------------------------------
// The challenges (spec 8; research 6; the original's trophy.cfg for levels and kinds)

interface Draft {
  readonly name: string;
  readonly levels: readonly LevelRef[];
  readonly orange?: number;
  readonly balls?: number;
  readonly score?: number;
  readonly fullClear?: boolean;
  readonly duel?: DuelDef;
}

function group(
  id: string,
  name: string,
  description: string,
  drafts: readonly Draft[],
  duel = false,
): { group: ChallengeGroup; challenges: ChallengeDef[] } {
  return {
    group: { id, name, description, duel },
    challenges: drafts.map((d, i) => ({
      id: `${id}.${i + 1}`,
      group: id,
      index: i + 1,
      name: d.name,
      levels: [...d.levels],
      orange: d.orange ?? null,
      balls: d.balls ?? null,
      score: d.score ?? null,
      fullClear: d.fullClear ?? false,
      duel: d.duel ?? null,
    })),
  };
}

function oneEach(
  names: readonly string[],
  levels: readonly string[],
  extra: Omit<Draft, 'name' | 'levels'>,
): Draft[] {
  return names.map((name, i) => ({ name, levels: [levels[i] ?? ''], ...extra }));
}

function duels(
  names: readonly string[],
  levels: readonly string[],
  opponents: readonly PowerId[],
  ai: DuelAi,
): Draft[] {
  return names.map((name, i) => ({
    name,
    levels: [levels[i] ?? ''],
    duel: { opponents: [opponents[i] ?? 'guide'], ai: [ai] },
  }));
}

const [ORANGE_LOW, ORANGE_MID, ORANGE_HIGH] = CHALLENGE_ORANGE;
const [CUP_LOW, CUP_MID, CUP_HIGH] = CUP_SCORES;
const [TOTAL_1, TOTAL_2, TOTAL_3, TOTAL_4, TOTAL_5] = TOTAL_SCORES;
const [TWO_BALLS, ONE_BALL, TRIAL_BALLS] = GAUNTLET_BALLS;
const HARD_FIVE: readonly PowerId[] = [
  'spookyBall',
  'flowerPower',
  'luckySpin',
  'fireball',
  'zenBall',
];

const RAW = [
  group(
    'orange-1',
    'Orange Crowd',
    'These levels have more orange pegs than usual. Clear every one of them to win.',
    oneEach(
      ['Orange Grove', 'Peel Away', 'Zest', 'Marmalade', 'Juice Bar'],
      ['1-3', '2-2', '3-1', '4-3', '5-1'],
      { orange: ORANGE_LOW },
    ),
  ),
  group(
    'orange-2',
    'Orange Swarm',
    'Even more orange pegs, and every one of them has to go.',
    oneEach(
      ['Tangerine Rain', 'Apricot Hill', 'Amber Field', 'Copper Kettle', 'Ember Trail'],
      ['2-1', '3-4', '4-1', '5-2', '6-2'],
      { orange: ORANGE_MID },
    ),
  ),
  group(
    'orange-3',
    'Orange Flood',
    'The most orange pegs of all. Clear them before your balls run out.',
    oneEach(
      ['Orange Tide', 'Sunset Sea', 'High Water', 'Flood Plain', 'The Deluge'],
      ['3-5', '4-2', '5-5', '6-1', '7-1'],
      { orange: ORANGE_HIGH },
    ),
  ),
  group(
    'cup-1',
    'Bronze Cup',
    'Win the level and finish with a score above the mark.',
    oneEach(
      ['Bronze Age', 'Bronze Bell', 'Bronze Coin', 'Bronze Lantern', 'Bronze Anchor'],
      ['1-5', '2-3', '3-3', '4-3', '5-4'],
      { score: CUP_LOW },
    ),
  ),
  group(
    'cup-2',
    'Silver Cup',
    'A higher mark this time. Every shot counts toward it.',
    oneEach(
      ['Silver Spoon', 'Silver Lining', 'Silver Screen', 'Silver Arrow', 'Silver Fox'],
      ['1-2', '3-2', '4-1', '5-5', '8-1'],
      { score: CUP_MID },
    ),
  ),
  group(
    'cup-3',
    'Gold Cup',
    'The highest marks for a single level. Play every shot for points.',
    oneEach(
      ['Gold Rush', 'Gold Leaf', 'Gold Mine', 'Gold Medal', 'Gold Standard'],
      ['2-1', '4-2', '5-1', '6-5', '9-1'],
      { score: CUP_HIGH },
    ),
  ),
  group(
    'clear-1',
    'Clean Sweep',
    'Win with every peg and brick gone, the blue ones too.',
    oneEach(
      ['Clean Slate', 'Sweep Up', 'Spring Cleaning', 'Bare Board', 'Fresh Start'],
      ['1-1', '1-2', '1-3', '1-4', '1-5'],
      { fullClear: true },
    ),
  ),
  group(
    'clear-2',
    'Spotless',
    'Harder boards to clear completely. Leave nothing behind.',
    oneEach(
      ['Squeaky Clean', 'Wiped Out', 'Empty Board', 'Polished', 'Whistle Clean'],
      ['2-2', '3-1', '5-1', '6-2', '7-2'],
      { fullClear: true },
    ),
  ),
  group(
    'duel-1',
    'Duels',
    'Take turns with a master on one board and finish ahead. The masters play at Normal.',
    duels(
      ['Unicorn Duel', 'Gopher Duel', 'Cat Duel', 'Alien Duel', 'Lobster Duel'],
      ['1-4', '2-1', '3-2', '4-3', '5-2'],
      ['guide', 'multiball', 'pyramid', 'spaceBlast', 'flippers'],
      'normal',
    ),
    true,
  ),
  group(
    'duel-2',
    'Hard Duels',
    'Duels against the later masters, who play at Hard.',
    duels(
      ['Pumpkin Duel', 'Sunflower Duel', 'Rabbit Duel', 'Wyvern Duel', 'Owl Duel'],
      ['6-4', '7-1', '8-3', '9-1', '10-4'],
      HARD_FIVE,
      'hard',
    ),
    true,
  ),
  group(
    'duel-3',
    'Master Duels',
    'The same five masters at their best, on new boards.',
    duels(
      [
        'Pumpkin Showdown',
        'Sunflower Showdown',
        'Rabbit Showdown',
        'Wyvern Showdown',
        'Owl Showdown',
      ],
      ['6-1', '7-4', '8-3', '9-2', '10-1'],
      HARD_FIVE,
      'master',
    ),
    true,
  ),
  group(
    'runs',
    'Winning Streak',
    'Win random levels back to back. Lose one and the streak is over.',
    ['Two in a Row', 'Three in a Row', 'Four in a Row', 'Five in a Row', 'Six in a Row'].map(
      (name, i): Draft => ({ name, levels: new Array<LevelRef>(i + 2).fill('random') }),
    ),
  ),
  group(
    'tri-duel',
    'Duel Series',
    'Finish three random levels with a higher total than three random masters.',
    (
      [
        ['Three Rounds', ['normal', 'normal', 'normal']],
        ['Tougher Rounds', ['hard', 'normal', 'hard']],
        ['Rough Rounds', ['master', 'normal', 'hard']],
        ['Fierce Rounds', ['hard', 'master', 'hard']],
        ['Final Rounds', ['master', 'master', 'master']],
      ] as const
    ).map(([name, ai]): Draft => ({
      name,
      levels: ['random', 'random', 'random'],
      duel: { opponents: ['random', 'random', 'random'], ai: [...ai] },
    })),
    true,
  ),
  group(
    'totals',
    'Grand Totals',
    'Win three levels in a row and finish with a combined score above the mark.',
    (
      [
        ['Triple Play', ['2-2', '3-1', '4-3'], TOTAL_1],
        ['Grand Tour', ['5-1', '7-1', '9-1'], TOTAL_2],
        ['Long Haul', ['2-3', '5-5', '6-1'], TOTAL_3],
        ['Home Stretch', ['1-1', '1-3', '1-2'], TOTAL_4],
        ['Seven Figures', ['1-5', '2-1', '3-5'], TOTAL_5],
      ] as const
    ).map(([name, levels, score]): Draft => ({ name, levels, score })),
  ),
  group('insane', 'The Gauntlet', 'The hardest challenges in the game.', [
    { name: 'Two to Go', levels: ['1-1'], balls: TWO_BALLS },
    { name: 'One and Done', levels: ['1-4'], balls: ONE_BALL },
    { name: 'Ten for Three', levels: ['1-1', '1-2', '1-4'], balls: TRIAL_BALLS },
    { name: 'Your Best Board', levels: ['pick'], score: PICK_SCORE },
    { name: 'Ten in a Row', levels: new Array<LevelRef>(10).fill('random') },
  ]),
];

const SET = challengeSetSchema.parse({
  groups: RAW.map((g) => g.group),
  challenges: RAW.flatMap((g) => g.challenges),
});

/** The 15 groups in the original's page order. */
export const CHALLENGE_GROUPS: readonly ChallengeGroup[] = SET.groups;
/** The 75 challenges, group by group. */
export const CHALLENGES: readonly ChallengeDef[] = SET.challenges;

export function challengeById(id: string): ChallengeDef | null {
  return CHALLENGES.find((c) => c.id === id) ?? null;
}

export function groupById(id: string): ChallengeGroup | null {
  return CHALLENGE_GROUPS.find((g) => g.id === id) ?? null;
}

/** The five challenges of a group, in order. */
export function challengesOf(groupId: string): ChallengeDef[] {
  return CHALLENGES.filter((c) => c.group === groupId);
}

/** The campaign slots a challenge names. */
export function namedSlots(c: ChallengeDef): string[] {
  return c.levels.filter((l) => SLOT.test(l));
}

/** Random levels a run of the challenge draws. */
export function randomCount(c: ChallengeDef): number {
  return c.levels.filter((l) => l === 'random').length;
}

export function isPick(c: ChallengeDef): boolean {
  return c.levels.includes('pick');
}

/**
 * The levels of one run in order: named slots as named, the pick as picked, and random levels
 * drawn from `pool` (the random pool's levels in the game) without repeats and without the
 * challenge's named levels. Throws when the pool is too small or the pick is missing.
 */
export function resolveLevels(
  c: ChallengeDef,
  pool: readonly string[],
  rng: Rng,
  pick: string | null = null,
): string[] {
  const named = new Set(namedSlots(c));
  const candidates = pool.filter((id) => !named.has(id));
  const drawn = rng.sample(candidates, Math.min(candidates.length, randomCount(c)));
  if (drawn.length < randomCount(c)) {
    throw new RangeError(`${c.id} needs ${randomCount(c)} random levels, ${drawn.length} exist`);
  }
  let next = 0;
  return c.levels.map((ref) => {
    if (ref === 'random') return drawn[next++] ?? '';
    if (ref === 'pick') {
      if (pick === null || !SLOT.test(pick)) throw new RangeError(`${c.id} needs a picked level`);
      return pick;
    }
    return ref;
  });
}

// ---------------------------------------------------------------------------------------------
// A run

/** What a run needs to know about a finished level. */
export interface LevelOutcome {
  readonly won: boolean;
  readonly score: number;
  readonly fullClear: boolean;
  /** Balls in stock at the end (before they convert to points). */
  readonly ballsLeft: number;
}

export type RunStatus = 'playing' | 'passed' | 'failed';
/**
 * Why a run failed: a level was lost, won without every peg cleared, the total missed the
 * score, or a carried stock ran out with levels still to play.
 */
export type FailReason = 'lost' | 'notCleared' | 'score' | 'noBalls';

export interface ChallengeRun {
  readonly id: string;
  /** The run's levels in order (slots). */
  readonly levels: readonly string[];
  /** Index of the level to play next (or the one that ended the run). */
  readonly index: number;
  /** Balls the next level starts with. */
  readonly balls: number;
  /** Sum of the won levels' scores. */
  readonly total: number;
  readonly won: number;
  readonly status: RunStatus;
  readonly reason: FailReason | null;
  readonly results: readonly LevelOutcome[];
}

export function startRun(c: ChallengeDef, levels: readonly string[]): ChallengeRun {
  if (levels.length !== c.levels.length) {
    throw new RangeError(`${c.id} has ${c.levels.length} levels, not ${levels.length}`);
  }
  return {
    id: c.id,
    levels: [...levels],
    index: 0,
    balls: c.balls ?? DEFAULT_BALLS,
    total: 0,
    won: 0,
    status: 'playing',
    reason: null,
    results: [],
  };
}

/** Orange pegs per level of a challenge. */
export function orangeCountOf(c: ChallengeDef): number {
  return c.orange ?? DEFAULT_ORANGE_COUNT;
}

/** The balls left after a won level start the next one (the original's Balls key). */
export function carriesBalls(c: ChallengeDef): boolean {
  return c.balls !== null && c.levels.length > 1;
}

/**
 * Rules of a challenge level: the challenge's orange count and `balls` (the run's), greens and
 * purple on every level with random greens, as in Quick Play, the chosen master's power and no
 * clear bonus. The orange draw is Teggle's; so a challenge level with 20 orange and 10 balls has
 * exactly the Quick Play config.
 */
export function levelConfig(c: ChallengeDef, balls: number, power: string | null): AttemptConfig {
  return attemptConfig({
    orangeCount: orangeCountOf(c),
    balls,
    greens: true,
    purple: true,
    seededGreens: false,
    power,
    campaignTry: null,
  });
}

// ---------------------------------------------------------------------------------------------
// What can be played

/** Why a challenge cannot be played with the levels in the game. */
export type Unplayable =
  /** Duel is post-MVP (spec 8). */
  | { readonly kind: 'duel' }
  /** Named levels that are not in the game yet. */
  | { readonly kind: 'levels'; readonly missing: readonly string[] }
  /** The random pool's levels in the game are fewer than a run draws. */
  | { readonly kind: 'pool'; readonly needed: number; readonly available: number };

/** The random pool's levels that are in the game (`built`), in campaign order. */
export function randomPool(built: ReadonlySet<string>): string[] {
  return RANDOM_POOL.filter((id) => built.has(id));
}

/** Why `c` cannot be played when the game holds the levels `built`, or null when it can. */
export function unplayable(c: ChallengeDef, built: ReadonlySet<string>): Unplayable | null {
  if (c.duel !== null) return { kind: 'duel' };
  const missing = namedSlots(c).filter((id) => !built.has(id));
  if (missing.length > 0) return { kind: 'levels', missing };
  const needed = randomCount(c);
  if (needed > 0) {
    const named = new Set(namedSlots(c));
    const available = randomPool(built).filter((id) => !named.has(id)).length;
    if (available < needed) return { kind: 'pool', needed, available };
  }
  if (isPick(c) && built.size === 0) return { kind: 'levels', missing: [] };
  return null;
}

/** The run after its current level ended with `o`. */
export function afterLevel(c: ChallengeDef, run: ChallengeRun, o: LevelOutcome): ChallengeRun {
  if (run.status !== 'playing') return run;
  const results = [...run.results, o];
  const fail = (reason: FailReason, won = run.won, total = run.total): ChallengeRun => ({
    ...run,
    won,
    total,
    status: 'failed',
    reason,
    results,
  });
  if (!o.won) return fail('lost');
  if (c.fullClear && !o.fullClear) return fail('notCleared');
  const total = run.total + Math.max(0, Math.round(o.score));
  const won = run.won + 1;
  if (won === run.levels.length) {
    if (c.score !== null && total <= c.score) return fail('score', won, total);
    return { ...run, won, total, status: 'passed', reason: null, results };
  }
  const balls = carriesBalls(c) ? o.ballsLeft : DEFAULT_BALLS;
  if (balls < 1) return fail('noBalls', won, total);
  return { ...run, index: run.index + 1, balls, won, total, results };
}
