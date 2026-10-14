// Level generator CLI (spec 13.3): recipe and seed in, validated and checked level JSON out to
// public/levels/, plus a short report. The reachability and stuck checks run on worker threads,
// one per core.
//
// Usage:
//   npm run gen:level -- --example plinko          one example (public/levels/examples/)
//   npm run gen:level -- --example all             every example
//   npm run gen:level -- --recipe my.json --seed 7 [--out public/levels/my.json]
//   npm run gen:level -- --template spiral --params '{"layout":"single"}' --seed 3 --name Spiral
// Options: --no-check (validity only), --workers <n> (default: every core), --quick (a
// smaller check for iterating on templates).

import { availableParallelism } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import type { CheckConfig, CheckPlan, JobResult } from '../src/gen/check';
import { EXAMPLES } from '../src/gen/examples';
import { checkAndFix, type CheckReport } from '../src/gen/fix';
import { generateLevel } from '../src/gen/generate';
import type { RecipeInput } from '../src/gen/recipe';
import { levelJson } from '../src/gen/serialize';
import { levelStats } from '../src/gen/stats';
import { validateLevel } from '../src/gen/validate';
import { parseLevel, type Level } from '../src/level/schema';
import type { WorkerRequest } from './gen-worker';

const ROOT = path.resolve(import.meta.dirname, '..');
/** Every level must leave room for a 55-orange challenge plus green and purple (spec 3). */
const MIN_CAN_BE_ORANGE = 58;

interface Job {
  readonly recipe: RecipeInput;
  readonly seed: number;
  readonly out: string;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

async function jobs(): Promise<Job[]> {
  const example = arg('example');
  if (example !== undefined) {
    const list = example === 'all' ? EXAMPLES : EXAMPLES.filter((e) => e.file === example);
    if (list.length === 0) throw new Error(`No example named ${example}.`);
    return list.map((e) => ({
      recipe: e.recipe,
      seed: Number(arg('seed') ?? e.seed),
      out: path.join(ROOT, 'public', 'levels', 'examples', `${e.file}.json`),
    }));
  }
  const seed = Number(arg('seed') ?? 1);
  let recipe: RecipeInput;
  const file = arg('recipe');
  if (file !== undefined) {
    recipe = JSON.parse(await readFile(file, 'utf8')) as RecipeInput;
  } else {
    const template = arg('template');
    if (template === undefined) throw new Error('Give --example, --recipe or --template.');
    const params = arg('params');
    recipe = {
      name: arg('name') ?? template,
      parts: [
        {
          template: template as RecipeInput['parts'][number]['template'],
          ...(params === undefined
            ? {}
            : { params: JSON.parse(params) as Record<string, unknown> }),
        },
      ],
    };
  }
  const out = arg('out') ?? path.join(ROOT, 'public', 'levels', `${slug(recipe.name)}.json`);
  return [{ recipe, seed, out }];
}

/** A pool of check workers that hands out jobs one at a time as workers come free. */
class Pool {
  private readonly workers: Worker[];
  private round = 0;

  constructor(size: number) {
    // Workers do not inherit tsx's loader; a small ES module bootstrap registers it first.
    const entry = new URL('./gen-worker.ts', import.meta.url).href;
    const tsx = import.meta.resolve('tsx/esm/api');
    const bootstrap = `import { register } from ${JSON.stringify(tsx)}; register(); await import(${JSON.stringify(entry)});`;
    const url = new URL(`data:text/javascript,${encodeURIComponent(bootstrap)}`);
    this.workers = Array.from({ length: size }, () => new Worker(url));
  }

  async run(level: Level, plan: CheckPlan): Promise<JobResult[]> {
    const round = ++this.round;
    const results: JobResult[] = new Array<JobResult>(plan.jobs.length);
    let next = 0;
    await Promise.all(
      this.workers.map(
        (w) =>
          new Promise<void>((resolve, reject) => {
            const send = (): void => {
              if (next >= plan.jobs.length) {
                w.off('message', onMessage);
                w.off('error', reject);
                resolve();
                return;
              }
              const msg: WorkerRequest = { type: 'job', round, job: next++ };
              w.postMessage(msg);
            };
            const onMessage = (r: JobResult): void => {
              results[r.job] = r;
              send();
            };
            w.on('message', onMessage);
            w.on('error', reject);
            const init: WorkerRequest = { type: 'round', round, level, plan };
            w.postMessage(init);
            send();
          }),
      ),
    );
    return results;
  }

  async close(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.terminate()));
  }
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

async function run(job: Job, pool: Pool | null, config: Partial<CheckConfig>): Promise<boolean> {
  const generated = generateLevel(job.recipe, job.seed);
  // Round-trip through the file format so the checks see exactly what gets written.
  let level = parseLevel(JSON.parse(levelJson(generated.level)));
  const issues = validateLevel(level);
  let report: CheckReport | null = null;
  let seconds = 0;
  if (pool !== null && issues.length === 0) {
    const start = performance.now();
    const checked = await checkAndFix(level, (l, plan) => pool.run(l, plan), {
      ...config,
      seed: job.seed,
    });
    seconds = (performance.now() - start) / 1000;
    level = checked.level;
    report = checked.report;
  }
  const s = levelStats(level);
  const emptyParts = generated.parts.filter((p) => p.scoring === 0 && p.name !== 'fill');
  const lines = [
    `${level.name} (seed ${job.seed})`,
    `  parts: ${generated.parts.map((p) => `${p.name} ${p.scoring}`).join(', ')}`,
    `  objects ${s.scoring}: ${s.pegs} pegs, ${s.bricks} bricks (${s.straightBricks} straight, ${s.curvedBricks} curved), brick share ${pct(s.brickShare)}`,
    `  can be orange ${s.canBeOrange}, quick disappear ${s.quickDisappear}, moving ${s.moving}, solids ${s.solids}, teleports ${s.teleports}`,
    `  peg spacing (static, nearest neighbor): median ${s.pegSpacing.median.toFixed(1)}, 5th percentile ${s.pegSpacing.p5.toFixed(1)}, min ${s.pegSpacing.min.toFixed(1)}`,
    `  validity: ${issues.length === 0 ? 'pass' : `${issues.length} issues`}`,
  ];
  for (const issue of issues.slice(0, 12)) {
    lines.push(
      `    ${issue.kind} ${issue.a}${issue.b === undefined ? '' : `/${issue.b}`} at tick ${issue.tick}${issue.gap === undefined ? '' : ` gap ${issue.gap.toFixed(2)}`}`,
    );
  }
  if (report !== null) {
    lines.push(
      `  check: ${report.shots} shots, ${(report.ticks / 1e6).toFixed(1)} M ticks, ${report.rounds} round(s), ${seconds.toFixed(1)} s on ${availableParallelism()} cores`,
      `  coverage ${pct(report.coverage)} of can-be-orange objects; ${report.unflagged.length} never hit, flag cleared`,
      `  stuck spots fixed ${report.spotsFixed} (quick disappear on ${report.quickDisappear.length}); remaining ${report.remainingSpots}; unfixable ${report.unfixable.length}`,
    );
  }
  const ok =
    issues.length === 0 &&
    emptyParts.length === 0 &&
    s.canBeOrange >= MIN_CAN_BE_ORANGE &&
    (report === null || (report.remainingSpots === 0 && report.unfixable.length === 0));
  if (emptyParts.length > 0) {
    lines.push(`  FAIL: ${emptyParts.map((p) => p.name).join(', ')} placed nothing (no room)`);
  }
  if (s.canBeOrange < MIN_CAN_BE_ORANGE) {
    lines.push(`  FAIL: only ${s.canBeOrange} can-be-orange objects (need ${MIN_CAN_BE_ORANGE})`);
  }
  if (!ok) lines.push('  FAIL: level not written');
  if (ok) {
    await mkdir(path.dirname(job.out), { recursive: true });
    await writeFile(job.out, levelJson(level));
    lines.push(`  wrote ${path.relative(ROOT, job.out)}`);
  }
  console.log(lines.join('\n'));
  return ok;
}

async function main(): Promise<void> {
  const check = !flag('no-check');
  const size = Number(arg('workers') ?? availableParallelism());
  const pool = check ? new Pool(size) : null;
  const config: Partial<CheckConfig> = flag('quick')
    ? { playouts: 6, depth: 4, angles: 80, phases: 4 }
    : {};
  let failed = 0;
  try {
    for (const job of await jobs()) if (!(await run(job, pool, config))) failed++;
  } finally {
    await pool?.close();
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
