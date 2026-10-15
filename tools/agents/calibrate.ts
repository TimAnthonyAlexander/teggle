// Calibration against the player's own results (spec 13.5): fits the noisy agent's aim error so
// its clear rates match the player's on the campaign levels they played. The input is a save
// exported from the game (the DEV ONLY route #/dev/save downloads it; the format is the
// localStorage record `teggle.save.v1`, src/game/progress/save.ts), which keeps per level the
// tries and wins of every mode. The save does not say which master a try used, so the agent
// plays each level with its stage master, as in the campaign.
//
// Every aim error on the grid plays the same runs (the same colors, the same error draws scaled
// by the error), so the curve is smooth. The fit is the error with the highest binomial
// likelihood of the player's wins given the agent's clear rates; the table also shows the mean
// absolute error between the two rates, the measure the Candy Crush study reports (4% to 7%).
//
// Usage: npm run agents:calibrate -- <save.json> [--runs N] [--noise LIST] [--min-tries N]
//                                     [--seed N] [--workers N] [--out FILE]

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseArgs } from 'node:util';
import { agentSpec } from '../../src/agents/agent';
import { parseProgress } from '../../src/game/progress/save';
import {
  intOption,
  measuredJson,
  METRICS_DIR,
  noiseList,
  runMain,
  stamp,
  UsageError,
  writeJson,
} from './cli';
import { bestFit, fitOf, type PlayedLevel } from './fit';
import { fixed, pct, table } from './format';
import { measure, speedLine, type Measured } from './measure';
import { AgentPool, defaultWorkers, progressLine } from './pool';
import { resolveTarget, type Target } from './targets';

// Clear rates fall fastest just above no aim error (docs/research/agent-difficulty.md), so the
// grid is finest there.
const DEFAULT_GRID = [
  0, 0.0005, 0.001, 0.0025, 0.005, 0.0075, 0.01, 0.015, 0.02, 0.025, 0.03, 0.04, 0.05, 0.06, 0.08,
  0.1,
];
const DEFAULT_RUNS = 100;

interface Played extends PlayedLevel {
  readonly target: Target;
}

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      runs: { type: 'string' },
      noise: { type: 'string' },
      'min-tries': { type: 'string' },
      seed: { type: 'string' },
      workers: { type: 'string' },
      out: { type: 'string' },
    },
  });
  const file = positionals[0];
  if (file === undefined || positionals.length > 1) {
    throw new UsageError('name one exported save file (see tools/agents/calibrate.ts)');
  }
  const runs = intOption(values.runs, 'runs', 1) ?? DEFAULT_RUNS;
  const minTries = intOption(values['min-tries'], 'min-tries', 1) ?? 1;
  const seed = intOption(values.seed, 'seed', 0) ?? 1;
  const workers = intOption(values.workers, 'workers', 1) ?? defaultWorkers();
  const grid = noiseList(values.noise, DEFAULT_GRID).sort((a, b) => a - b);

  const progress = parseProgress(readFileSync(file, 'utf8'));
  const played: Played[] = [];
  const skipped: string[] = [];
  for (const [id, record] of Object.entries(progress.levels).sort(([a], [b]) => byId(a, b))) {
    if (record.tries < minTries) continue;
    try {
      const [target] = resolveTarget(id);
      if (target !== undefined) {
        played.push({ id, target, tries: record.tries, wins: record.wins });
      }
    } catch {
      skipped.push(id);
    }
  }
  if (skipped.length > 0) console.log(`Not in the campaign yet, skipped: ${skipped.join(', ')}`);
  if (played.length === 0) {
    throw new UsageError(`${file} has no campaign level with at least ${minTries} tries`);
  }

  const agents = grid.map((noise) => agentSpec('noisy', { noise }));
  const pool = new AgentPool(workers);
  let result: Awaited<ReturnType<typeof measure>>;
  try {
    result = await measure(
      pool,
      played.map((p) => p.target),
      agents,
      { runs, seed, overrides: {} },
      progressLine(`${played.length} levels x ${grid.length} aim errors`),
    );
  } finally {
    await pool.close();
  }
  const { measured, stats } = result;

  // measure() returns per target, then per agent.
  const rateOf = (level: number, agent: number): number =>
    measured[level * agents.length + agent]?.metrics.clearRate ?? 0;
  const fits = grid.map((noise, a) =>
    fitOf(
      noise,
      played,
      played.map((_p, l) => rateOf(l, a)),
      runs,
    ),
  );
  const best = bestFit(fits);
  if (best === undefined) throw new UsageError('--noise needs at least one value');

  const totalTries = played.reduce((s, p) => s + p.tries, 0);
  const totalWins = played.reduce((s, p) => s + p.wins, 0);
  console.log(
    `${played.length} levels, ${totalTries} tries, ${totalWins} wins (${pct(totalWins / totalTries)})\n`,
  );
  console.log(
    table(
      ['Aim error', 'Log likelihood', 'MAE', 'Weighted MAE', 'Agent mean'],
      fits.map((f) => [
        `${f.noise}${f === best ? ' *' : ''}`,
        fixed(f.logLikelihood, 2),
        pct(f.mae, 1),
        pct(f.weightedMae, 1),
        pct(f.levels.reduce((s, l) => s + l.agent, 0) / f.levels.length, 1),
      ]),
      1,
    ),
  );
  const bestIndex = fits.indexOf(best);
  console.log(`\nBest fit: aim error ${best.noise} rad (* above). Per level at that error:\n`);
  console.log(
    table(
      ['Level', 'Tries', 'Wins', 'Player', 'Agent', 'Agent 95% CI'],
      played.map((p, l) => {
        const m: Measured | undefined = measured[l * agents.length + bestIndex];
        return [
          p.target.key,
          String(p.tries),
          String(p.wins),
          pct(p.wins / p.tries),
          pct(m?.metrics.clearRate ?? Number.NaN),
          m === undefined ? '-' : `${pct(m.metrics.clearCi.low)}-${pct(m.metrics.clearCi.high)}`,
        ];
      }),
      1,
    ),
  );
  if (bestIndex === 0 || bestIndex === fits.length - 1) {
    console.log('\nThe best fit is at the edge of the grid; widen it with --noise.');
  }
  console.log(`\n${speedLine(stats, workers)}`);

  const now = new Date();
  const out = values.out ?? join(METRICS_DIR, `calibration-${stamp(now)}.json`);
  writeJson(out, {
    format: 1,
    createdAt: now.toISOString(),
    command: `npm run agents:calibrate -- ${process.argv.slice(2).join(' ')}`,
    options: { runs, seed, minTries, grid },
    player: played.map((p) => ({ level: p.target.key, tries: p.tries, wins: p.wins })),
    best: best.noise,
    fits,
    results: measured.map(measuredJson),
  });
  console.log(`Wrote ${out}`);
}

/** Campaign ids in play order: "2-1" before "10-1". */
function byId(a: string, b: string): number {
  const [as = 0, al = 0] = a.split('-').map(Number);
  const [bs = 0, bl = 0] = b.split('-').map(Number);
  return as - bs || al - bl;
}

runMain(main);
