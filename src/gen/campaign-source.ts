// The campaign's source formats (campaign/ at the repository root) and what is composed from
// them, free of any file access so the build (tools/campaign/) and the line editor (src/editor/)
// share one definition:
//
//   campaign/stages.json        the stages in order: world, master, the world's palette, the look
//                               its pictures are processed into, the level ids; plus the layout
//                               rule every picture follows
//   campaign/levels/<id>.json   one level: name, concept, plan (archetypes, templates, split,
//                               moving parts, stage features, difficulty), background (asset id,
//                               brief, the found picture: source, crop and adjustments) and recipe
//                               (seed, object count, solids, which lines, fill, manual edits)
//   public/levels/campaign/<id>.lines.json   the lines traced over its picture (lines.ts)
//
// A level marked `draft` is planned but has no final layout yet: the build skips it, it never
// appears in the manifest, and its lines file may be missing.
//
// From these come the generator recipe (composeRecipe), the manifest (composeManifest) and the
// processing settings of a level's picture (lookOf; tools/campaign/look.ts runs them).

import { z } from 'zod';
import {
  CAMPAIGN_FORMAT_VERSION,
  parseCampaignManifest,
  type CampaignManifest,
} from '../level/campaign';
import { MOVEMENT_TYPES } from '../level/schema';
import { POWER_IDS } from '../rules/powers/ids';
import { editSchema } from './edits';
import { lineGroups, linePaths, SLUG, type LinesFile } from './lines';
import { partSchema, type RecipeInput } from './recipe';
import { TEMPLATE_NAMES } from './templates';
import { FILL_STYLES, fillParams } from './templates/fill';
import { solidsParams } from './templates/solids';

export const LEVEL_ID = /^(?:[1-9]|1[01])-[1-5]$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const HEX = /^#[0-9a-f]{6}$/;

/**
 * How a stage's pictures are processed into one look (tools/campaign/look.ts, spec 14.2
 * "Decided in the backgrounds"). The steps run in this order: soften (by the picture's kind,
 * PAINT_BY_KIND), brightness and saturation, the palette's gradient map blended in, gamma,
 * then the values squeezed into [floor, ceiling].
 */
export const stageLookSchema = z.strictObject({
  /** Brightness multiplier. */
  brightness: z.number().min(0.5).max(1.6),
  /** Saturation multiplier of the picture's own colors. */
  saturation: z.number().min(0).max(1.6),
  /** The stage's palette as a gradient map: shadow, middle and light color. */
  palette: z.tuple([z.string().regex(HEX), z.string().regex(HEX), z.string().regex(HEX)]),
  /** Share of the gradient map laid over the picture's own colors. */
  tint: z.number().min(0).max(1),
  /** Midtone gamma; above 1 lightens. */
  gamma: z.number().min(0.4).max(2.5),
  /** The darkest and lightest values the picture keeps, 0 to 1: no dark areas, no glare. */
  floor: z.number().min(0).max(0.7),
  ceiling: z.number().min(0.3).max(1),
});

/** Every processing setting of one picture: the stage's look plus its softening. */
export const lookSchema = stageLookSchema.extend({
  /**
   * Softening: the radius of the edge-preserving smoothing (Kuwahara) at half the shipped size,
   * which flattens texture into painted patches and keeps large shapes. 0 leaves the picture.
   */
  paint: z.number().min(0).max(8),
});

export type Look = z.output<typeof lookSchema>;

export const stagesFileSchema = z
  .strictObject({
    /** What every picture leaves free for the game: the shared rule for choosing pictures. */
    layout: z.string().min(1),
    stages: z
      .array(
        z.strictObject({
          stage: z.int().min(1).max(11),
          world: z.string().min(1).max(40),
          /** Power id of the stage's master; null for the Master levels. */
          master: z.enum(POWER_IDS).nullable(),
          /** The world: what its pictures show, its colors and light, its readability limits. */
          palette: z.string().min(1),
          /** The look every picture of the stage is processed into. */
          look: stageLookSchema,
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

/** A found picture is a painting or illustration, or a photo; a photo is softened more. */
export const PICTURE_KINDS = ['painting', 'photo'] as const;

/**
 * Softening (Look.paint) by kind, shared by every stage: photographic detail needs more to sit
 * inside the painted look than a picture that is painted already.
 */
export const PAINT_BY_KIND: Readonly<Record<(typeof PICTURE_KINDS)[number], number>> = {
  painting: 1,
  photo: 3,
};

/**
 * A level's picture: a painting, illustration or photo found on the web (no generated or paid
 * images, spec 12), where it came from, and how it becomes the shipped picture.
 */
export const pictureSchema = z
  .strictObject({
    /**
     * The picture in the art tool's sources: "pexels:<id>", "pixabay:<id>", "wallhaven:<id>",
     * "openverse:<id>", "commons:<file name>", or "web" for a file fetched by its URL.
     */
    ref: z.string().min(1),
    kind: z.enum(PICTURE_KINDS),
    /** The site it was found on. */
    source: z.string().min(1),
    /** Its page there. */
    page: z.url(),
    /** The file downloaded. */
    image: z.url(),
    title: z.string().min(1).optional(),
    author: z.string().min(1).optional(),
    authorUrl: z.url().optional(),
    /** The license where the source states one; the game is private, so none is required. */
    license: z.string().min(1).optional(),
    licenseUrl: z.url().optional(),
    fetched: z.string().regex(DATE),
    /** SHA-256 of the downloaded file: the processing always starts from these bytes. */
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    /** Pixel size of the downloaded file. */
    size: z.tuple([z.int().min(1), z.int().min(1)]),
    /** The part used, in the file's pixels: x, y, width, height, at the shipped aspect. */
    crop: z.tuple([z.int().min(0), z.int().min(0), z.int().min(1), z.int().min(1)]),
    /** Mirrored left to right after the crop. */
    flop: z.boolean().default(false),
    /** The level's own changes to its stage's look, as few and as small as possible. */
    adjust: lookSchema.partial().default({}),
  })
  .superRefine((p, ctx) => {
    const [x, y, w, h] = p.crop;
    if (x + w > p.size[0] || y + h > p.size[1]) {
      ctx.addIssue({ code: 'custom', message: 'the crop leaves the picture', path: ['crop'] });
    }
  });

export type Picture = z.output<typeof pictureSchema>;

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
     * The brief: what the picture shows and where its large shapes sit, in fractions of the
     * picture as shipped, for tracing lines over it and for finding another picture should it
     * be replaced. (It began as an image prompt; the line editor still calls it the prompt.)
     */
    prompt: z.string().min(1),
    /** The picture behind public/backgrounds/<id>.webp; absent while none is chosen. */
    picture: pictureSchema.optional(),
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

/**
 * The processing settings of a level's picture: its stage's look, the softening its kind needs,
 * then the level's own adjustments.
 */
export function lookOf(stage: StageSource, picture: Picture): Look {
  const adjust = Object.fromEntries(
    Object.entries(picture.adjust).filter(([, v]) => v !== undefined),
  ) as Partial<Look>;
  return { ...stage.look, paint: PAINT_BY_KIND[picture.kind], ...adjust };
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
    const groups = lineGroups(src.lines, ids);
    parts.push({
      template: 'outline',
      params: { paths: linePaths(src.lines, ids), ...(groups.length > 0 ? { groups } : {}) },
    });
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
