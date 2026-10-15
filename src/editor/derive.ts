// What the editor makes from its document: the generator recipe (the same composition the
// campaign build uses), and which line placed which object.

import {
  composeRecipe,
  levelSourceSchema,
  linesPartIndex,
  recipeLineIds,
  stageOf,
  type CampaignLevelSource,
  type LevelSource,
} from '../gen/campaign-source';
import type { Nudge } from '../gen/fit';
import { parseLines } from '../gen/lines';
import type { RecipeInput } from '../gen/recipe';
import { PATH_PART } from '../gen/templates/outline';
import type { Doc } from './doc';

export interface Composed {
  readonly src: CampaignLevelSource;
  readonly recipe: RecipeInput;
  readonly seed: number;
  readonly background: string;
  /** Line id of each traced path, by path index. */
  readonly ids: readonly string[];
  /** Index of the recipe part that holds the lines, or -1. */
  readonly part: number;
}

export type Composition =
  | { readonly ok: true; readonly value: Composed }
  | { readonly ok: false; readonly error: string; readonly empty: boolean };

function message(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The level's source as the build will read it; names a new level has not got yet stay blank. */
export function levelOf(doc: Doc): LevelSource | string {
  const recipe = levelSourceSchema.shape.recipe.safeParse(doc.source.recipe);
  if (!recipe.success) return `recipe: ${recipe.error.issues[0]?.message ?? 'invalid'}`;
  const s = doc.source;
  return {
    id: s.id,
    name: s.name,
    concept: s.concept,
    background: { id: s.background.id, prompt: s.background.prompt },
    recipe: recipe.data,
  };
}

export function compose(doc: Doc): Composition {
  let lines;
  try {
    lines = parseLines(doc.lines);
  } catch (err) {
    return { ok: false, error: message(err).replace(/^Invalid lines file:\n/, ''), empty: false };
  }
  const level = levelOf(doc);
  if (typeof level === 'string') return { ok: false, error: level, empty: false };
  // A level without a name yet still previews; the save asks for one.
  const named = level.name === '' ? { ...level, name: 'Untitled' } : level;
  const src: CampaignLevelSource = { stage: { stage: stageOf(level.id) }, level: named, lines };
  if (recipeLineIds(src).length === 0 && level.recipe.solids === undefined) {
    return {
      ok: false,
      error: 'No lines yet: press N and click on the board to draw one.',
      empty: true,
    };
  }
  try {
    return {
      ok: true,
      value: {
        src,
        recipe: composeRecipe(src),
        seed: level.recipe.seed,
        background: level.background.id,
        ids: recipeLineIds(src),
        part: linesPartIndex(src),
      },
    };
  } catch (err) {
    return { ok: false, error: message(err), empty: false };
  }
}

/** Fitted spacings by line id and the fill's count, from a fit's nudges. */
export interface Sticky {
  readonly spacing: ReadonlyMap<string, number>;
  readonly fillCount: number | null;
}

export const NO_STICKY: Sticky = { spacing: new Map(), fillCount: null };

export function stickyOf(c: Composed, nudges: readonly Nudge[]): Sticky {
  const spacing = new Map<string, number>();
  let fillCount: number | null = null;
  for (const n of nudges) {
    if (n.kind === 'fill') fillCount = n.count;
    else if (n.part === c.part) {
      const id = c.ids[n.path];
      if (id !== undefined) spacing.set(id, n.to);
    }
  }
  return { spacing, fillCount };
}

/**
 * The recipe with the last fit's nudges applied where they still fit the lines, so the live
 * preview does not jump while the next fit runs.
 */
export function withSticky(c: Composed, sticky: Sticky): RecipeInput {
  if (sticky.spacing.size === 0 && sticky.fillCount === null) return c.recipe;
  const r = JSON.parse(JSON.stringify(c.recipe)) as RecipeInput;
  const part = r.parts[c.part];
  const paths = (
    part?.params as
      { paths?: { mode?: string; spacing?: number; keepSpacing?: boolean }[] } | undefined
  )?.paths;
  c.ids.forEach((id, i) => {
    const s = sticky.spacing.get(id);
    const p = paths?.[i];
    if (s !== undefined && p !== undefined && p.mode === 'pegs' && p.keepSpacing !== true) {
      p.spacing = s;
    }
  });
  if (sticky.fillCount !== null && r.fill !== 'none') {
    r.fill = { ...(r.fill ?? {}), count: sticky.fillCount };
  }
  return r;
}

/** The line id that placed an object, from its part name ("2:outline/path 4"), or null. */
export function lineOfPart(c: Composed, part: string | undefined): string | null {
  if (part === undefined) return null;
  const at = part.indexOf(PATH_PART);
  if (at < 0) return null;
  const index = Number(part.slice(0, part.indexOf(':'))) - 1;
  if (index !== c.part) return null;
  return c.ids[Number(part.slice(at + PATH_PART.length))] ?? null;
}
