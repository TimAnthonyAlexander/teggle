// A recipe is the generator's input: which templates, where, with which parameters, and how
// many objects the level should end up with. With a seed and the generator version it
// reproduces a level exactly; the level file keeps all three in its provenance.

import { z } from 'zod';
import { REGION_NAMES } from './template';
import { fillParams } from './templates/fill';
import { TEMPLATE_NAMES } from './templates';

/** Bump when a change makes any recipe and seed produce a different level. */
export const GENERATOR_VERSION = '1.0.0';

export const partSchema = z.strictObject({
  template: z.enum(TEMPLATE_NAMES),
  region: z.enum(REGION_NAMES).optional(),
  /** Template parameters; anything left out is drawn from the seed. */
  params: z.record(z.string(), z.unknown()).optional(),
});

export const recipeSchema = z.strictObject({
  name: z.string().min(1),
  /**
   * Scoring objects to aim for. The original's 85 to 134 (median 103) scale by 1.409 to the
   * 16:9 board: about 120 to 189 (spec 14.1). Default: from the stage, else 145.
   */
  targetCount: z.int().min(40).max(260).optional(),
  /** Campaign stage 1 to 11; sets the default target from the stage averages (spec 13.2). */
  stage: z.int().min(1).max(11).optional(),
  /** One to three templates; two or three mix in one level. */
  parts: z.array(partSchema).min(1).max(3),
  /** Pegs that fill the free space up to the target, or 'none'. */
  fill: z.union([z.literal('none'), fillParams]).optional(),
});

export type Recipe = z.output<typeof recipeSchema>;
export type RecipeInput = z.input<typeof recipeSchema>;
export type Part = z.output<typeof partSchema>;

/**
 * Stage averages of the original (97 at stage 1 rising to 117 at stage 11, spec 8) scaled by
 * the 16:9 area ratio 1.409.
 */
const STAGE_AVERAGES = [97, 107, 102, 105, 105, 114, 99, 103, 109, 113, 117];
export const AREA_RATIO = 1.409;

export function targetFor(recipe: Recipe): number {
  if (recipe.targetCount !== undefined) return recipe.targetCount;
  if (recipe.stage !== undefined) {
    return Math.round((STAGE_AVERAGES[recipe.stage - 1] ?? 103) * AREA_RATIO);
  }
  return 145;
}

/** Mixes a level seed with a part index into an independent 32-bit seed. */
export function mixSeed(seed: number, salt: number): number {
  let h = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}
