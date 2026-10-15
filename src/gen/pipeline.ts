// The whole road from a recipe to a level file, shared by `npm run campaign:build` and the line
// editor so both write the same bytes: fit the recipe to its object count (fit.ts), apply its
// manual edits, give the level its picture, round-trip it through the file format, run the
// validity checks and then the full reachability and stuck checks (fix.ts), and accept the level
// only when it has exactly its count, enough can-be-orange objects and no stuck spot left.

import { parseLevel, type Level } from '../level/schema';
import type { CheckConfig, CheckResult } from './check';
import { fitCount, type FitResult } from './fit';
import { checkAndFix, type CheckReport, type JobRunner } from './fix';
import type { RecipeInput } from './recipe';
import { levelJson } from './serialize';
import { levelStats, type LevelStats } from './stats';
import { validateLevel, type Issue } from './validate';

/** Every level must leave room for a 55-orange challenge plus green and purple (spec 3). */
export const MIN_CAN_BE_ORANGE = 58;

export interface PipelineResult {
  readonly fit: FitResult;
  /** The level as written (after the checks when they ran). */
  readonly level: Level;
  readonly issues: readonly Issue[];
  readonly check: { readonly report: CheckReport; readonly result: CheckResult } | null;
  readonly stats: LevelStats;
  /** Why the level may not be written; empty when it may. */
  readonly failures: readonly string[];
  /** The level file's text, when the checks ran and nothing failed. */
  readonly text: string | null;
}

export interface PipelineOptions {
  /** Runs the check jobs; null skips the reachability and stuck checks. */
  readonly run: JobRunner | null;
  readonly config?: Partial<CheckConfig>;
}

export async function runPipeline(
  recipe: RecipeInput,
  seed: number,
  background: string,
  options: PipelineOptions,
): Promise<PipelineResult> {
  const fit = fitCount(recipe, seed);
  // Round-trip through the file format so the checks see exactly what gets written.
  let level = parseLevel(JSON.parse(levelJson({ ...fit.generated.level, background })));
  const issues = validateLevel(level);
  const failures: string[] = [...fit.generated.edits.errors];
  if (issues.length > 0) failures.push(`${issues.length} validity issue(s)`);
  let check: PipelineResult['check'] = null;
  if (options.run !== null && failures.length === 0) {
    const checked = await checkAndFix(level, options.run, { ...options.config, seed });
    level = checked.level;
    check = { report: checked.report, result: checked.result };
    const r = checked.report;
    if (r.remainingSpots > 0) failures.push(`${r.remainingSpots} stuck spot(s) remain`);
    if (r.unfixable.length > 0) {
      failures.push(`${r.unfixable.length} stuck spot(s) touch no peg or brick`);
    }
  }
  const stats = levelStats(level);
  if (stats.scoring !== fit.target) {
    failures.push(`${stats.scoring} objects, the level needs ${fit.target}`);
  }
  if (check !== null && stats.canBeOrange < MIN_CAN_BE_ORANGE) {
    failures.push(`only ${stats.canBeOrange} can-be-orange objects (need ${MIN_CAN_BE_ORANGE})`);
  }
  const text = check !== null && failures.length === 0 ? levelJson(level) : null;
  return { fit, level, issues, check, stats, failures, text };
}
