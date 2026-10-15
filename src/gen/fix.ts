// Applies what the checks found, the way the original's designers did it (spec 13.3):
//   - objects at a stuck spot get "quick disappear", so a ball resting on them is freed
//     97 ticks after it lit them (the original's arc bottoms);
//   - objects no sweep ever hit lose "can be orange".
// Stuck fixes change how balls run, so the check repeats until no new spot turns up (or the
// round limit); the reachability result of the last round decides the flags.

import type { Level, LevelElement } from '../level/schema';
import {
  mergeResults,
  planCheck,
  type CheckConfig,
  type CheckPlan,
  type CheckResult,
  type JobResult,
  type StuckSpot,
} from './check';

/** Runs a plan's jobs (in this thread or on workers) and returns every job's result. */
export type JobRunner = (level: Level, plan: CheckPlan) => Promise<JobResult[]>;

export interface CheckReport {
  readonly rounds: number;
  /** Share of can-be-orange objects hit at least once, before flags were cleared. */
  readonly coverage: number;
  /** Objects whose can-be-orange flag was cleared because nothing hit them. */
  readonly unflagged: readonly number[];
  /** Objects given quick disappear. */
  readonly quickDisappear: readonly number[];
  /** Distinct stuck spots fixed that way. */
  readonly spotsFixed: number;
  /** The fixed spots themselves, round by round (the line editor shows where they were). */
  readonly fixed: readonly (StuckSpot & { readonly count: number })[];
  /** Stuck spots of the last round that touch no scoring object (cannot be fixed by flags). */
  readonly unfixable: readonly StuckSpot[];
  /** Stuck spots still found in the last round. */
  readonly remainingSpots: number;
  readonly shots: number;
  readonly ticks: number;
}

function isScoring(e: LevelElement): boolean {
  return e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick';
}

function withFlags(
  level: Level,
  change: (e: LevelElement) => { canBeOrange?: boolean; quickDisappear?: boolean } | null,
): Level {
  return {
    ...level,
    elements: level.elements.map((e) => {
      if (!isScoring(e)) return e;
      const c = change(e);
      return c === null ? e : { ...e, ...c };
    }),
  };
}

function flagged(e: LevelElement): boolean {
  return (e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick') && e.canBeOrange;
}

function quick(e: LevelElement): boolean {
  return (e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick') && e.quickDisappear;
}

export async function checkAndFix(
  level: Level,
  run: JobRunner,
  config: Partial<CheckConfig> = {},
  maxRounds = 3,
): Promise<{ level: Level; report: CheckReport; result: CheckResult }> {
  let current = level;
  let result: CheckResult | null = null;
  const qd = new Set<number>();
  const fixed: (StuckSpot & { count: number })[] = [];
  let spotsFixed = 0;
  let rounds = 0;
  let shots = 0;
  let ticks = 0;
  for (; rounds < maxRounds;) {
    rounds++;
    const plan = planCheck(current, config);
    result = mergeResults(plan, await run(current, plan));
    shots += result.shots;
    ticks += result.ticks;
    const byId = new Map(current.elements.map((e) => [e.id, e]));
    const fresh = result.spots.filter((s) =>
      s.scoring.some((id) => {
        const e = byId.get(id);
        return e !== undefined && !quick(e);
      }),
    );
    // The last round only verifies: its findings are reported, not applied unchecked.
    if (fresh.length === 0 || rounds === maxRounds) break;
    spotsFixed += fresh.length;
    fixed.push(...fresh);
    for (const s of fresh) for (const id of s.scoring) qd.add(id);
    current = withFlags(current, (e) =>
      qd.has(e.id) && !quick(e) ? { quickDisappear: true } : null,
    );
  }
  if (result === null) throw new Error('the check ran no round');
  const final = result;
  const flaggedIds = current.elements.filter(flagged).map((e) => e.id);
  const hitFlagged = flaggedIds.filter((id) => (final.hits.get(id) ?? 0) > 0);
  const unflagged = flaggedIds.filter((id) => (final.hits.get(id) ?? 0) === 0);
  const unflaggedSet = new Set(unflagged);
  current = withFlags(current, (e) => (unflaggedSet.has(e.id) ? { canBeOrange: false } : null));
  const byId = new Map(current.elements.map((e) => [e.id, e]));
  const remaining = final.spots.filter((s) =>
    s.scoring.some((id) => {
      const e = byId.get(id);
      return e !== undefined && !quick(e);
    }),
  );
  return {
    level: current,
    result: final,
    report: {
      rounds,
      coverage: flaggedIds.length === 0 ? 1 : hitFlagged.length / flaggedIds.length,
      unflagged,
      quickDisappear: [...qd].sort((a, b) => a - b),
      spotsFixed,
      fixed,
      unfixable: final.spots.filter((s) => s.scoring.length === 0),
      remainingSpots: remaining.length,
      shots,
      ticks,
    },
  };
}
