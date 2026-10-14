// Recipe + seed -> level. Each template part draws from its own random stream (the level seed
// mixed with the part's index), builds into its region, and a fill tops the board up to the
// object count. The result passes the validity checks or comes back with its issues.

import { Rng } from '../core/rng';
import { parseLevel, type Level } from '../level/schema';
import { Builder } from './builder';
import { BOARD_H, BOARD_W } from './constants';
import { GENERATOR_VERSION, mixSeed, recipeSchema, targetFor, type Recipe } from './recipe';
import { Draw, namedRegion } from './template';
import { buildFill } from './templates/fill';
import { TEMPLATES } from './templates';
import { validateLevel, type Issue } from './validate';

/** Background asset id for generated dev levels: the dev routes draw their own backdrop. */
export const DEV_BACKGROUND = 'dev-backdrop';

export interface GeneratedLevel {
  readonly level: Level;
  readonly recipe: Recipe;
  /** Template part that placed each element, by element id. */
  readonly partOf: ReadonlyMap<number, string>;
  /** Scoring objects each part placed, in recipe order, then the fill. */
  readonly parts: readonly { readonly name: string; readonly scoring: number }[];
  readonly issues: readonly Issue[];
}

export function generateLevel(recipeInput: unknown, seed: number): GeneratedLevel {
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
  const level = parseLevel({
    formatVersion: 1,
    name: recipe.name,
    background: DEV_BACKGROUND,
    board: { width: BOARD_W, height: BOARD_H },
    elements: builder.elements(),
    provenance: { generatorVersion: GENERATOR_VERSION, seed: seed >>> 0, recipe: recipeInput },
  });
  if (recipe.fill !== 'none')
    parts.push({ name: 'fill', scoring: builder.scoringCount() - beforeFill });
  const partOf = new Map(builder.placed.map((p) => [p.element.id, p.part]));
  return { level, recipe, partOf, parts, issues: validateLevel(level) };
}
