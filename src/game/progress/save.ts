// Saved progress (spec 8; spec 14.1: no backend, progress lives in the browser). One record under
// a versioned localStorage key: the campaign position, and per level its tries, wins, best score,
// full clear mark, top five scores and the score of its campaign clear. The campaign total the HUD
// shows, the unlocked stages and the masters met all follow from those.
//
// The record is untrusted: it is validated with Zod field by field, so a damaged field falls back
// to its default and a damaged level entry is dropped, never the whole save. Every function here
// is pure; store.ts does the reading and writing.

import { z } from 'zod';
import { LEVELS_PER_STAGE, STAGE_COUNT } from '../../level/campaign';
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

export interface Progress {
  readonly version: typeof SAVE_VERSION;
  readonly campaign: CampaignPosition;
  /** Keyed by campaign level id, e.g. "1-3". */
  readonly levels: Readonly<Record<string, LevelRecord>>;
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
  return { version: SAVE_VERSION, campaign: EMPTY_POSITION, levels: {} };
}

export function emptyLevel(): LevelRecord {
  return { tries: 0, wins: 0, fullClear: false, best: 0, campaignScore: null, top: [] };
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
  const levels: Record<string, LevelRecord> = {};
  const rawLevels = record.levels;
  if (typeof rawLevels === 'object' && rawLevels !== null && !Array.isArray(rawLevels)) {
    for (const [id, value] of Object.entries(rawLevels)) {
      if (!LEVEL_ID.test(id) || typeof value !== 'object' || value === null) continue;
      const r = levelSchema.safeParse(value);
      if (r.success) levels[id] = r.data;
    }
  }
  return { version: SAVE_VERSION, campaign: campaignSchema.parse(record.campaign), levels };
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

/** Challenges unlock after stage 3 and fully after the campaign (spec 8). */
export function challengeState(p: Progress): ChallengeState {
  if (campaignFinished(p)) return 'open';
  return stagesComplete(p) >= CHALLENGES_AFTER_STAGE ? 'partly' : 'locked';
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
