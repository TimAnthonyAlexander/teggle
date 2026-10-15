// Campaign manifest: the stages in play order, each with its master and its five levels, and
// where each level's files are. `npm run campaign:build` writes it to
// public/levels/campaign/manifest.json from the sources in campaign/; the menus read it.
//
// Paths are relative to public/levels/ (the play route's `#/play/<path>`); a background is an
// asset id, its picture public/backgrounds/<id>.webp.

import { z } from 'zod';
import { masterOfStage } from '../rules/masters';
import { POWER_IDS } from '../rules/powers/ids';

export const CAMPAIGN_FORMAT_VERSION = 1;
/** Stages 1 to 10 have one master each; stage 11 is the Master levels (spec 8). */
export const STAGE_COUNT = 11;
export const LEVELS_PER_STAGE = 5;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const campaignLevelSchema = z.strictObject({
  /** "<stage>-<level>", e.g. "1-3". */
  id: z.string().regex(/^(?:[1-9]|1[01])-[1-5]$/),
  /** Position in the campaign, 1 to 55: greens appear from 3, purple from 4 (spec 8). */
  number: z
    .int()
    .min(1)
    .max(STAGE_COUNT * LEVELS_PER_STAGE),
  name: z.string().min(1).max(40),
  /** Level file. */
  file: z.string().regex(/^campaign\/[0-9-]+\.json$/),
  /** The lines traced over the picture (src/gen/lines.ts). */
  lines: z.string().regex(/^campaign\/[0-9-]+\.lines\.json$/),
  /** Background asset id. */
  background: z.string().regex(SLUG),
});

export const campaignStageSchema = z.strictObject({
  stage: z.int().min(1).max(STAGE_COUNT),
  /** The setting the stage's pictures share. */
  world: z.string().min(1).max(40),
  /** Power id of the stage's master (src/rules/masters.ts); null where the player picks. */
  master: z.enum(POWER_IDS).nullable(),
  levels: z.array(campaignLevelSchema).min(1).max(LEVELS_PER_STAGE),
});

export const campaignManifestSchema = z
  .strictObject({
    formatVersion: z.literal(CAMPAIGN_FORMAT_VERSION),
    stages: z.array(campaignStageSchema).min(1).max(STAGE_COUNT),
  })
  .superRefine((m, ctx) => {
    const names = new Set<string>();
    const backgrounds = new Set<string>();
    m.stages.forEach((s, i) => {
      if (s.stage !== i + 1) {
        ctx.addIssue({
          code: 'custom',
          message: `stage ${s.stage} is listed at position ${i + 1}`,
          path: ['stages', i, 'stage'],
        });
      }
      const master = masterOfStage(s.stage)?.power ?? null;
      if (s.master !== master) {
        ctx.addIssue({
          code: 'custom',
          message: `stage ${s.stage} belongs to ${master ?? 'no single master'}, not ${s.master ?? 'none'}`,
          path: ['stages', i, 'master'],
        });
      }
      s.levels.forEach((l, j) => {
        const where = ['stages', i, 'levels', j];
        const id = `${s.stage}-${j + 1}`;
        if (l.id !== id) {
          ctx.addIssue({ code: 'custom', message: `level ${l.id} should be ${id}`, path: where });
        }
        const number = (s.stage - 1) * LEVELS_PER_STAGE + j + 1;
        if (l.number !== number) {
          ctx.addIssue({
            code: 'custom',
            message: `level ${l.id} is campaign level ${number}, not ${l.number}`,
            path: [...where, 'number'],
          });
        }
        if (l.file !== `campaign/${l.id}.json` || l.lines !== `campaign/${l.id}.lines.json`) {
          ctx.addIssue({
            code: 'custom',
            message: `level ${l.id}'s files are campaign/${l.id}.json and campaign/${l.id}.lines.json`,
            path: where,
          });
        }
        if (names.has(l.name)) {
          ctx.addIssue({
            code: 'custom',
            message: `the name "${l.name}" is used twice`,
            path: [...where, 'name'],
          });
        }
        if (backgrounds.has(l.background)) {
          ctx.addIssue({
            code: 'custom',
            message: `the background "${l.background}" is used twice`,
            path: [...where, 'background'],
          });
        }
        names.add(l.name);
        backgrounds.add(l.background);
      });
    });
  });

export type CampaignManifest = z.output<typeof campaignManifestSchema>;
export type CampaignStage = CampaignManifest['stages'][number];
export type CampaignLevel = CampaignStage['levels'][number];

export class CampaignFormatError extends Error {
  override readonly name = 'CampaignFormatError';
}

/** Validates an untrusted campaign manifest. Throws CampaignFormatError. */
export function parseCampaignManifest(json: unknown): CampaignManifest {
  const result = campaignManifestSchema.safeParse(json);
  if (!result.success) {
    throw new CampaignFormatError(`Invalid campaign manifest:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
