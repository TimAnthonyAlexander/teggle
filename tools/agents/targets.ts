// What the self-play tools can measure, named on the command line:
//
//   campaign            every level in public/levels/campaign/manifest.json
//   3                   campaign stage 3
//   3-2                 campaign level 3-2
//   original            the original's 55 campaign levels (reference/, converted at run time)
//   original:3          the original's stage 3
//   original:3-2        the original's level 3-2
//   path/to/level.json  one level file
//   path/to/dir         every level file in a directory
//
// Campaign levels and the original's play with the rules of their campaign slot (greens from
// level 3, purple from level 4, the stage master's power; on the Master levels each run draws a
// master), the original's with its own 25 orange pegs drawn uniformly. Level files play with the
// Quick Play defaults and no power.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { parseCampaignManifest } from '../../src/level/campaign';
import { parseLevel, type Level } from '../../src/level/schema';
import { attemptConfig, campaignConfig, type AttemptConfig } from '../../src/rules/config';
import { masterOfStage } from '../../src/rules/masters';
import { ORIGINAL_ORANGE_COUNT } from '../../src/rules/tuning';
import { loadOriginal, ORIGINAL_CAMPAIGN } from './original';

export const CAMPAIGN_DIR = 'public/levels';
export const MANIFEST = 'public/levels/campaign/manifest.json';

export type TargetSource = 'campaign' | 'original' | 'file';

export interface Target {
  /** Stable name; run seeds derive from it. "1-3", "original 1-3", or the file path. */
  readonly key: string;
  readonly source: TargetSource;
  /** Campaign stage and number, or null for a level file. */
  readonly stage: number | null;
  readonly number: number | null;
  readonly level: Level;
  /** Rules before command-line overrides. */
  readonly config: AttemptConfig;
  /** The player picks the master: each run draws one. */
  readonly anyMaster: boolean;
}

export class TargetError extends Error {
  override readonly name = 'TargetError';
}

function readJson(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'));
}

/** Rules of campaign slot `number` (1 to 55), without the campaign clear bonus. */
export function slotConfig(number: number): { config: AttemptConfig; anyMaster: boolean } {
  const stage = Math.ceil(number / 5);
  const power = masterOfStage(stage)?.power ?? null;
  const config = campaignConfig({ level: number, try: 1, firstPlay: false, power });
  return { config: { ...config, campaignTry: null }, anyMaster: power === null };
}

function campaignTargets(filter: (stage: number, id: string) => boolean): Target[] {
  const manifest = parseCampaignManifest(readJson(MANIFEST));
  const out: Target[] = [];
  for (const s of manifest.stages) {
    for (const l of s.levels) {
      if (!filter(s.stage, l.id)) continue;
      const level = parseLevel(readJson(join(CAMPAIGN_DIR, l.file)));
      out.push({
        key: l.id,
        source: 'campaign',
        stage: s.stage,
        number: l.number,
        level,
        ...slotConfig(l.number),
      });
    }
  }
  return out;
}

/** The original's levels play with its own 25 orange pegs, drawn uniformly (spec 14.2). */
function originalTarget(number: number): Target {
  const o = loadOriginal(number);
  const slot = slotConfig(number);
  return {
    key: `original ${o.id}`,
    source: 'original',
    stage: o.stage,
    number,
    level: o.level,
    config: { ...slot.config, orangeCount: ORIGINAL_ORANGE_COUNT, orangeDraw: 'uniform' },
    anyMaster: slot.anyMaster,
  };
}

function fileTarget(path: string): Target {
  return {
    key: relative('.', path),
    source: 'file',
    stage: null,
    number: null,
    level: parseLevel(readJson(path)),
    config: attemptConfig(),
    anyMaster: false,
  };
}

const LEVEL_ID = /^(\d{1,2})-([1-5])$/;
const STAGE = /^(\d{1,2})$/;

function numberOf(stage: number, level: number): number {
  return (stage - 1) * 5 + level;
}

function checkStage(stage: number, arg: string): number {
  if (stage < 1 || stage > 11) throw new TargetError(`"${arg}": stages run from 1 to 11`);
  return stage;
}

/** Resolves one command-line target to its levels. */
export function resolveTarget(arg: string): Target[] {
  if (arg === 'campaign') return campaignTargets(() => true);
  let m = STAGE.exec(arg);
  if (m !== null) {
    const stage = checkStage(Number(m[1]), arg);
    const found = campaignTargets((s) => s === stage);
    if (found.length === 0) throw new TargetError(`the campaign has no stage ${stage} yet`);
    return found;
  }
  m = LEVEL_ID.exec(arg);
  if (m !== null) {
    checkStage(Number(m[1]), arg);
    const found = campaignTargets((_s, id) => id === arg);
    if (found.length === 0) throw new TargetError(`the campaign has no level ${arg} yet`);
    return found;
  }
  if (arg === 'original' || arg.startsWith('original:')) {
    const rest = arg.slice('original:'.length);
    if (arg === 'original') return ORIGINAL_CAMPAIGN.map((_name, i) => originalTarget(i + 1));
    m = STAGE.exec(rest);
    if (m !== null) {
      const stage = checkStage(Number(m[1]), arg);
      return [1, 2, 3, 4, 5].map((l) => originalTarget(numberOf(stage, l)));
    }
    m = LEVEL_ID.exec(rest);
    if (m !== null) return [originalTarget(numberOf(checkStage(Number(m[1]), arg), Number(m[2])))];
    throw new TargetError(`"${arg}": use original, original:<stage> or original:<stage>-<level>`);
  }
  if (!existsSync(arg)) throw new TargetError(`"${arg}" is not a level, a stage or a path`);
  if (statSync(arg).isDirectory()) {
    const files = readdirSync(arg)
      .filter((f) => f.endsWith('.json') && !f.endsWith('.lines.json') && f !== 'manifest.json')
      .sort();
    if (files.length === 0) throw new TargetError(`${arg} holds no level files`);
    return files.map((f) => fileTarget(join(arg, f)));
  }
  return [fileTarget(arg)];
}

/** Resolves every target, keeping the first of any level named twice. */
export function resolveTargets(args: readonly string[]): Target[] {
  const seen = new Set<string>();
  const out: Target[] = [];
  for (const arg of args) {
    for (const t of resolveTarget(arg)) {
      if (seen.has(t.key)) continue;
      seen.add(t.key);
      out.push(t);
    }
  }
  return out;
}
