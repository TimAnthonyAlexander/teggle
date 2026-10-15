// The campaign's source formats (campaign/ at the repository root) and what is composed from
// them, free of any file access so the build (tools/campaign/) and the line editor (src/editor/)
// share one definition:
//
//   campaign/stages.json        the stages in order: world, master, the pictures' shared style
//                               prompt, the level ids; plus the layout prompt every picture shares
//   campaign/levels/<id>.json   one level: name, concept, plan (archetypes, templates, split,
//                               moving parts, stage features, difficulty), background (asset id,
//                               prompt, how it was generated and edited) and recipe (seed, object
//                               count, solids, which lines, fill, manual edits)
//   public/levels/campaign/<id>.lines.json   the lines traced over its picture (lines.ts)
//
// A level marked `draft` is planned but has no final layout yet: the build skips it, it never
// appears in the manifest, and its lines file may be missing.
//
// From these come the generator recipe (composeRecipe), the manifest (composeManifest) and the
// exact text sent to the image model (composePrompt).

import { z } from 'zod';
import {
  CAMPAIGN_FORMAT_VERSION,
  parseCampaignManifest,
  type CampaignManifest,
} from '../level/campaign';
import { MOVEMENT_TYPES } from '../level/schema';
import { POWER_IDS } from '../rules/powers/ids';
import { editSchema } from './edits';
import { linePaths, SLUG, type LinesFile } from './lines';
import { partSchema, type RecipeInput } from './recipe';
import { TEMPLATE_NAMES } from './templates';
import { FILL_STYLES, fillParams } from './templates/fill';
import { solidsParams } from './templates/solids';

export const LEVEL_ID = /^(?:[1-9]|1[01])-[1-5]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const stagesFileSchema = z
  .strictObject({
    /** How every picture leaves room for the game: the second part of every prompt. */
    layout: z.string().min(1),
    stages: z
      .array(
        z.strictObject({
          stage: z.int().min(1).max(11),
          world: z.string().min(1).max(40),
          /** Power id of the stage's master; null for the Master levels. */
          master: z.enum(POWER_IDS).nullable(),
          /** The stage's look: the first part of the prompt of each of its pictures. */
          style: z.string().min(1),
          levels: z.array(z.string().regex(LEVEL_ID)).min(1).max(5),
        }),
      )
      .min(1)
      .max(11),
  })
  .superRefine((f, ctx) => {
    f.stages.forEach((s, i) => {
      s.levels.forEach((id, j) => {
        if (id !== `${s.stage}-${j + 1}`) {
          ctx.addIssue({
            code: 'custom',
            message: `stage ${s.stage}'s level ${j + 1} is ${s.stage}-${j + 1}, not ${id}`,
            path: ['stages', i, 'levels', j],
          });
        }
      });
    });
  });

export type StagesFile = z.output<typeof stagesFileSchema>;
export type StageSource = StagesFile['stages'][number];

/** Spec 9's level archetypes, named like the templates that build them. */
export const ARCHETYPES = [
  'outline',
  'plinko',
  'spiral',
  'rotating',
  'architecture',
  'platforms',
  'portals',
  'helix',
  'web',
] as const;

/**
 * Generator capabilities a plan relies on that the generator does not have yet.
 *   line-movers: the objects of a traced line move, as one rigid group (slide, wrap, orbit,
 *                float) or as a train with phases stepped along one path (a figure-eight, a
 *                wave, rising columns). Lines and the outline template carry no movement today.
 */
export const PLAN_NEEDS = ['line-movers'] as const;

/** The parts every campaign recipe may hold; besides them it places at most one template. */
const RECIPE_BASE_TEMPLATES: ReadonlySet<string> = new Set(['solids', 'outline']);

/**
 * How a level is meant to be built, written before its lines: what the stage plan promises the
 * level will be (docs/design/campaign-plan.md).
 */
export const planSchema = z
  .strictObject({
    /** Spec 9 archetypes the level combines. */
    archetypes: z.array(z.enum(ARCHETYPES)).min(1).max(3),
    /** Generator templates (src/gen/templates/) the recipe will use; 'outline' is the lines. */
    templates: z.array(z.enum(TEMPLATE_NAMES)).min(1).max(3),
    /** The recipe's fill, if any. */
    fill: z.enum(['none', ...FILL_STYLES]),
    /** Round pegs and bricks: together the recipe's count (spec 15 times 1.409). */
    pegs: z.int().min(0),
    bricks: z.int().min(0),
    /** What moves and how (spec 9's movement types). */
    moving: z
      .array(z.strictObject({ what: z.string().min(1), type: z.enum(MOVEMENT_TYPES) }))
      .default([]),
    /** Spec 8's documented stage features this level carries. */
    features: z.array(z.string().min(1)).default([]),
    /** Generator capabilities the plan relies on that do not exist yet. */
    needs: z.array(z.enum(PLAN_NEEDS)).default([]),
    difficulty: z.strictObject({
      /**
       * Intended clear rate of the reference agent (src/agents/bands.json: the noisy greedy
       * agent at its reference aim error), inside the stage's band.
       */
      target: z.number().min(0).max(1),
      /** Why this level sits where it does in its stage. */
      note: z.string().min(1),
    }),
  })
  .superRefine((p, ctx) => {
    if (new Set(p.templates).size !== p.templates.length) {
      ctx.addIssue({ code: 'custom', message: 'a template is listed twice', path: ['templates'] });
    }
    if (p.templates.filter((t) => !RECIPE_BASE_TEMPLATES.has(t)).length > 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'a campaign recipe places at most one template besides the solids and the lines',
        path: ['templates'],
      });
    }
    if (p.pegs === 0 && p.fill !== 'none') {
      ctx.addIssue({ code: 'custom', message: 'a bricks-only level has no fill', path: ['fill'] });
    }
  });

export type LevelPlan = z.output<typeof planSchema>;

const levelSourceShape = {
  id: z.string().regex(LEVEL_ID),
  /** Teggle's own name, never an original level name (research 5). */
  name: z.string().min(1).max(40),
  /**
   * The level is planned but its layout is not final: the build skips it, the manifest leaves
   * it out and its lines file may be missing. A draft needs its plan.
   */
  draft: z.literal(true).optional(),
  concept: z.strictObject({
    /** What the picture shows. */
    subject: z.string().min(1),
    /** Where its large shapes sit. */
    composition: z.string().min(1),
    /** How the layout follows the picture. */
    layout: z.string().min(1),
  }),
  plan: planSchema.optional(),
  background: z.strictObject({
    /** Asset id: public/backgrounds/<id>.webp. */
    id: z.string().regex(SLUG),
    /**
     * The subject part of the prompt; the stage's style and the shared layout part come first.
     * It describes the composition the lines were designed for, so the picture follows them.
     */
    prompt: z.string().min(1),
    /** The picture in public/backgrounds/, once one exists; absent while it is still to make. */
    picture: z
      .strictObject({
        model: z.literal('gpt-image-2'),
        /** The day the kept picture was generated. */
        generated: z.string().regex(DATE),
        /** Requested size and quality of the kept generation. */
        size: z.string().regex(/^\d+x\d+$/),
        quality: z.enum(['low', 'medium', 'high']),
        /** Generations made for this level, the kept one included. */
        generations: z.int().min(1),
        /**
         * The exact prompt of the kept picture when it was not the composed one (a style test
         * kept as the level's picture).
         */
        sent: z.string().min(1).optional(),
        /** Edits applied to the kept generation, in order. */
        edits: z
          .array(
            z.strictObject({
              date: z.string().regex(DATE),
              prompt: z.string().min(1),
              reason: z.string().min(1),
            }),
          )
          .default([]),
        /** What the picture still lacks that the lines already follow. */
        missing: z.string().min(1).optional(),
      })
      .optional(),
  }),
  recipe: z.strictObject({
    seed: z.int().min(0).max(0xffffffff),
    /** Scoring objects the level must have: spec 15's count for the level times 1.409. */
    targetCount: z.int().min(40).max(260),
    /** Solids traced from the picture, placed first. */
    solids: solidsParams.optional(),
    /** Line ids in placement order; when absent, every line in file order. */
    lines: z.array(z.string().regex(SLUG)).optional(),
    /** One more generator part, placed after the lines. */
    parts: z.array(partSchema).max(1).default([]),
    /**
     * Pegs that top the level up to its count, or 'none'. `within` names a line whose control
     * points outline the area the fill stays inside (an open line is closed end to start).
     */
    fill: z
      .union([
        z.literal('none'),
        fillParams
          .omit({ within: true, count: true })
          .extend({ within: z.string().regex(SLUG).optional() }),
      ])
      .default('none'),
    /** Manual edits made in the line editor, applied after everything is placed (edits.ts). */
    edits: z.array(editSchema).max(400).default([]),
  }),
};

export const levelSourceSchema = z.strictObject(levelSourceShape).superRefine((l, ctx) => {
  if (l.draft === true && l.plan === undefined) {
    ctx.addIssue({ code: 'custom', message: 'a draft needs its plan', path: ['plan'] });
  }
  if (l.plan !== undefined && l.plan.pegs + l.plan.bricks !== l.recipe.targetCount) {
    ctx.addIssue({
      code: 'custom',
      message: `the plan's ${l.plan.pegs} pegs and ${l.plan.bricks} bricks are not the recipe's ${l.recipe.targetCount} objects`,
      path: ['plan', 'pegs'],
    });
  }
});

export type LevelSource = z.output<typeof levelSourceSchema>;
export type LevelSourceInput = z.input<typeof levelSourceSchema>;

/** A level's source, its stage and its lines, checked against each other. */
export interface CampaignLevelSource {
  readonly stage: { readonly stage: number };
  readonly level: LevelSource;
  readonly lines: LinesFile;
}

/** The stage of a level id ("3-2" -> 3). */
export function stageOf(id: string): number {
  return Number(id.split('-')[0]);
}

/** The prompt for a level's picture: the stage's style, the shared layout, the subject. */
export function composePrompt(layout: string, stage: StageSource, level: LevelSource): string {
  return `${stage.style}\n\n${layout}\n\nSubject: ${level.background.prompt}`;
}

/** The ids of the lines a level's recipe places, in placement order. */
export function recipeLineIds(src: CampaignLevelSource): string[] {
  return src.level.recipe.lines ?? src.lines.lines.map((l) => l.id);
}

/** The generator recipe of a level: its solids, then its lines, then any other part. */
export function composeRecipe(src: CampaignLevelSource): RecipeInput {
  const r = src.level.recipe;
  const ids = recipeLineIds(src);
  const parts: RecipeInput['parts'][number][] = [];
  if (r.solids !== undefined) parts.push({ template: 'solids', params: r.solids });
  if (ids.length > 0) {
    parts.push({ template: 'outline', params: { paths: linePaths(src.lines, ids) } });
  }
  parts.push(...r.parts);
  if (parts.length === 0) throw new Error(`${src.level.id}: the recipe places nothing`);
  let fill: RecipeInput['fill'] = 'none';
  if (r.fill !== 'none') {
    const { within, ...rest } = r.fill;
    if (within === undefined) {
      fill = rest;
    } else {
      const area = src.lines.lines.find((l) => l.id === within);
      if (area === undefined) throw new Error(`${src.level.id}: no line "${within}" to fill`);
      fill = { ...rest, within: { points: area.points, corners: area.corners } };
    }
  }
  return {
    name: src.level.name,
    stage: src.stage.stage,
    targetCount: r.targetCount,
    parts,
    fill,
    ...(r.edits.length > 0 ? { edits: r.edits } : {}),
  };
}

/** Index of the outline part that holds a level's lines in its recipe, or -1. */
export function linesPartIndex(src: CampaignLevelSource): number {
  if (recipeLineIds(src).length === 0) return -1;
  return src.level.recipe.solids === undefined ? 0 : 1;
}

/**
 * The manifest of the levels given (in campaign order), checked by the game's own schema.
 * Drafts are left out.
 */
export function composeManifest(
  stages: readonly StageSource[],
  levels: readonly Pick<CampaignLevelSource, 'stage' | 'level'>[],
): CampaignManifest {
  const json = {
    formatVersion: CAMPAIGN_FORMAT_VERSION,
    stages: stages
      .map((s) => ({
        stage: s.stage,
        world: s.world,
        master: s.master,
        levels: levels
          .filter((l) => l.stage.stage === s.stage && l.level.draft !== true)
          .map((l) => {
            const n = Number(l.level.id.split('-')[1]);
            return {
              id: l.level.id,
              number: (s.stage - 1) * 5 + n,
              name: l.level.name,
              file: `campaign/${l.level.id}.json`,
              lines: `campaign/${l.level.id}.lines.json`,
              background: l.level.background.id,
            };
          }),
      }))
      .filter((s) => s.levels.length > 0),
  };
  return parseCampaignManifest(json);
}
