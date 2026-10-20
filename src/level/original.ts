// The original game's 55 campaign levels as Quick Play plays them (spec 14.1, "The original's
// levels"). `npm run original:import` (tools/original/import.ts) converts the owner's copy into
// public/original/: per level a level file at the original's 650 x 560 board and its picture, plus
// this manifest. Paths in the manifest are relative to public/original/; a background is a picture
// id, its file backgrounds/<id>.webp.

import { z } from 'zod';
import { LEVELS_PER_STAGE, STAGE_COUNT } from './campaign';

export const ORIGINAL_FORMAT_VERSION = 1;
export const ORIGINAL_LEVEL_COUNT = STAGE_COUNT * LEVELS_PER_STAGE;

/**
 * Where the original draws a level's 646 x 543 picture, in board coordinates: at window (78, 52),
 * the top left corner of its frame's opening, with the board at window (75, 40). Measured by
 * matching the pictures and the pegs against the original's own cached thumbnails (spec 14.2).
 */
export const ORIGINAL_PICTURE = { x: 3, y: 12, width: 646, height: 543 } as const;

const ID = /^(?:[1-9]|1[01])-[1-5]$/;
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const originalLevelSchema = z.strictObject({
  /** "<stage>-<level>" in the original's campaign, e.g. "6-1". */
  id: z.string().regex(ID),
  /** Place in the original's campaign, 1 to 55. */
  number: z.int().min(1).max(ORIGINAL_LEVEL_COUNT),
  stage: z.int().min(1).max(STAGE_COUNT),
  /** The original's display name. */
  name: z.string().min(1).max(40),
  /** Level file. */
  file: z.string().regex(/^levels\/(?:[1-9]|1[01])-[1-5]\.json$/),
  /** Picture id. */
  background: z.string().regex(SLUG),
});

export const originalManifestSchema = z
  .strictObject({
    formatVersion: z.literal(ORIGINAL_FORMAT_VERSION),
    levels: z.array(originalLevelSchema).min(1).max(ORIGINAL_LEVEL_COUNT),
  })
  .superRefine((m, ctx) => {
    const backgrounds = new Set<string>();
    m.levels.forEach((l, i) => {
      const where = ['levels', i];
      const number = i + 1;
      const stage = Math.ceil(number / LEVELS_PER_STAGE);
      const id = `${stage}-${number - (stage - 1) * LEVELS_PER_STAGE}`;
      if (l.number !== number || l.stage !== stage || l.id !== id) {
        ctx.addIssue({
          code: 'custom',
          message: `entry ${number} should be level ${id} (number ${number}, stage ${stage})`,
          path: where,
        });
      }
      if (l.file !== `levels/${l.id}.json`) {
        ctx.addIssue({
          code: 'custom',
          message: `level ${l.id}'s file is levels/${l.id}.json`,
          path: [...where, 'file'],
        });
      }
      if (backgrounds.has(l.background)) {
        ctx.addIssue({
          code: 'custom',
          message: `the background "${l.background}" is used twice`,
          path: [...where, 'background'],
        });
      }
      backgrounds.add(l.background);
    });
  });

export type OriginalManifest = z.output<typeof originalManifestSchema>;
export type OriginalEntry = OriginalManifest['levels'][number];

export class OriginalFormatError extends Error {
  override readonly name = 'OriginalFormatError';
}

/** Validates an untrusted manifest of the original's levels. Throws OriginalFormatError. */
export function parseOriginalManifest(json: unknown): OriginalManifest {
  const result = originalManifestSchema.safeParse(json);
  if (!result.success) {
    throw new OriginalFormatError(
      `Invalid manifest of the original's levels:\n${z.prettifyError(result.error)}`,
    );
  }
  return result.data;
}
