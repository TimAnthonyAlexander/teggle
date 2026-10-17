// Self-play report (spec 13.5): plays levels with the agents on all cores and prints the metrics
// per level and agent; the full numbers go to reference/teggle-metrics/ (gitignored).
//
// Usage: npm run agents:report -- <targets...> [options]
//   targets      campaign | <stage> | <stage>-<level> | original | original:<stage> |
//                original:<stage>-<level> | a level file | a directory of level files
//                (tools/agents/targets.ts)
//   --runs N             runs per level and agent (default 100)
//   --tier LIST          agents: random, greedy, noisy (default random,greedy,noisy)
//   --noise LIST         aim error of the noisy agent in radians, one agent each (default 0.03)
//   --angles N           angles the greedy search tries per shot (default 40)
//   --search-ticks N     tick limit of each searched shot (default 3000)
//   --balls N            balls at the start instead of 10
//   --orange N           orange pegs instead of 20 (the original's levels: 25)
//   --draw D             orange draw: weighted (Teggle's levels) or uniform (the original's)
//   --power ID           a master's power for every level, "none", or "any" (one drawn per run)
//   --seed N             base seed of the runs (default 1)
//   --workers N          worker threads (default: every core)
//   --out FILE           where the JSON goes (default reference/teggle-metrics/report-<time>.json)
//   --quiet              no table, only the speed line and the file

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import {
  AGENT_TIERS,
  agentLabel,
  agentSpec,
  type AgentSpec,
  type AgentTier,
} from '../../src/agents/agent';
import {
  DEFAULT_RUNS,
  REFERENCE_NOISE,
  SEARCH_ANGLES,
  SEARCH_TICK_LIMIT,
} from '../../src/agents/tuning';
import {
  drawOption,
  intOption,
  listOption,
  measuredJson,
  METRICS_DIR,
  noiseList,
  runMain,
  stamp,
  UsageError,
  writeJson,
} from './cli';
import { METRIC_HEADER, METRIC_LEGEND, metricRow, pct, table } from './format';
import { measure, speedJson, speedLine, type Measured, type Overrides } from './measure';
import { AgentPool, defaultWorkers, progressLine } from './pool';
import { resolveTargets } from './targets';

function stageSummary(measured: readonly Measured[]): string {
  const groups = new Map<string, { sum: number; n: number; low: number; high: number }>();
  for (const m of measured) {
    if (m.target.stage === null) continue;
    const source = m.target.source === 'original' ? 'original ' : '';
    const key = `${source}stage ${m.target.stage}\t${agentLabel(m.agent)}`;
    const g = groups.get(key) ?? { sum: 0, n: 0, low: 1, high: 0 };
    g.sum += m.metrics.clearRate;
    g.n++;
    g.low = Math.min(g.low, m.metrics.clearRate);
    g.high = Math.max(g.high, m.metrics.clearRate);
    groups.set(key, g);
  }
  const rows = [...groups]
    .filter(([, g]) => g.n > 1)
    .map(([key, g]) => {
      const [stage = '', agent = ''] = key.split('\t');
      return [stage, agent, String(g.n), pct(g.sum / g.n), `${pct(g.low)}-${pct(g.high)}`];
    });
  return rows.length === 0 ? '' : table(['Stage', 'Agent', 'Levels', 'Mean clear', 'Range'], rows);
}

function agentsFrom(values: {
  tier?: string | undefined;
  noise?: string | undefined;
  angles?: string | undefined;
  'search-ticks'?: string | undefined;
}): AgentSpec[] {
  const angles = intOption(values.angles, 'angles', 1) ?? SEARCH_ANGLES;
  const searchTicks = intOption(values['search-ticks'], 'search-ticks', 1) ?? SEARCH_TICK_LIMIT;
  const tiers = listOption(values.tier ?? AGENT_TIERS.join(','));
  const noises = noiseList(values.noise, [REFERENCE_NOISE]);
  const agents: AgentSpec[] = [];
  for (const t of tiers) {
    if (!(AGENT_TIERS as readonly string[]).includes(t))
      throw new UsageError(`unknown tier "${t}"`);
    const tier = t as AgentTier;
    if (tier === 'noisy') {
      for (const noise of noises) agents.push(agentSpec(tier, { noise, angles, searchTicks }));
    } else {
      agents.push(agentSpec(tier, { angles, searchTicks }));
    }
  }
  return agents;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      runs: { type: 'string' },
      tier: { type: 'string' },
      noise: { type: 'string' },
      angles: { type: 'string' },
      'search-ticks': { type: 'string' },
      balls: { type: 'string' },
      orange: { type: 'string' },
      draw: { type: 'string' },
      power: { type: 'string' },
      seed: { type: 'string' },
      workers: { type: 'string' },
      out: { type: 'string' },
      quiet: { type: 'boolean' },
    },
  });
  if (positionals.length === 0) {
    throw new UsageError(
      'name at least one level, stage or directory (see tools/agents/report.ts)',
    );
  }
  const runs = intOption(values.runs, 'runs', 1) ?? DEFAULT_RUNS;
  const seed = intOption(values.seed, 'seed', 0) ?? 1;
  const workers = intOption(values.workers, 'workers', 1) ?? defaultWorkers();
  const agents = agentsFrom(values);
  const balls = intOption(values.balls, 'balls', 1);
  const orange = intOption(values.orange, 'orange', 1);
  const draw = drawOption(values.draw);
  const overrides: Overrides = {
    ...(balls === undefined ? {} : { balls }),
    ...(orange === undefined ? {} : { orange }),
    ...(draw === undefined ? {} : { draw }),
    ...(values.power === undefined ? {} : { power: values.power }),
  };

  const targets = resolveTargets(positionals);
  const pool = new AgentPool(workers);
  const label = `${targets.length} levels x ${agents.length} agents`;
  let result: Awaited<ReturnType<typeof measure>>;
  try {
    result = await measure(pool, targets, agents, { runs, seed, overrides }, progressLine(label));
  } finally {
    await pool.close();
  }
  const { measured, stats } = result;

  if (values.quiet !== true) {
    const rows = measured.map((m) => metricRow(m.target.key, agentLabel(m.agent), m.metrics));
    console.log(table(METRIC_HEADER, rows));
    const summary = stageSummary(measured);
    if (summary !== '') console.log(`\n${summary}`);
    console.log(`\n${METRIC_LEGEND}`);
  }
  console.log(`\n${speedLine(stats, workers)}`);

  const now = new Date();
  const out = values.out ?? join(METRICS_DIR, `report-${stamp(now)}.json`);
  writeJson(out, {
    format: 1,
    createdAt: now.toISOString(),
    command: `npm run agents:report -- ${process.argv.slice(2).join(' ')}`,
    options: { runs, seed, overrides },
    speed: speedJson(stats, workers),
    results: measured.map(measuredJson),
  });
  console.log(`Wrote ${out}`);
}

runMain(main);
