// The campaign as written in campaign/, checked against its sources of truth: every level's
// object count and split (spec 15 times 1.409), Teggle's own level names (never the original's,
// research 5) and the planned difficulty (inside each stage's reference band, spec 13.5, never
// easier than the stage before, spec 13.2).

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { stageBand } from '../../src/agents/bands';
import { AREA_RATIO } from '../../src/gen/recipe';
import { loadCampaign, ROOT, type CampaignSource } from './source';

interface Counts {
  readonly pegs: number;
  readonly bricks: number;
  readonly total: number;
}

/** Spec 15's round pegs, bricks and total per level id. */
async function spec15(): Promise<Map<string, Counts>> {
  const text = await readFile(path.join(ROOT, 'spec.md'), 'utf8');
  const block = /```csv\nstage,level,master,round_pegs,bricks,total\n([^`]*)```/.exec(text)?.[1];
  if (block === undefined) throw new Error('spec.md has no section 15 table');
  const out = new Map<string, Counts>();
  for (const row of block.trim().split('\n')) {
    const [stage, level, , pegs, bricks, total] = row.split(',');
    out.set(`${stage ?? ''}-${level ?? ''}`, {
      pegs: Number(pegs),
      bricks: Number(bricks),
      total: Number(total),
    });
  }
  return out;
}

/** The original's 55 level names, from research 5's table. */
async function originalNames(): Promise<string[]> {
  const file = path.join(ROOT, 'docs', 'research', 'original-tech.md');
  const text = await readFile(file, 'utf8');
  return [...text.matchAll(/^\| \d+ \| \d+-\d \| ([^|]+?) \| /gm)].map((m) => m[1] ?? '');
}

let campaign: CampaignSource;
let counts: Map<string, Counts>;

beforeAll(async () => {
  campaign = await loadCampaign();
  counts = await spec15();
});

describe('the campaign sources', () => {
  it('list the base game: 11 stages of 5 levels', () => {
    expect(campaign.stages.map((s) => s.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
    expect(campaign.levels).toHaveLength(55);
    expect(counts.size).toBe(55);
  });

  it('give every level its spec 15 count times 1.409, bricks rounded and pegs the rest', () => {
    for (const { level } of campaign.levels) {
      const c = counts.get(level.id);
      if (c === undefined) throw new Error(`spec 15 has no ${level.id}`);
      const total = Math.round(c.total * AREA_RATIO);
      expect(level.recipe.targetCount, level.id).toBe(total);
      if (level.plan === undefined) continue;
      const bricks = Math.round(c.bricks * AREA_RATIO);
      expect([level.plan.pegs, level.plan.bricks], level.id).toEqual([total - bricks, bricks]);
    }
  });

  it('name levels and pictures in their own words, each once', async () => {
    const originals = new Set((await originalNames()).map((n) => n.toLowerCase()));
    expect(originals.size).toBe(55);
    const names = campaign.levels.map((l) => l.level.name);
    expect(names.filter((n) => originals.has(n.toLowerCase()))).toEqual([]);
    expect(new Set(names).size).toBe(names.length);
    const pictures = campaign.levels.map((l) => l.level.background.id);
    expect(new Set(pictures).size).toBe(pictures.length);
  });

  it('plan each level inside its stage band, and no stage easier than the one before', () => {
    let previous = Infinity;
    for (const stage of campaign.stages) {
      const plans = campaign.levels
        .filter((l) => l.stage.stage === stage.stage)
        .flatMap((l) => (l.level.plan === undefined ? [] : [l.level.plan]));
      if (plans.length === 0) continue;
      const band = stageBand(stage.stage);
      for (const p of plans) {
        expect(p.difficulty.target, `stage ${stage.stage}`).toBeGreaterThanOrEqual(band.low);
        expect(p.difficulty.target, `stage ${stage.stage}`).toBeLessThanOrEqual(band.high);
      }
      const mean = plans.reduce((s, p) => s + p.difficulty.target, 0) / plans.length;
      expect(mean, `stage ${stage.stage}`).toBeLessThanOrEqual(previous + 1e-9);
      previous = mean;
    }
  });
});
