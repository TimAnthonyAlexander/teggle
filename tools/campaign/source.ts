// The campaign's source data (campaign/ at the repository root), read from disk. The formats and
// what is composed from them (recipe, manifest, look) live in src/gen/campaign-source.ts, which
// the line editor shares; this module adds the paths and the loader.

import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import {
  levelSourceSchema,
  stagesFileSchema,
  type CampaignLevelSource,
  type StageSource,
} from '../../src/gen/campaign-source';
import { BOARD_H, BOARD_W } from '../../src/gen/constants';
import { LINES_FORMAT_VERSION, parseLines, type LinesFile } from '../../src/gen/lines';

export {
  composeManifest,
  composeRecipe,
  levelSourceSchema,
  linesPartIndex,
  recipeLineIds,
  stagesFileSchema,
  type CampaignLevelSource,
  type LevelSource,
  type StageSource,
  type StagesFile,
} from '../../src/gen/campaign-source';

export const ROOT = path.resolve(import.meta.dirname, '..', '..');
export const SOURCE_DIR = path.join(ROOT, 'campaign');
export const LEVELS_DIR = path.join(ROOT, 'public', 'levels', 'campaign');
export const BACKGROUNDS_DIR = path.join(ROOT, 'public', 'backgrounds');

/** A level's source with the stage it belongs to. */
export interface LoadedLevelSource extends CampaignLevelSource {
  readonly stage: StageSource;
}

export interface CampaignSource {
  readonly layout: string;
  readonly stages: readonly StageSource[];
  readonly levels: readonly LoadedLevelSource[];
}

async function readJson(file: string): Promise<unknown> {
  try {
    return JSON.parse(await readFile(file, 'utf8')) as unknown;
  } catch (err) {
    throw new Error(`${path.relative(ROOT, file)}: ${(err as Error).message}`, { cause: err });
  }
}

/** True when the file exists (a draft's lines file may not yet). */
async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** The lines of a draft that has none traced yet: an empty file on the standard board. */
function noLines(background: string): LinesFile {
  return parseLines({
    formatVersion: LINES_FORMAT_VERSION,
    background,
    board: { width: BOARD_W, height: BOARD_H },
    lines: [],
  });
}

function parseWith<T>(schema: z.ZodType<T>, json: unknown, file: string): T {
  const r = schema.safeParse(json);
  if (!r.success) {
    throw new Error(`${path.relative(ROOT, file)}:\n${z.prettifyError(r.error)}`);
  }
  return r.data;
}

/** Reads and checks every source file the stages list; a draft may have no lines file yet. */
export async function loadCampaign(): Promise<CampaignSource> {
  const stagesFile = path.join(SOURCE_DIR, 'stages.json');
  const stages = parseWith(stagesFileSchema, await readJson(stagesFile), stagesFile);
  const levels: LoadedLevelSource[] = [];
  for (const stage of stages.stages) {
    for (const id of stage.levels) {
      const file = path.join(SOURCE_DIR, 'levels', `${id}.json`);
      const level = parseWith(levelSourceSchema, await readJson(file), file);
      if (level.id !== id) throw new Error(`${path.relative(ROOT, file)}: id is ${level.id}`);
      const linesFile = path.join(LEVELS_DIR, `${id}.lines.json`);
      let lines: LinesFile;
      try {
        lines =
          level.draft === true && !(await exists(linesFile))
            ? noLines(level.background.id)
            : parseLines(await readJson(linesFile));
      } catch (err) {
        throw new Error(`${path.relative(ROOT, linesFile)}: ${(err as Error).message}`, {
          cause: err,
        });
      }
      if (lines.background !== level.background.id) {
        throw new Error(
          `${path.relative(ROOT, linesFile)} was traced on ${lines.background}, but ${id}'s picture is ${level.background.id}`,
        );
      }
      levels.push({ stage, level, lines });
    }
  }
  return { layout: stages.layout, stages: stages.stages, levels };
}
