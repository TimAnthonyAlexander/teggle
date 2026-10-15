// Recipe + seed -> level. Each template part draws from its own random stream (the level seed
// mixed with the part's index), builds into its region, a fill tops the board up to the object
// count, and the recipe's manual edits (edits.ts) are applied last. The result passes the
// validity checks or comes back with its issues.

import { Rng } from '../core/rng';
import { isScoringElement, parseLevel, type Level } from '../level/schema';
import { Builder, type Rejected } from './builder';
import { BOARD_H, BOARD_W } from './constants';
import { applyEdits, type EditOutcome } from './edits';
import { GENERATOR_VERSION, mixSeed, recipeSchema, targetFor, type Recipe } from './recipe';
import { Draw, namedRegion } from './template';
import { buildFill } from './templates/fill';
import { TEMPLATES } from './templates';
import { validateLevel, type Issue } from './validate';

/** Background asset id for generated dev levels: the dev routes draw their own backdrop. */
export const DEV_BACKGROUND = 'dev-backdrop';

/** Part name of objects the recipe's edits added. */
export const EDIT_PART = 'edit';

/** A level as the generator builds it, before the validity checks. */
export interface AssembledLevel {
  readonly level: Level;
  readonly recipe: Recipe;
  /** Template part that placed each element, by element id ('edit' for added ones). */
  readonly partOf: ReadonlyMap<number, string>;
  /** Scoring objects each part placed, in recipe order, then the fill. */
  readonly parts: readonly { readonly name: string; readonly scoring: number }[];
  /** Candidates that did not fit where a template wanted them. */
  readonly rejected: readonly Rejected[];
  /** What the recipe's edits did; elements before them are `generated`. */
  readonly edits: EditOutcome;
  /** The elements as placed, before the edits. */
  readonly generated: Level['elements'];
  /** Scoring objects after the edits. */
  readonly scoring: number;
  /** Pegs the fill placed. */
  readonly fillPegs: number;
}

export interface GeneratedLevel extends AssembledLevel {
  readonly issues: readonly Issue[];
}

/** Builds a level from a recipe without the validity checks (fast: the editor's preview). */
export function assembleLevel(recipeInput: unknown, seed: number): AssembledLevel {
  const recipe = recipeSchema.parse(recipeInput);
  const builder = new Builder();
  const parts: { name: string; scoring: number }[] = [];
  recipe.parts.forEach((part, i) => {
    const template = TEMPLATES[part.template];
    const before = builder.scoringCount();
    const name = `${i + 1}:${part.template}`;
    template.run(
      {
        builder,
        draw: new Draw(Rng.fromSeed(mixSeed(seed, i + 1))),
        region: namedRegion(part.region ?? template.defaultRegion),
        part: name,
      },
      part.params,
    );
    parts.push({ name, scoring: builder.scoringCount() - before });
  });
  const beforeFill = builder.scoringCount();
  if (recipe.fill !== 'none') {
    buildFill(
      {
        builder,
        draw: new Draw(Rng.fromSeed(mixSeed(seed, 0))),
        region: namedRegion('full'),
        part: 'fill',
      },
      recipe.fill ?? {},
      targetFor(recipe),
    );
  }
  const fillPegs = builder.scoringCount() - beforeFill;
  if (recipe.fill !== 'none') parts.push({ name: 'fill', scoring: fillPegs });
  const generated = builder.elements();
  const edits = applyEdits(generated, recipe.edits ?? []);
  const level = parseLevel({
    formatVersion: 1,
    name: recipe.name,
    background: DEV_BACKGROUND,
    board: { width: BOARD_W, height: BOARD_H },
    elements: edits.elements,
    provenance: { generatorVersion: GENERATOR_VERSION, seed: seed >>> 0, recipe: recipeInput },
  });
  const partOf = new Map(builder.placed.map((p) => [p.element.id, p.part]));
  for (const id of edits.entryOf.keys()) if (!partOf.has(id)) partOf.set(id, EDIT_PART);
  return {
    level,
    recipe,
    partOf,
    parts,
    rejected: builder.rejected,
    edits,
    generated,
    scoring: level.elements.filter(isScoringElement).length,
    fillPegs,
  };
}

export function generateLevel(recipeInput: unknown, seed: number): GeneratedLevel {
  const assembled = assembleLevel(recipeInput, seed);
  return { ...assembled, issues: validateLevel(assembled.level) };
}
