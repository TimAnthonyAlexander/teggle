// Challenge pass rates from self-play (spec 13.5; spec 14.2, "Decided in the challenges"). Plays
// every level a challenge needs under its rules with the noisy agent and puts the level runs
// together into whole challenge runs (chains.ts), so the challenges' numbers can be fitted to
// Teggle's levels and compared with the original's challenges on the original's levels at the
// original's numbers.
//
// Chain j plays run j of each of its levels in order. Named levels play as named; random levels
// are drawn per chain from the random pool (its levels in the game for Teggle, all 43 for the
// original); a carried stock plays the next level with the balls the last one left (measured
// with 1 to CARRY_MAX balls); the pick plays every level and reports the best one. Each level's
// run seeds come from its own key, so the chains' level runs are independent. Every level plays
// with its campaign slot's master (any master on the Master levels), greens, purple and no clear
// bonus; the original's with its uniform orange draw.
//
// Usage: npm run agents:challenges -- [challenge or group ids...] [options]
//   --source S     teggle, original or both (default both)
//   --runs N       runs per level and challenge runs per challenge (default 200)
//   --noise X      aim error of the noisy agent in radians (default 0.03)
//   --seed N       base seed (default 1)
//   --workers N    worker threads (default: every core)
//   --same-levels  the original's pick and random pool use only the slots Teggle has built, so
//                  both games' challenge runs face the same slots
//   --out FILE     JSON (default reference/teggle-metrics/challenges-<time>.json)

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { agentSpec } from '../../src/agents/agent';
import { wilson } from '../../src/agents/metrics';
import type { RunResult } from '../../src/agents/run';
import { REFERENCE_NOISE } from '../../src/agents/tuning';
import { Digest } from '../../src/core/digest';
import { Rng } from '../../src/core/rng';
import {
  CHALLENGES,
  carriesBalls,
  isPick,
  levelConfig,
  RANDOM_POOL,
  randomPool,
  resolveLevels,
  type ChallengeDef,
} from '../../src/rules/challenges';
import { attemptConfig, type AttemptConfig } from '../../src/rules/config';
import { DEFAULT_BALLS } from '../../src/rules/tuning';
import {
  CARRY_MAX,
  chainOutcome,
  equalPassScore,
  originalNumbers,
  passes,
  teggleNumbers,
  type ChainOutcome,
  type LevelRun,
  type Numbers,
} from './chains';
import { intOption, METRICS_DIR, noiseList, runMain, stamp, UsageError, writeJson } from './cli';
import { pct, table, thousands } from './format';
import { speedLine } from './measure';
import { AgentPool, defaultWorkers, progressLine, type Task } from './pool';
import { resolveTarget, slotConfig, TargetError, type Target } from './targets';

const DEFAULT_CHALLENGE_RUNS = 200;
const ALL_SLOTS: readonly string[] = Array.from(
  { length: 55 },
  (_, i) => `${Math.floor(i / 5) + 1}-${(i % 5) + 1}`,
);

type SourceName = 'teggle' | 'original';

interface Source {
  readonly name: SourceName;
  /** Slots this source can play, in campaign order. */
  readonly built: readonly string[];
  readonly pool: readonly string[];
  numbers(c: ChallengeDef): Numbers;
  target(slot: string): Target;
  config(c: ChallengeDef, n: Numbers, balls: number, power: string | null): AttemptConfig;
}

function teggleSource(): Source {
  const targets = new Map(resolveTarget('campaign').map((t) => [t.key, t]));
  const built = [...targets.keys()];
  return {
    name: 'teggle',
    built,
    pool: randomPool(new Set(built)),
    numbers: teggleNumbers,
    target: (slot) => {
      const t = targets.get(slot);
      if (t === undefined) throw new Error(`level ${slot} is not in the campaign manifest`);
      return t;
    },
    // Exactly the game's rules for a challenge level.
    config: (c, _n, balls, power) => levelConfig(c, balls, power),
  };
}

/** The original's levels; `slots` limits the pick and the random pool to those slots. */
function originalSource(slots: readonly string[] | null): Source {
  const cache = new Map<string, Target>();
  const built = slots === null ? ALL_SLOTS : ALL_SLOTS.filter((s) => slots.includes(s));
  return {
    name: 'original',
    built,
    pool: RANDOM_POOL.filter((s) => built.includes(s)),
    numbers: originalNumbers,
    target: (slot) => {
      let t = cache.get(slot);
      if (t === undefined) {
        try {
          t = resolveTarget(`original:${slot}`)[0];
        } catch (err) {
          if (!(err instanceof TargetError)) throw err;
        }
        if (t === undefined) throw new Error(`the original's level ${slot} could not be loaded`);
        cache.set(slot, t);
      }
      return t;
    },
    config: (_c, n, balls, power) =>
      attemptConfig({
        orangeCount: n.orange,
        balls,
        greens: true,
        purple: true,
        seededGreens: false,
        power,
        campaignTry: null,
        orangeDraw: 'uniform',
      }),
  };
}

// ---------------------------------------------------------------------------------------------
// What each challenge needs

interface Plan {
  readonly source: Source;
  readonly challenge: ChallengeDef;
  readonly numbers: Numbers;
  /** Why it is not measured in this source, or null. */
  readonly skip: string | null;
}

function planFor(source: Source, c: ChallengeDef): Plan {
  const numbers = source.numbers(c);
  const plan = (skip: string | null): Plan => ({ source, challenge: c, numbers, skip });
  const missing = c.levels.filter(
    (l) => l !== 'random' && l !== 'pick' && !source.built.includes(l),
  );
  if (missing.length > 0) return plan(`not built: ${missing.join(', ')}`);
  const random = c.levels.filter((l) => l === 'random').length;
  if (random > source.pool.length) return plan(`pool has ${source.pool.length} of ${random}`);
  return plan(null);
}

interface Need {
  readonly level: number;
  readonly target: Target;
  readonly config: AttemptConfig;
  readonly anyMaster: boolean;
}

/** The distinct (level, rules) setups to play; each level is sent to the workers once. */
class Needs {
  readonly list: Need[] = [];
  readonly levels: Target[] = [];
  private readonly byKey = new Map<string, number>();
  private readonly levelIndex = new Map<string, number>();

  add(plan: Plan, slot: string, balls: number): number {
    const target = plan.source.target(slot);
    const { config: slotRules, anyMaster } = slotConfig(target.number ?? 1);
    const config = plan.source.config(plan.challenge, plan.numbers, balls, slotRules.power);
    const key = `${target.key}|${JSON.stringify(config)}`;
    const known = this.byKey.get(key);
    if (known !== undefined) return known;
    let level = this.levelIndex.get(target.key);
    if (level === undefined) {
      level = this.levels.length;
      this.levels.push(target);
      this.levelIndex.set(target.key, level);
    }
    this.byKey.set(key, this.list.length);
    this.list.push({ level, target, config, anyMaster });
    return this.list.length - 1;
  }
}

/** Every (level, balls) a plan plays: need indices by "slot@balls". */
function collect(plan: Plan, needs: Needs): Map<string, number> {
  const keys = new Map<string, number>();
  const add = (slot: string, balls: number): void => {
    keys.set(`${slot}@${balls}`, needs.add(plan, slot, balls));
  };
  const c = plan.challenge;
  const first = plan.numbers.balls ?? DEFAULT_BALLS;
  if (isPick(c)) {
    for (const slot of plan.source.built) add(slot, first);
    return keys;
  }
  const carry = carriesBalls(c);
  c.levels.forEach((ref, i) => {
    for (const slot of ref === 'random' ? plan.source.pool : [ref]) {
      if (i === 0) add(slot, first);
      else if (carry) for (let b = 1; b <= CARRY_MAX; b++) add(slot, b);
      else add(slot, DEFAULT_BALLS);
    }
  });
  return keys;
}

// ---------------------------------------------------------------------------------------------
// Results

interface Measured {
  readonly plan: Plan;
  readonly passed: number;
  readonly outcomes: readonly ChainOutcome[];
  readonly clamped: number;
  /** The pick: its best level. */
  readonly best: string | null;
}

function chainSeed(seed: number, id: string, j: number): number {
  const hex = new Digest().string('chain').int(seed).string(id).int(j).hex();
  return Number.parseInt(hex.slice(0, 8), 16) >>> 0;
}

function evaluate(
  plan: Plan,
  keys: ReadonlyMap<string, number>,
  results: readonly (readonly RunResult[])[],
  runs: number,
  seed: number,
): Measured {
  const c = plan.challenge;
  const n = plan.numbers;
  const runOf =
    (j: number) =>
    (slot: string, balls: number): LevelRun | undefined => {
      const need = keys.get(`${slot}@${balls}`);
      return need === undefined ? undefined : results[need]?.[j];
    };
  const chains = (levels: (j: number) => readonly string[], carry: boolean): ChainOutcome[] =>
    Array.from({ length: runs }, (_, j) => chainOutcome(levels(j), n, carry, runOf(j)));
  if (isPick(c)) {
    let best: Measured | null = null;
    for (const slot of plan.source.built) {
      const outcomes = chains(() => [slot], false);
      const passed = outcomes.filter((o) => passes(o, n)).length;
      if (best === null || passed > best.passed) {
        best = { plan, passed, outcomes, clamped: 0, best: slot };
      }
    }
    return best ?? { plan, passed: 0, outcomes: [], clamped: 0, best: null };
  }
  const outcomes = chains(
    (j) => resolveLevels(c, plan.source.pool, Rng.fromSeed(chainSeed(seed, c.id, j))),
    carriesBalls(c),
  );
  return {
    plan,
    passed: outcomes.filter((o) => passes(o, n)).length,
    outcomes,
    clamped: outcomes.filter((o) => o.clamped).length,
    best: null,
  };
}

function goal(c: ChallengeDef, n: Numbers): string {
  const parts: string[] = [];
  if (c.orange !== null) parts.push(`${n.orange} orange`);
  if (n.score !== null) parts.push(`over ${thousands(n.score)}`);
  if (n.balls !== null) parts.push(`${n.balls} balls`);
  if (n.fullClear) parts.push('full clear');
  return parts.length === 0 ? 'win' : parts.join(', ');
}

function rate(m: Measured, runs: number): string {
  const ci = wilson(m.passed, runs);
  const on = m.best === null ? '' : ` on ${m.best}`;
  return `${pct(m.passed / runs)} (${pct(ci.low)}-${pct(ci.high)})${on}`;
}

function sourceNames(value: string | undefined): SourceName[] {
  switch (value ?? 'both') {
    case 'both':
      return ['teggle', 'original'];
    case 'teggle':
    case 'original':
      return [value as SourceName];
    default:
      throw new UsageError('--source is teggle, original or both');
  }
}

function selected(args: readonly string[]): ChallengeDef[] {
  const playable = CHALLENGES.filter((c) => c.duel === null);
  if (args.length === 0) return playable;
  const out = playable.filter((c) => args.includes(c.id) || args.includes(c.group));
  if (out.length === 0) throw new UsageError(`no challenge matches ${args.join(' ')}`);
  return out;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      source: { type: 'string' },
      runs: { type: 'string' },
      noise: { type: 'string' },
      seed: { type: 'string' },
      workers: { type: 'string' },
      out: { type: 'string' },
      'same-levels': { type: 'boolean' },
    },
  });
  const runs = intOption(values.runs, 'runs', 1) ?? DEFAULT_CHALLENGE_RUNS;
  const seed = intOption(values.seed, 'seed', 0) ?? 1;
  const workers = intOption(values.workers, 'workers', 1) ?? defaultWorkers();
  const noise = noiseList(values.noise, [REFERENCE_NOISE])[0] ?? REFERENCE_NOISE;
  const agent = agentSpec('noisy', { noise });
  const challenges = selected(positionals);
  const teggle = teggleSource();
  const sources = sourceNames(values.source).map((s) =>
    s === 'teggle' ? teggle : originalSource(values['same-levels'] === true ? teggle.built : null),
  );

  const needs = new Needs();
  const plans = sources.flatMap((source) => challenges.map((c) => planFor(source, c)));
  const keys = plans.map((p) => (p.skip === null ? collect(p, needs) : new Map<string, number>()));
  const tasks: Task[] = needs.list.map((x) => ({
    level: x.level,
    runs,
    setup: {
      levelKey: x.target.key,
      config: x.config,
      anyMaster: x.anyMaster,
      agent,
      baseSeed: seed,
    },
  }));
  const pool = new AgentPool(workers);
  let played: Awaited<ReturnType<AgentPool['run']>>;
  try {
    played = await pool.run(
      needs.levels.map((t) => t.level),
      tasks,
      progressLine(`${tasks.length} level setups`),
    );
  } finally {
    await pool.close();
  }

  const measured = new Map<string, Measured>();
  plans.forEach((p, i) => {
    if (p.skip !== null) return;
    const m = evaluate(p, keys[i] ?? new Map(), played.results, runs, seed);
    measured.set(`${p.source.name}|${p.challenge.id}`, m);
  });
  const cell = (source: SourceName, c: ChallengeDef): string => {
    const m = measured.get(`${source}|${c.id}`);
    if (m !== undefined) return rate(m, runs);
    const p = plans.find((x) => x.source.name === source && x.challenge.id === c.id);
    return p?.skip ?? '-';
  };
  const rows = challenges.map((c) => {
    const t = measured.get(`teggle|${c.id}`);
    const o = measured.get(`original|${c.id}`);
    const equal =
      c.score !== null && t !== undefined && o !== undefined
        ? equalPassScore(t.outcomes, o.passed / runs)
        : null;
    return [
      c.id,
      c.levels.join(' '),
      goal(c, teggleNumbers(c)),
      cell('teggle', c),
      goal(c, originalNumbers(c)),
      cell('original', c),
      equal === null ? '-' : thousands(equal),
    ];
  });
  console.log(
    table(
      [
        'Challenge',
        'Levels',
        'Teggle goal',
        'Teggle pass',
        'Original goal',
        'Original pass',
        'Equal',
      ],
      rows,
      6,
    ),
  );
  console.log(
    `\nPass: share of ${runs} challenge runs that passed, with its 95% Wilson interval.` +
      "\nEqual: the score to beat at which Teggle's challenge runs pass as often as the original's.",
  );
  let clamped = 0;
  for (const m of measured.values()) clamped += m.clamped;
  if (clamped > 0) {
    console.log(`${clamped} carried stocks above ${CARRY_MAX} balls played as ${CARRY_MAX}.`);
  }
  console.log(`\n${speedLine(played.stats, workers)}`);

  const now = new Date();
  const out = values.out ?? join(METRICS_DIR, `challenges-${stamp(now)}.json`);
  writeJson(out, {
    format: 1,
    createdAt: now.toISOString(),
    command: `npm run agents:challenges -- ${process.argv.slice(2).join(' ')}`,
    options: { runs, seed, noise },
    results: [...measured.values()].map((m) => ({
      source: m.plan.source.name,
      id: m.plan.challenge.id,
      numbers: m.plan.numbers,
      runs,
      passed: m.passed,
      complete: m.outcomes.filter((o) => o.complete).length,
      best: m.best,
      completeTotals: m.outcomes.filter((o) => o.complete).map((o) => o.total),
    })),
  });
  console.log(`Wrote ${out}`);
}

runMain(main);
