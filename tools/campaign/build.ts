// Builds campaign levels from their sources (campaign/, tools/campaign/source.ts): the recipe
// made from the level's solids, lines, parts and manual edits goes through the same pipeline the
// line editor runs (src/gen/pipeline.ts): count fitting, the generator, its validity checks and
// its full checks (reachability, stuck spots). The level file is written to
// public/levels/campaign/<id>.json with the level's background id. Then the manifest
// (public/levels/campaign/manifest.json) is written for every level that has a file. The same
// sources always give the same bytes; the report says which files changed.
//
// A level is written only when it has exactly its object count, at least 58 can-be-orange
// objects, no stuck spot left, every solid in place and every manual edit applied.
//
// Usage: npm run campaign:build [-- <id> ...]   (default: every level, e.g. 1-3)
// Options: --no-check (validity and counts only; writes an unchecked draft to
//          reference/teggle-shots/campaign/drafts/ for the grid tool, nothing to public/),
//          --lines (objects per line),
//          --workers <n> (default: every core).

import { availableParallelism } from 'node:os';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SpacingNudge } from '../../src/gen/fit';
import { smoothLine } from '../../src/gen/lines';
import { PathSampler } from '../../src/gen/paths';
import { runPipeline } from '../../src/gen/pipeline';
import { levelJson } from '../../src/gen/serialize';
import { isScoringElement, type Level } from '../../src/level/schema';
import { CheckPool } from '../check-pool';
import {
  composeManifest,
  composeRecipe,
  LEVELS_DIR,
  linesPartIndex,
  loadCampaign,
  recipeLineIds,
  ROOT,
  type CampaignLevelSource,
} from './source';

const DRAFTS_DIR = path.join(ROOT, 'reference', 'teggle-shots', 'campaign', 'drafts');

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function pct(x: number): string {
  return `${(100 * x).toFixed(1)}%`;
}

async function readText(file: string): Promise<string | null> {
  try {
    return await readFile(file, 'utf8');
  } catch {
    return null;
  }
}

/** Writes a file unless it already has these bytes; says which. */
async function writeIfChanged(file: string, text: string): Promise<string> {
  const before = await readText(file);
  if (before === text) return 'unchanged';
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  return before === null ? 'new' : 'updated';
}

/** Scoring objects placed on each line: those whose position lies on its smoothed path. */
function perLine(src: CampaignLevelSource, level: Level): string[] {
  const scoring = level.elements.filter(isScoringElement);
  return src.lines.lines.map((line) => {
    const sampler = new PathSampler(smoothLine(line));
    const pts: { x: number; y: number }[] = [];
    for (let s = 0; s <= sampler.length; s += 1) pts.push(sampler.at(s));
    const on = scoring.filter((e) =>
      pts.some((p) => (p.x - e.x) * (p.x - e.x) + (p.y - e.y) * (p.y - e.y) < 2.25),
    );
    return `    ${line.id} (${line.mode}): ${on.length}`;
  });
}

/** "envelope 36 -> 35.45 (+1)" for a spacing nudge on one of the level's lines. */
function nudgeText(src: CampaignLevelSource, n: SpacingNudge): string {
  const name =
    n.part === linesPartIndex(src)
      ? (recipeLineIds(src)[n.path] ?? `path ${n.path}`)
      : `part ${n.part + 1} path ${n.path}`;
  const d = n.pegsTo - n.pegsFrom;
  return `${name} ${n.from} -> ${n.to} (${d > 0 ? '+' : ''}${d})`;
}

async function build(src: CampaignLevelSource, pool: CheckPool | null): Promise<boolean> {
  const id = src.level.id;
  const seed = src.level.recipe.seed;
  const lines = [`${id} ${src.level.name} (seed ${seed})`];
  let out;
  const start = performance.now();
  try {
    out = await runPipeline(composeRecipe(src), seed, src.level.background.id, {
      run: pool === null ? null : (l, plan) => pool.run(l, plan),
    });
  } catch (err) {
    console.log(`${lines[0] ?? id}\n  FAIL: ${(err as Error).message}`);
    return false;
  }
  const seconds = (performance.now() - start) / 1000;
  const g = out.fit.generated;
  lines.push(`  parts: ${g.parts.map((p) => `${p.name} ${p.scoring}`).join(', ')}`);
  if (out.fit.nudges.length > 0) {
    const text = out.fit.nudges.map((n) =>
      n.kind === 'fill' ? `fill ${n.count} pegs` : nudgeText(src, n),
    );
    lines.push(`  fit to ${out.fit.target}: ${text.join(', ')}`);
  }
  if (g.recipe.edits !== undefined) lines.push(`  manual edits: ${g.recipe.edits.length}`);
  for (const issue of out.issues.slice(0, 12)) {
    lines.push(
      `  invalid: ${issue.kind} ${issue.a}${issue.b === undefined ? '' : `/${issue.b}`}${issue.gap === undefined ? '' : ` gap ${issue.gap.toFixed(2)}`}`,
    );
  }
  if (out.check !== null) {
    const r = out.check.report;
    lines.push(
      `  check: ${r.shots} shots, ${(r.ticks / 1e6).toFixed(1)} M ticks, ${r.rounds} round(s), ${seconds.toFixed(1)} s`,
      `  coverage ${pct(r.coverage)} of can-be-orange objects; ${r.unflagged.length} never hit, flag cleared`,
      `  stuck spots fixed ${r.spotsFixed} (quick disappear on ${r.quickDisappear.length}); remaining ${r.remainingSpots}; unfixable ${r.unfixable.length}`,
    );
    for (const s of r.unfixable.slice(0, 6)) {
      lines.push(
        `  unfixable stuck spot at (${s.x.toFixed(0)}, ${s.y.toFixed(0)}) on solids ${s.solids.join(', ')}`,
      );
    }
  }
  const s = out.stats;
  lines.push(
    `  objects ${s.scoring} (target ${out.fit.target}): ${s.pegs} pegs, ${s.bricks} bricks (${s.straightBricks} straight, ${s.curvedBricks} curved), brick share ${pct(s.brickShare)}`,
    `  can be orange ${s.canBeOrange}, quick disappear ${s.quickDisappear}, solids ${s.solids}`,
    `  peg spacing: median ${s.pegSpacing.median.toFixed(1)}, 5th percentile ${s.pegSpacing.p5.toFixed(1)}, min ${s.pegSpacing.min.toFixed(1)}`,
  );
  if (flag('lines')) lines.push('  per line:', ...perLine(src, out.level));
  for (const f of out.failures) lines.push(`  FAIL: ${f}`);
  if (pool === null) {
    // Unchecked drafts go where the grid tool can draw them (--level-file), never to public/.
    const draft = path.join(DRAFTS_DIR, `${id}.json`);
    await mkdir(DRAFTS_DIR, { recursive: true });
    await writeFile(draft, levelJson(out.level));
    lines.push(`  not checked, draft in ${path.relative(ROOT, draft)} (--no-check)`);
  } else if (out.text === null) {
    lines.push('  FAIL: level not written');
  } else {
    const file = path.join(LEVELS_DIR, `${id}.json`);
    const what = await writeIfChanged(file, out.text);
    lines.push(`  ${path.relative(ROOT, file)}: ${what}`);
  }
  console.log(lines.join('\n'));
  return pool === null ? out.failures.length === 0 : out.text !== null;
}

async function main(): Promise<void> {
  const campaign = await loadCampaign();
  const wanted = process.argv
    .slice(2)
    .filter((a, i, all) => !a.startsWith('--') && all[i - 1] !== '--workers');
  const unknown = wanted.filter((id) => !campaign.levels.some((l) => l.level.id === id));
  if (unknown.length > 0) throw new Error(`No campaign level ${unknown.join(', ')}.`);
  const levels =
    wanted.length === 0
      ? campaign.levels
      : campaign.levels.filter((l) => wanted.includes(l.level.id));
  const check = !flag('no-check');
  const pool = check ? new CheckPool(Number(arg('workers') ?? availableParallelism())) : null;
  let failed = 0;
  try {
    for (const l of levels) if (!(await build(l, pool))) failed++;
  } finally {
    await pool?.close();
  }
  // The manifest lists every level whose file exists.
  const built: CampaignLevelSource[] = [];
  for (const l of campaign.levels) {
    if ((await readText(path.join(LEVELS_DIR, `${l.level.id}.json`))) !== null) built.push(l);
  }
  if (built.length > 0) {
    const manifest = composeManifest(campaign.stages, built);
    const file = path.join(LEVELS_DIR, 'manifest.json');
    const what = await writeIfChanged(file, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`${path.relative(ROOT, file)}: ${what} (${built.length} levels)`);
  }
  if (failed > 0) process.exitCode = 1;
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
