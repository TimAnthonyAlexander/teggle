// The challenge run in play, and what the challenge screens share: which challenges are shown
// (their levels are in the game) and open (the player has beaten those levels in the Adventure),
// how a level is named, and the DEV ONLY unlock. A run lives in memory only: a reload ends it,
// its try already counted.

import { LEVELS_PER_STAGE, type CampaignManifest } from '../../level/campaign';
import {
  CHALLENGE_GROUPS,
  challengesOf,
  isHidden,
  levelsToOpen,
  type ChallengeDef,
  type ChallengeGroup,
  type ChallengeRun,
} from '../../rules/challenges';
import type { PowerId } from '../../rules/powers';
import type { Route } from '../app/router';
import {
  beatenInAdventure,
  isPassed,
  localDate,
  recordChallengeEnd,
  type Progress,
} from '../progress/save';
import type { ProgressStore } from '../progress/store';
import { manifestLevels } from './manifest';

// ---------------------------------------------------------------------------------------------
// DEV ONLY unlock

let devAll = false;

/**
 * DEV ONLY: `#/challenges?unlock=all` on the dev server counts every level in the game as beaten
 * for the challenges, for the rest of the session, without writing the save; production builds
 * ignore it. Challenges whose levels are not in the game stay hidden.
 */
export function applyDevUnlock(route: Route): void {
  if (import.meta.env.DEV && route.params.get('unlock') === 'all') devAll = true;
}

export function devUnlocked(): boolean {
  return import.meta.env.DEV && devAll;
}

// ---------------------------------------------------------------------------------------------
// What is shown and open (spec 14.2)

/** The campaign slots the manifest holds. */
export function builtSlots(m: CampaignManifest): Set<string> {
  return new Set(manifestLevels(m).map((l) => l.level.id));
}

/** The levels in the game the player has beaten in the Adventure (all of them with the DEV unlock). */
export function beatenSlots(p: Progress, built: ReadonlySet<string>): Set<string> {
  if (devUnlocked()) return new Set(built);
  return new Set([...built].filter((id) => beatenInAdventure(p, id)));
}

export interface ChallengeStatus {
  readonly def: ChallengeDef;
  /** Not shown: a duel, or its levels are not all in the game. */
  readonly hidden: boolean;
  /** Adventure levels still to beat before it opens, in campaign order; empty once open. */
  readonly toOpen: readonly string[];
  /** Shown and open. */
  readonly playable: boolean;
}

export function challengeStatus(
  built: ReadonlySet<string>,
  beaten: ReadonlySet<string>,
  def: ChallengeDef,
): ChallengeStatus {
  const hidden = isHidden(def, built);
  const toOpen = hidden ? [] : levelsToOpen(def, built, beaten);
  return { def, hidden, toOpen, playable: !hidden && toOpen.length === 0 };
}

/** A group's shown challenges with their state, in order. */
export interface GroupStatus {
  readonly group: ChallengeGroup;
  readonly challenges: readonly ChallengeStatus[];
}

/** The groups with something to show, in page order, each with its shown challenges. */
export function shownGroups(p: Progress, built: ReadonlySet<string>): GroupStatus[] {
  const beaten = beatenSlots(p, built);
  const out: GroupStatus[] = [];
  for (const group of CHALLENGE_GROUPS) {
    const challenges = challengesOf(group.id)
      .map((c) => challengeStatus(built, beaten, c))
      .filter((s) => !s.hidden);
    if (challenges.length > 0) out.push({ group, challenges });
  }
  return out;
}

/** Where the challenges stand, for the main menu and the stage intro card. */
export interface ChallengeSummary {
  /** Challenges shown. */
  readonly shown: number;
  /** Shown and open. */
  readonly open: number;
  /** Shown and passed. */
  readonly passed: number;
  /** While none is open: the levels to beat in the Adventure to open the first ones. */
  readonly firstToOpen: readonly string[];
}

export function challengeSummary(p: Progress, built: ReadonlySet<string>): ChallengeSummary {
  const all = shownGroups(p, built).flatMap((g) => g.challenges);
  const open = all.filter((s) => s.playable).length;
  let first: readonly string[] = [];
  if (open === 0) {
    // The challenge that opens soonest: its last level to beat comes first in the campaign.
    let best = Infinity;
    for (const s of all) {
      const last = s.toOpen.at(-1);
      const n = last === undefined ? Infinity : numberOfSlot(last);
      if (n < best) {
        best = n;
        first = s.toOpen;
      }
    }
  }
  return {
    shown: all.length,
    open,
    passed: all.filter((s) => isPassed(p, s.def.id)).length,
    firstToOpen: first,
  };
}

/** A level's name ("The Sky Tree") for one in the manifest, "Level 4-3" for one that is not. */
export function levelNamer(m: CampaignManifest): (slot: string) => string {
  const names = new Map(manifestLevels(m).map((l) => [l.level.id, l.level.name]));
  return (slot) => names.get(slot) ?? `Level ${slot}`;
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
