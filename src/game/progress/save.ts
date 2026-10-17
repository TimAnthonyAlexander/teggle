// Saved progress (spec 8; spec 14.1: no backend, progress lives in the browser). One record under
// a versioned localStorage key: the campaign position, per level its tries, wins, best score,
// full clear mark, top five scores and the score of its campaign clear, and per challenge its
// tries, passes and best run. The campaign total the HUD shows, the unlocked stages, the masters
// met and the open challenge groups all follow from those.
//
// The record is untrusted: it is validated with Zod field by field, so a damaged field falls back
// to its default and a damaged level or challenge entry is dropped, never the whole save. A save
// written before the challenges existed has no challenge entries and reads as having none; the
// format version stays 1. Every function here is pure; store.ts does the reading and writing.

import { z } from 'zod';
import { LEVELS_PER_STAGE, STAGE_COUNT } from '../../level/campaign';
import {
  CHALLENGE_GROUPS,
  CHALLENGES_PER_GROUP,
  challengeById,
  GROUP_COUNT,
} from '../../rules/challenges';
import { MASTERS } from '../../rules/masters';
import { POWER_IDS, type PowerId } from '../../rules/powers/ids';

export const SAVE_VERSION = 1;
/** The key carries the version, so a later format can read this one and migrate it. */
export const SAVE_KEY = `teggle.save.v${SAVE_VERSION}`;
/** Scores kept per level for the level select's ranked list. */
export const TOP_SCORES = 5;
/** Campaign levels in play order (spec 8: 11 stages of 5). */
export const CAMPAIGN_LEVELS = STAGE_COUNT * LEVELS_PER_STAGE;
/** Challenges start unlocking once this stage is complete (spec 8). */
export const CHALLENGES_AFTER_STAGE = 3;
/**
 * Challenge groups that open one by one, in page order: the first when stage 3 is complete, one
 * more with each stage after it, up to stage 10; the rest open with the campaign (spec 14.2).
 */
export const GROUPS_OPENED_BY_STAGES = 8;

export interface ScoreEntry {
  readonly score: number;
  /** The master whose power the green pegs triggered, or null for none. */
  readonly master: PowerId | null;
  /** Local calendar date of the win, YYYY-MM-DD. */
  readonly date: string;
}

export interface LevelRecord {
  /** Attempts started: an attempt counts once its first shot leaves the cannon. */
  readonly tries: number;
  readonly wins: number;
  /** Every peg and brick was cleared in a win at least once. */
  readonly fullClear: boolean;
  /** Best winning score. */
  readonly best: number;
  /** The winning score of the level's campaign clear, or null before it. */
  readonly campaignScore: number | null;
  /** Best winning scores, highest first, at most TOP_SCORES. */
  readonly top: readonly ScoreEntry[];
}

export interface CampaignPosition {
  /** Campaign number (1 to 55) of the next level to play; CAMPAIGN_LEVELS + 1 once all are done. */
  readonly next: number;
  /** Try number the next attempt at that level gets (the clear bonus depends on it, spec 5). */
  readonly try: number;
  /** The master last picked for a Master level (stage 11), or null. */
  readonly pick: PowerId | null;
}

export interface ChallengeRecord {
  /** Runs started: a run counts once the first shot of its first level leaves the cannon. */
  readonly tries: number;
  /** Runs that passed. One is the medal. */
  readonly passes: number;
  /** Most levels won in one run. */
  readonly bestLevels: number;
  /** Best total of a run that won every level, passed or not (a cup missed by a little), or null. */
  readonly best: number | null;
  /** Local date of the first pass, YYYY-MM-DD, or null. */
  readonly passedOn: string | null;
}

export interface Progress {
  readonly version: typeof SAVE_VERSION;
  readonly campaign: CampaignPosition;
  /** Keyed by campaign level id, e.g. "1-3". */
  readonly levels: Readonly<Record<string, LevelRecord>>;
  /** Keyed by challenge id, e.g. "orange-1.3" (src/rules/challenges.ts). */
  readonly challenges: Readonly<Record<string, ChallengeRecord>>;
}

const LEVEL_ID = /^(?:[1-9]|1[01])-[1-5]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const count = z.int().min(0).max(1e9);
const points = z.int().min(0).max(1e12);

const scoreEntrySchema = z.strictObject({
  score: points,
  master: z.enum(POWER_IDS).nullable(),
  date: z.string().regex(DATE),
});

/** Keeps the valid entries, best first. */
const topSchema = z
  .array(z.unknown())
  .catch([])
  .transform((list) => {
    const out: ScoreEntry[] = [];
    for (const item of list) {
      const r = scoreEntrySchema.safeParse(item);
      if (r.success) out.push(r.data);
    }
    return sortTop(out);
  });

const levelSchema = z.object({
  tries: count.catch(0),
  wins: count.catch(0),
  fullClear: z.boolean().catch(false),
  best: points.catch(0),
  campaignScore: points.nullable().catch(null),
  top: topSchema,
});

const challengeSchema = z.object({
  tries: count.catch(0),
  passes: count.catch(0),
  bestLevels: z.int().min(0).max(100).catch(0),
  best: points.nullable().catch(null),
  passedOn: z.string().regex(DATE).nullable().catch(null),
});

const EMPTY_POSITION: CampaignPosition = { next: 1, try: 1, pick: null };

const campaignSchema = z
  .object({
    next: z
      .int()
      .min(1)
      .max(CAMPAIGN_LEVELS + 1)
      .catch(EMPTY_POSITION.next),
    try: z.int().min(1).max(1e9).catch(EMPTY_POSITION.try),
    pick: z.enum(POWER_IDS).nullable().catch(null),
  })
  .catch(EMPTY_POSITION);

export function emptyProgress(): Progress {
  return { version: SAVE_VERSION, campaign: EMPTY_POSITION, levels: {}, challenges: {} };
}

export function emptyLevel(): LevelRecord {
  return { tries: 0, wins: 0, fullClear: false, best: 0, campaignScore: null, top: [] };
}

export function emptyChallenge(): ChallengeRecord {
  return { tries: 0, passes: 0, bestLevels: 0, best: null, passedOn: null };
}

/** The valid entries of an untrusted record's object field, by key. */
function entries<T>(
  raw: unknown,
  keyOk: (key: string) => boolean,
  schema: z.ZodType<T>,
): Record<string, T> {
  const out: Record<string, T> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    if (!keyOk(key) || typeof value !== 'object' || value === null) continue;
    const r = schema.safeParse(value);
    if (r.success) out[key] = r.data;
  }
  return out;
}

/** Reads a stored record. Anything unreadable gives the defaults for the part it spoils. */
export function parseProgress(raw: string | null | undefined): Progress {
  if (raw === null || raw === undefined || raw === '') return emptyProgress();
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return emptyProgress();
  }
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return emptyProgress();
  const record = data as Record<string, unknown>;
  if (record.version !== SAVE_VERSION) return emptyProgress();
  return {
    version: SAVE_VERSION,
    campaign: campaignSchema.parse(record.campaign),
    levels: entries(record.levels, (id) => LEVEL_ID.test(id), levelSchema),
    // Challenges the game no longer has are dropped.
    challenges: entries(record.challenges, (id) => challengeById(id) !== null, challengeSchema),
  };
}

export function serializeProgress(p: Progress): string {
  return JSON.stringify(p);
}

// ---------------------------------------------------------------------------------------------
// Queries

export function levelRecord(p: Progress, id: string): LevelRecord {
  return p.levels[id] ?? emptyLevel();
}

export function isCleared(p: Progress, id: string): boolean {
  return (p.levels[id]?.wins ?? 0) > 0;
}

/** Campaign stage (1 to 11) of a campaign level number. */
export function stageOfNumber(n: number): number {
  return Math.min(STAGE_COUNT, Math.max(1, Math.ceil(n / LEVELS_PER_STAGE)));
}

/** Campaign level id ("3-2") of a campaign level number (1 to 55). */
export function idOfNumber(n: number): string {
  const stage = stageOfNumber(n);
  return `${stage}-${n - (stage - 1) * LEVELS_PER_STAGE}`;
}

/** Campaign level number of an id, or null for anything else. */
export function numberOfId(id: string): number | null {
  if (!LEVEL_ID.test(id)) return null;
  const [s, l] = id.split('-').map(Number);
  if (s === undefined || l === undefined) return null;
  return (s - 1) * LEVELS_PER_STAGE + l;
}

export function campaignFinished(p: Progress): boolean {
  return p.campaign.next > CAMPAIGN_LEVELS;
}

/** The highest stage the player has reached: the stage of the next level, 11 once done. */
export function unlockedStage(p: Progress): number {
  return campaignFinished(p) ? STAGE_COUNT : stageOfNumber(p.campaign.next);
}

/** Stages 1 to n - 1 are complete. */
export function stagesComplete(p: Progress): number {
  return campaignFinished(p) ? STAGE_COUNT : stageOfNumber(p.campaign.next) - 1;
}

/** The masters the player has met: one per stage reached; all ten from the Master levels on. */
export function unlockedMasters(p: Progress): PowerId[] {
  const stage = unlockedStage(p);
  return MASTERS.filter((m) => m.stage <= stage).map((m) => m.power);
}

export function isMasterUnlocked(p: Progress, power: PowerId): boolean {
  return unlockedMasters(p).includes(power);
}

/** The campaign's total score: the winning scores of every campaign clear (the HUD's TOTAL). */
export function campaignTotal(p: Progress): number {
  let total = 0;
  for (const r of Object.values(p.levels)) total += r.campaignScore ?? 0;
  return total;
}

/** Sum of the campaign clears of one stage's levels. */
export function stageTotal(p: Progress, stage: number): number {
  let total = 0;
  for (let l = 1; l <= LEVELS_PER_STAGE; l++) {
    total += p.levels[`${stage}-${l}`]?.campaignScore ?? 0;
  }
  return total;
}

/** Levels cleared in the campaign. */
export function campaignCleared(p: Progress): number {
  return Math.min(CAMPAIGN_LEVELS, p.campaign.next - 1);
}

export type ChallengeState = 'locked' | 'partly' | 'open';

/**
 * How many challenge groups are open, in page order (spec 8: they start unlocking after stage 3
 * and are all open after the campaign; spec 14.2 for the steps between): none before stage 3 is
 * complete, then one per stage complete from stage 3 to stage 10 (eight), and all 15 once the
 * campaign is finished.
 */
export function openGroups(p: Progress): number {
  if (campaignFinished(p)) return GROUP_COUNT;
  const steps = stagesComplete(p) - CHALLENGES_AFTER_STAGE + 1;
  return Math.max(0, Math.min(GROUPS_OPENED_BY_STAGES, steps));
}

/**
 * The stage whose completion opens group `index` (0-based, page order), or null for the groups
 * that open with the whole campaign.
 */
export function groupOpensAfterStage(index: number): number | null {
  return index < GROUPS_OPENED_BY_STAGES ? CHALLENGES_AFTER_STAGE + index : null;
}

/** Challenges unlock after stage 3 and fully after the campaign (spec 8). */
export function challengeState(p: Progress): ChallengeState {
  const open = openGroups(p);
  return open === 0 ? 'locked' : open >= GROUP_COUNT ? 'open' : 'partly';
}

export function challengeRecord(p: Progress, id: string): ChallengeRecord {
  return p.challenges[id] ?? emptyChallenge();
}

export function isPassed(p: Progress, id: string): boolean {
  return (p.challenges[id]?.passes ?? 0) > 0;
}

/** Challenges passed, over all groups, or in one group. */
export function passedCount(p: Progress, group?: string): number {
  let n = 0;
  for (const g of CHALLENGE_GROUPS) {
    if (group !== undefined && g.id !== group) continue;
    for (let i = 1; i <= CHALLENGES_PER_GROUP; i++) if (isPassed(p, `${g.id}.${i}`)) n++;
  }
  return n;
}

// ---------------------------------------------------------------------------------------------
// Updates (pure: each returns a new record)

function withLevel(p: Progress, id: string, f: (r: LevelRecord) => LevelRecord): Progress {
  return { ...p, levels: { ...p.levels, [id]: f(levelRecord(p, id)) } };
}

function sortTop(list: readonly ScoreEntry[]): ScoreEntry[] {
  // Stable: an earlier entry stays ahead of a later one with the same score.
  return list
    .map((e, i) => ({ e, i }))
    .sort((a, b) => b.e.score - a.e.score || a.i - b.i)
    .slice(0, TOP_SCORES)
    .map((x) => x.e);
}

export interface AttemptStart {
  readonly levelId: string;
  /** The level's campaign number when the attempt is a campaign attempt, else null. */
  readonly campaignNumber: number | null;
}

/**
 * An attempt's first shot left the cannon: one more try at the level. In the campaign, at the
 * current level, the next attempt gets the next try number, so quitting or restarting cannot
 * keep a first-try bonus.
 */
export function recordAttemptStart(p: Progress, a: AttemptStart): Progress {
  const next = withLevel(p, a.levelId, (r) => ({ ...r, tries: r.tries + 1 }));
  if (a.campaignNumber === null || a.campaignNumber !== p.campaign.next) return next;
  return { ...next, campaign: { ...next.campaign, try: next.campaign.try + 1 } };
}

export interface Win extends AttemptStart {
  readonly score: number;
  readonly fullClear: boolean;
  readonly master: PowerId | null;
  readonly date: string;
}

/**
 * A won attempt: wins, best score, full clear and top scores. A campaign win at the current
 * level keeps its score as the level's campaign score and moves the campaign to the next level
 * at try 1.
 */
export function recordWin(p: Progress, w: Win): Progress {
  const score = Math.max(0, Math.round(w.score));
  const campaign = w.campaignNumber !== null && w.campaignNumber === p.campaign.next;
  const next = withLevel(p, w.levelId, (r) => ({
    ...r,
    wins: r.wins + 1,
    fullClear: r.fullClear || w.fullClear,
    best: Math.max(r.best, score),
    campaignScore: campaign && r.campaignScore === null ? score : r.campaignScore,
    top: sortTop([...r.top, { score, master: w.master, date: w.date }]),
  }));
  if (!campaign) return next;
  return {
    ...next,
    campaign: {
      ...next.campaign,
      next: Math.min(CAMPAIGN_LEVELS + 1, p.campaign.next + 1),
      try: 1,
    },
  };
}

function withChallenge(
  p: Progress,
  id: string,
  f: (r: ChallengeRecord) => ChallengeRecord,
): Progress {
  return { ...p, challenges: { ...p.challenges, [id]: f(challengeRecord(p, id)) } };
}

/** A challenge run's first shot left the cannon: one more try at the challenge. */
export function recordChallengeStart(p: Progress, id: string): Progress {
  return withChallenge(p, id, (r) => ({ ...r, tries: r.tries + 1 }));
}

export interface ChallengeEnd {
  readonly id: string;
  readonly passed: boolean;
  /** Levels won in the run. */
  readonly levelsWon: number;
  /** Total of the run's levels when it won every one of them, else null. */
  readonly total: number | null;
  readonly date: string;
}

/** A challenge run is over (passed, failed or given up): its passes, best run and medal date. */
export function recordChallengeEnd(p: Progress, e: ChallengeEnd): Progress {
  const total = e.total === null ? null : Math.max(0, Math.round(e.total));
  return withChallenge(p, e.id, (r) => ({
    ...r,
    passes: r.passes + (e.passed ? 1 : 0),
    bestLevels: Math.max(r.bestLevels, e.levelsWon),
    best: total === null ? r.best : Math.max(r.best ?? 0, total),
    passedOn: r.passedOn ?? (e.passed ? e.date : null),
  }));
}

/** Remembers the master picked for the Master levels. */
export function recordPick(p: Progress, power: PowerId): Progress {
  return { ...p, campaign: { ...p.campaign, pick: power } };
}

/** Today's local date as YYYY-MM-DD. */
export function localDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}
