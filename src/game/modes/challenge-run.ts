// The challenge run in play, and what the challenge screens share: which challenges are open
// and playable with the levels the manifest holds, how a level is named, and the DEV ONLY
// unlock. A run lives in memory only: a reload ends it, its try already counted.

import { LEVELS_PER_STAGE, type CampaignManifest } from '../../level/campaign';
import {
  CHALLENGE_GROUPS,
  challengesOf,
  unplayable,
  type ChallengeDef,
  type ChallengeRun,
  type Unplayable,
} from '../../rules/challenges';
import type { PowerId } from '../../rules/powers';
import type { Route } from '../app/router';
import {
  groupOpensAfterStage,
  localDate,
  openGroups,
  recordChallengeEnd,
  type Progress,
} from '../progress/save';
import type { ProgressStore } from '../progress/store';
import { manifestLevels } from './manifest';

// ---------------------------------------------------------------------------------------------
// DEV ONLY unlock

let devAll = false;

/**
 * DEV ONLY: `#/challenges?unlock=all` on the dev server opens every challenge group for the rest
 * of the session, without writing the save; production builds ignore it. Challenges whose levels
 * are not in the game stay locked: they cannot be played either way.
 */
export function applyDevUnlock(route: Route): void {
  if (import.meta.env.DEV && route.params.get('unlock') === 'all') devAll = true;
}

export function devUnlocked(): boolean {
  return import.meta.env.DEV && devAll;
}

// ---------------------------------------------------------------------------------------------
// What is open and playable

/** The campaign slots the manifest holds. */
export function builtSlots(m: CampaignManifest): Set<string> {
  return new Set(manifestLevels(m).map((l) => l.level.id));
}

/** Group `index` (0-based, page order) is open for the save (spec 8, 14.2). */
export function groupOpen(p: Progress, index: number): boolean {
  return devUnlocked() || index < openGroups(p);
}

export interface ChallengeStatus {
  readonly def: ChallengeDef;
  /** Its group is open. */
  readonly open: boolean;
  /** The stage that opens its group, or null for the groups that open with the campaign. */
  readonly opensAfter: number | null;
  /** Why it cannot be played with the levels in the game, or null. */
  readonly unplayable: Unplayable | null;
  /** Open and playable. */
  readonly playable: boolean;
}

export function challengeStatus(
  p: Progress,
  built: ReadonlySet<string>,
  def: ChallengeDef,
): ChallengeStatus {
  const index = CHALLENGE_GROUPS.findIndex((g) => g.id === def.group);
  const open = groupOpen(p, index);
  const why = unplayable(def, built);
  return {
    def,
    open,
    opensAfter: groupOpensAfterStage(index),
    unplayable: why,
    playable: open && why === null,
  };
}

/** The five challenges of a group with their state. */
export function groupStatus(
  p: Progress,
  built: ReadonlySet<string>,
  groupId: string,
): ChallengeStatus[] {
  return challengesOf(groupId).map((c) => challengeStatus(p, built, c));
}

/** "1-3 The Sky Tree" for a level in the manifest, "level 4-3" for one that is not. */
export function levelNamer(m: CampaignManifest): (slot: string) => string {
  const names = new Map(manifestLevels(m).map((l) => [l.level.id, l.level.name]));
  return (slot) => {
    const name = names.get(slot);
    return name === undefined ? `level ${slot}` : `${slot} ${name}`;
  };
}

/** The campaign stage of a slot ("4-3" is stage 4). */
export function stageOfSlot(slot: string): number {
  const stage = Number(slot.split('-')[0]);
  return Number.isInteger(stage) ? stage : 1;
}

/** Campaign number of a slot, 1 to 55. */
export function numberOfSlot(slot: string): number {
  const [s, l] = slot.split('-').map(Number);
  return ((s ?? 1) - 1) * LEVELS_PER_STAGE + (l ?? 1);
}

// ---------------------------------------------------------------------------------------------
// The run in play

export interface ActiveRun {
  readonly def: ChallengeDef;
  readonly power: PowerId;
  /** The picked level of a pick challenge, or null. */
  readonly pick: string | null;
  /** Where Try Again and Restart Challenge lead: a new run with the same master (and pick). */
  readonly startHash: string;
  run: ChallengeRun;
  /** The run's first shot left the cannon, so it counted as a try. */
  counted: boolean;
  /** Its end is written to the save. */
  recorded: boolean;
}

let active: ActiveRun | null = null;

export function activeRun(): ActiveRun | null {
  return active;
}

/**
 * Makes `next` the run in play. A run still going that counted as a try is given up: its end
 * (the levels it won) goes to the save.
 */
export function setActiveRun(store: ProgressStore, next: ActiveRun | null): void {
  if (active !== null && active !== next) endRun(store, active);
  active = next;
}

/** Writes a run's end to the save once: passed, failed or given up. */
export function endRun(store: ProgressStore, r: ActiveRun): void {
  if (r.recorded || !r.counted) return;
  r.recorded = true;
  const run = r.run;
  const complete = run.won === run.levels.length;
  store.update((p) =>
    recordChallengeEnd(p, {
      id: r.def.id,
      passed: run.status === 'passed',
      levelsWon: run.won,
      total: complete ? run.total : null,
      date: localDate(new Date()),
    }),
  );
}
