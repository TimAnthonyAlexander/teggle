// Reference bands (spec 13.5 acceptance: a generated level's noisy-agent clear rate falls in the
// band chosen for its stage). Plays the noisy agent at the reference aim error over the
// original's 55 campaign levels, converted at run time on their own 650 x 560 board, and writes
// only derived numbers: the per-level clear rates and each stage's band, the range its five
// levels span, to src/agents/bands.json (read by src/agents/bands.ts). The full report goes to
// reference/teggle-metrics/. It prints the tables docs/research/agent-difficulty.md quotes.
//
// Usage: npm run agents:bands -- [--runs N] [--seed N] [--workers N]

import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { agentSpec } from '../../src/agents/agent';
import {
  BANDS_FILE_FORMAT,
  referenceBandsSchema,
  type ReferenceBands,
} from '../../src/agents/bands-format';
import { REFERENCE_NOISE } from '../../src/agents/tuning';
import { intOption, isoDay, measuredJson, METRICS_DIR, runMain, stamp, writeJson } from './cli';
import { fixed, pct, table } from './format';
import { measure, speedJson, speedLine } from './measure';
import { AgentPool, defaultWorkers, progressLine } from './pool';
import { resolveTargets } from './targets';

export const BANDS_JSON = 'src/agents/bands.json';
const DEFAULT_BAND_RUNS = 200;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      runs: { type: 'string' },
      seed: { type: 'string' },
      workers: { type: 'string' },
    },
  });
  const runs = intOption(values.runs, 'runs', 1) ?? DEFAULT_BAND_RUNS;
  const seed = intOption(values.seed, 'seed', 0) ?? 1;
  const workers = intOption(values.workers, 'workers', 1) ?? defaultWorkers();
  const agent = agentSpec('noisy', { noise: REFERENCE_NOISE });

  const targets = resolveTargets(['original']);
  const pool = new AgentPool(workers);
  let result: Awaited<ReturnType<typeof measure>>;
  try {
    result = await measure(
      pool,
      targets,
      [agent],
      { runs, seed, overrides: {} },
      progressLine('original campaign'),
    );
  } finally {
    await pool.close();
  }
  const { measured, stats } = result;

  const now = new Date();
  const stages: ReferenceBands['stages'] = [];
  for (let stage = 1; stage <= 11; stage++) {
    const levels = measured
      .filter((m) => m.target.stage === stage)
      .map((m) => ({
        id: m.target.key.replace(/^original /, ''),
        clearRate: m.metrics.clearRate,
        low: m.metrics.clearCi.low,
        high: m.metrics.clearCi.high,
      }));
    const rates = levels.map((l) => l.clearRate);
    stages.push({
      stage,
      low: Math.min(...rates),
      high: Math.max(...rates),
      mean: rates.reduce((a, b) => a + b, 0) / rates.length,
      levels,
    });
  }
  const bands: ReferenceBands = {
    format: BANDS_FILE_FORMAT,
    measured: isoDay(now),
    source: 'the original campaign, converted at run time on its own 650 x 560 board',
    agent,
    runs,
    seed,
    stages,
  };
  writeJson(BANDS_JSON, referenceBandsSchema.parse(bands));

  const levelRows = measured.map((m) => [
    m.target.key.replace(/^original /, ''),
    pct(m.metrics.clearRate),
    `${pct(m.metrics.clearCi.low)}-${pct(m.metrics.clearCi.high)}`,
    m.metrics.ballsUsed === null ? '-' : fixed(m.metrics.ballsUsed.median, 0),
    fixed(m.metrics.freeBalls.total, 2),
    fixed(m.metrics.orangeLeftOnFailure?.mean),
    pct(m.metrics.coverage.share),
    fixed(m.metrics.stuckPerRun, 2),
  ]);
  console.log(
    table(['Level', 'Clear', '95% CI', 'Balls', 'Free', 'Left', 'Cover', 'Stuck'], levelRows, 1),
  );
  const stageRows = stages.map((s) => [
    String(s.stage),
    pct(s.mean),
    `${pct(s.low)}-${pct(s.high)}`,
  ]);
  console.log(`\n${table(['Stage', 'Mean', 'Band'], stageRows, 1)}`);
  console.log(`\n${speedLine(stats, workers)}`);

  const out = join(METRICS_DIR, `bands-${stamp(now)}.json`);
  writeJson(out, {
    format: 1,
    createdAt: now.toISOString(),
    command: `npm run agents:bands -- ${process.argv.slice(2).join(' ')}`,
    options: { runs, seed },
    speed: speedJson(stats, workers),
    results: measured.map(measuredJson),
  });
  console.log(`Wrote ${BANDS_JSON} and ${out}`);
}

runMain(main);
