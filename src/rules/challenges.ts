// The base game's 75 challenges in 15 groups of 5 (spec 8; research 6), as validated data, the
// rules of a challenge run, and which challenges are shown and open. The groups, their order, the
// levels each challenge names and its kind of goal follow the original's own challenge file (the
// owner's copy, `levels/trophy.cfg`); a level is named by its campaign slot, so Teggle's level in
// that slot is used. The numbers are fitted to Teggle's 20-orange levels (spec 14.2, "Decided in
// the challenges"). The words the player reads are Teggle's own and live with the menus
// (src/game/menus/challenge-copy.ts), built from these definitions.
//
// A challenge is the original's model: levels to win in a row, optionally with more orange pegs,
// fewer balls (carried from level to level where they span several), a total score to beat or
// every peg to clear. Losing any level fails it. Duel and the three-level duels are post-MVP:
// defined, never shown.

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
  /** Post-MVP (Duel): never shown or played. */
  duel: z.boolean(),
});
export type ChallengeGroup = z.output<typeof groupSchema>;

const challengeSchema = z.strictObject({
  /** "<group id>.<index>", stable: the save keys results by it. */
  id: z.string().regex(/^[a-z]+(?:-[a-z0-9]+)*\.[1-5]$/),
  group: z.string().regex(GROUP_ID),
  /** 1 to 5 within the group. */
  index: z.int().min(1).max(5),
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
  readonly levels: readonly LevelRef[];
  readonly orange?: number;
  readonly balls?: number;
  readonly score?: number;
  readonly fullClear?: boolean;
  readonly duel?: DuelDef;
}

function group(
  id: string,
  drafts: readonly Draft[],
  duel = false,
): { group: ChallengeGroup; challenges: ChallengeDef[] } {
  return {
    group: { id, duel },
    challenges: drafts.map((d, i) => ({
      id: `${id}.${i + 1}`,
      group: id,
      index: i + 1,
      levels: [...d.levels],
      orange: d.orange ?? null,
      balls: d.balls ?? null,
      score: d.score ?? null,
      fullClear: d.fullClear ?? false,
      duel: d.duel ?? null,
    })),
  };
}

/** One challenge per level, each with the same goal. */
function oneEach(levels: readonly string[], extra: Omit<Draft, 'levels'>): Draft[] {
  return levels.map((level) => ({ levels: [level], ...extra }));
}

function duels(levels: readonly string[], opponents: readonly PowerId[], ai: DuelAi): Draft[] {
  return levels.map((level, i) => ({
    levels: [level],
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
  group('orange-1', oneEach(['1-3', '2-2', '3-1', '4-3', '5-1'], { orange: ORANGE_LOW })),
  group('orange-2', oneEach(['2-1', '3-4', '4-1', '5-2', '6-2'], { orange: ORANGE_MID })),
  group('orange-3', oneEach(['3-5', '4-2', '5-5', '6-1', '7-1'], { orange: ORANGE_HIGH })),
  group('cup-1', oneEach(['1-5', '2-3', '3-3', '4-3', '5-4'], { score: CUP_LOW })),
  group('cup-2', oneEach(['1-2', '3-2', '4-1', '5-5', '8-1'], { score: CUP_MID })),
  group('cup-3', oneEach(['2-1', '4-2', '5-1', '6-5', '9-1'], { score: CUP_HIGH })),
  group('clear-1', oneEach(['1-1', '1-2', '1-3', '1-4', '1-5'], { fullClear: true })),
  group('clear-2', oneEach(['2-2', '3-1', '5-1', '6-2', '7-2'], { fullClear: true })),
  group(
    'duel-1',
    duels(
      ['1-4', '2-1', '3-2', '4-3', '5-2'],
      ['guide', 'multiball', 'pyramid', 'spaceBlast', 'flippers'],
      'normal',
    ),
    true,
  ),
  group('duel-2', duels(['6-4', '7-1', '8-3', '9-1', '10-4'], HARD_FIVE, 'hard'), true),
  group('duel-3', duels(['6-1', '7-4', '8-3', '9-2', '10-1'], HARD_FIVE, 'master'), true),
  group(
    'runs',
    [2, 3, 4, 5, 6].map((n): Draft => ({ levels: new Array<LevelRef>(n).fill('random') })),
  ),
  group(
    'tri-duel',
    (
      [
        ['normal', 'normal', 'normal'],
        ['hard', 'normal', 'hard'],
        ['master', 'normal', 'hard'],
        ['hard', 'master', 'hard'],
        ['master', 'master', 'master'],
      ] as const
    ).map((ai): Draft => ({
      levels: ['random', 'random', 'random'],
      duel: { opponents: ['random', 'random', 'random'], ai: [...ai] },
    })),
    true,
  ),
  group(
    'totals',
    (
      [
        [['2-2', '3-1', '4-3'], TOTAL_1],
        [['5-1', '7-1', '9-1'], TOTAL_2],
        [['2-3', '5-5', '6-1'], TOTAL_3],
        [['1-1', '1-3', '1-2'], TOTAL_4],
        [['1-5', '2-1', '3-5'], TOTAL_5],
      ] as const
    ).map(([levels, score]): Draft => ({ levels, score })),
  ),
  group('insane', [
    { levels: ['1-1'], balls: TWO_BALLS },
    { levels: ['1-4'], balls: ONE_BALL },
    { levels: ['1-1', '1-2', '1-4'], balls: TRIAL_BALLS },
    { levels: ['pick'], score: PICK_SCORE },
    { levels: new Array<LevelRef>(10).fill('random') },
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
 * drawn from `pool` (drawPool: the random pool's levels in the game the player has beaten)
 * without repeats and without the challenge's named levels. Throws when the pool is too small or
 * the pick is missing.
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
// What is shown and what is open (spec 14.2, "Decided in the challenges")

/** Why a challenge cannot be played with the levels in the game: it is not shown at all. */
export type Unplayable =
  /** Duel is post-MVP (spec 8). */
  | { readonly kind: 'duel' }
  /** Named levels that are not in the game yet. */
  | { readonly kind: 'levels'; readonly missing: readonly string[] }
  /** The random pool's levels in the game are fewer than a run draws. */
  | { readonly kind: 'pool'; readonly needed: number; readonly available: number };

/** Campaign number of a slot: 1-1 is 1, 2-1 is 6, 11-5 is 55. */
export function slotNumber(slot: string): number {
  const [stage, level] = slot.split('-').map(Number);
  return ((stage ?? 1) - 1) * 5 + (level ?? 1);
}

/** Slots in campaign order. */
export function inCampaignOrder(slots: Iterable<string>): string[] {
  return [...slots].sort((a, b) => slotNumber(a) - slotNumber(b));
}

/** The random pool's levels that are in the game (`built`), in campaign order. */
export function randomPool(built: ReadonlySet<string>): string[] {
  return RANDOM_POOL.filter((id) => built.has(id));
}

/** The levels a run of `c` may draw at random: the pool's levels in `levels`, minus its named. */
function randomCandidates(c: ChallengeDef, levels: ReadonlySet<string>): string[] {
  const named = new Set(namedSlots(c));
  return randomPool(levels).filter((id) => !named.has(id));
}

/** Why `c` cannot be played when the game holds the levels `built`, or null when it can. */
export function unplayable(c: ChallengeDef, built: ReadonlySet<string>): Unplayable | null {
  if (c.duel !== null) return { kind: 'duel' };
  const missing = namedSlots(c).filter((id) => !built.has(id));
  if (missing.length > 0) return { kind: 'levels', missing };
  const needed = randomCount(c);
  if (needed > 0) {
    const available = randomCandidates(c, built).length;
    if (available < needed) return { kind: 'pool', needed, available };
  }
  if (isPick(c) && built.size === 0) return { kind: 'levels', missing: [] };
  return null;
}

/** Not shown: a duel, or a challenge whose levels are not all in the game (`built`). */
export function isHidden(c: ChallengeDef, built: ReadonlySet<string>): boolean {
  return unplayable(c, built) !== null;
}

/**
 * The Adventure levels still to beat before `c` opens, in campaign order; empty once it is open.
 * `beaten` holds the levels beaten in the Adventure. Every level the challenge names must be
 * beaten. A run of random levels needs as many beaten levels it can draw (random pool levels in
 * the game, not named by it) as it draws; until then the list holds the next ones in campaign
 * order. The pick needs one beaten level: the first in the game until then.
 */
export function levelsToOpen(
  c: ChallengeDef,
  built: ReadonlySet<string>,
  beaten: ReadonlySet<string>,
): string[] {
  const out = namedSlots(c).filter((id) => !beaten.has(id));
  const needed = randomCount(c);
  if (needed > 0) {
    const candidates = randomCandidates(c, built);
    const have = candidates.filter((id) => beaten.has(id)).length;
    if (have < needed) {
      out.push(...candidates.filter((id) => !beaten.has(id)).slice(0, needed - have));
    }
  }
  if (isPick(c) && ![...built].some((id) => beaten.has(id))) {
    const first = inCampaignOrder(built)[0];
    if (first !== undefined) out.push(first);
  }
  return inCampaignOrder(out);
}

/** The levels a run's random levels are drawn from: beaten random pool levels in the game. */
export function drawPool(built: ReadonlySet<string>, beaten: ReadonlySet<string>): string[] {
  return randomPool(built).filter((id) => beaten.has(id));
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
