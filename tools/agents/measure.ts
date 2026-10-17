// Shared by the self-play tools: turning targets and agents into a batch, playing it on the pool,
// and the per-level metrics of every (level, agent) pair.

import type { AgentSpec } from '../../src/agents/agent';
import { levelMetrics, type LevelMetrics } from '../../src/agents/metrics';
import { flaggedIds, type RunResult } from '../../src/agents/run';
import { attemptConfigSchema, type AttemptConfig, type OrangeDraw } from '../../src/rules/config';
import { isPowerId } from '../../src/rules/powers/ids';
import { compileLevel } from '../../src/sim/compile';
import type { AgentPool, BatchStats, Task } from './pool';
import { TargetError, type Target } from './targets';

export interface Overrides {
  readonly balls?: number;
  readonly orange?: number;
  /** A power id, 'none' for no power, or 'any' for a master drawn per run. */
  readonly power?: string;
  /** The orange draw instead of the target's own. */
  readonly draw?: OrangeDraw;
}

/** A target's rules with the command line's overrides. */
export function targetRules(
  target: Target,
  o: Overrides,
): { config: AttemptConfig; anyMaster: boolean } {
  let anyMaster = target.anyMaster;
  let power = target.config.power;
  if (o.power !== undefined) {
    if (o.power === 'none') {
      power = null;
      anyMaster = false;
    } else if (o.power === 'any') {
      power = null;
      anyMaster = true;
    } else if (isPowerId(o.power)) {
      power = o.power;
      anyMaster = false;
    } else {
      throw new TargetError(`unknown power "${o.power}"`);
    }
  }
  const config = attemptConfigSchema.parse({
    ...target.config,
    power,
    ...(o.balls === undefined ? {} : { balls: o.balls }),
    ...(o.orange === undefined ? {} : { orangeCount: o.orange }),
    ...(o.draw === undefined ? {} : { orangeDraw: o.draw }),
  });
  const flagged = target.level.elements.filter((e) => 'canBeOrange' in e && e.canBeOrange).length;
  if (config.orangeCount > flagged) {
    throw new TargetError(
      `${target.key} flags ${flagged} pegs as can-be-orange, fewer than ${config.orangeCount}`,
    );
  }
  return { config, anyMaster };
}

export interface Measured {
  readonly target: Target;
  readonly agent: AgentSpec;
  readonly config: AttemptConfig;
  readonly anyMaster: boolean;
  readonly results: readonly RunResult[];
  readonly metrics: LevelMetrics;
}

/** Plays `runs` runs of every agent on every target. Results come per target, then per agent. */
export async function measure(
  pool: AgentPool,
  targets: readonly Target[],
  agents: readonly AgentSpec[],
  options: { runs: number; seed: number; overrides: Overrides },
  progress?: (done: number, total: number) => void,
): Promise<{ measured: Measured[]; stats: BatchStats }> {
  const tasks: Task[] = [];
  const rules = targets.map((t) => targetRules(t, options.overrides));
  targets.forEach((t, level) => {
    const r = rules[level];
    if (r === undefined) return;
    for (const agent of agents) {
      tasks.push({
        level,
        runs: options.runs,
        setup: {
          levelKey: t.key,
          config: r.config,
          anyMaster: r.anyMaster,
          agent,
          baseSeed: options.seed,
        },
      });
    }
  });
  const { results, stats } = await pool.run(
    targets.map((t) => t.level),
    tasks,
    progress,
  );
  const flagged = targets.map((t) => flaggedIds(compileLevel(t.level)));
  const measured = tasks.map((task, i): Measured => {
    const target = targets[task.level];
    if (target === undefined) throw new Error(`task ${i} has no target`);
    const runs = results[i] ?? [];
    return {
      target,
      agent: task.setup.agent,
      config: task.setup.config,
      anyMaster: task.setup.anyMaster,
      results: runs,
      metrics: levelMetrics(runs, flagged[task.level] ?? []),
    };
  });
  return { measured, stats };
}

/** "11000 runs in 612 s on 5 workers: 3.10 M ticks/s, 1078 runs/min". */
export function speedLine(stats: BatchStats, workers: number): string {
  const seconds = stats.wallMs / 1000;
  const ticksPerSecond = stats.ticks / seconds;
  const perWorker = stats.ticks / (stats.workMs / 1000);
  return (
    `${stats.runs} runs in ${seconds.toFixed(1)} s on ${workers} workers: ` +
    `${(ticksPerSecond / 1e6).toFixed(2)} M ticks/s (${(perWorker / 1e6).toFixed(2)} per worker), ` +
    `${Math.round((stats.runs / seconds) * 60)} runs/min`
  );
}

export function speedJson(stats: BatchStats, workers: number): Record<string, number> {
  const seconds = stats.wallMs / 1000;
  return {
    workers,
    runs: stats.runs,
    wallSeconds: seconds,
    ticks: stats.ticks,
    ticksPerSecond: stats.ticks / seconds,
    ticksPerWorkerSecond: stats.ticks / (stats.workMs / 1000),
    runsPerMinute: (stats.runs / seconds) * 60,
  };
}
