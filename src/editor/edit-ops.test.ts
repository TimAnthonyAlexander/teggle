import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { composeRecipe, levelSourceSchema, stageOf } from '../gen/campaign-source';
import { editSchema, type Edit } from '../gen/edits';
import { assembleLevel } from '../gen/generate';
import { parseLines } from '../gen/lines';
import { isScoringElement } from '../level/schema';
import { compose } from './derive';
import type { Doc } from './doc';
import {
  addObject,
  deleteObject,
  describeEdit,
  moveObject,
  originOf,
  removeEntry,
  rotateObject,
  setFlag,
} from './edit-ops';

const ROOT = path.resolve(import.meta.dirname, '..', '..');

function campaignDoc(id: string): Doc {
  return {
    lines: parseLines(
      JSON.parse(
        readFileSync(path.join(ROOT, 'public', 'levels', 'campaign', `${id}.lines.json`), 'utf8'),
      ),
    ),
    source: JSON.parse(
      readFileSync(path.join(ROOT, 'campaign', 'levels', `${id}.json`), 'utf8'),
    ) as Doc['source'],
  };
}

describe('the editor composes what the build composes', () => {
  it.each(['1-1', '1-2', '1-3', '1-4', '1-5'])('%s', (id) => {
    const d = campaignDoc(id);
    const c = compose(d);
    if (!c.ok) throw new Error(c.error);
    const level = levelSourceSchema.parse(d.source);
    const lines = parseLines(d.lines);
    expect(c.value.recipe).toEqual(composeRecipe({ stage: { stage: stageOf(id) }, level, lines }));
    expect(c.value.seed).toBe(level.recipe.seed);
    expect(c.value.background).toBe(level.background.id);
  });
});

describe('manual edit operations', () => {
  const d = campaignDoc('1-5');
  const c = compose(d);
  if (!c.ok) throw new Error(c.error);
  const recipe = c.value.recipe;
  const seed = c.value.seed;
  const build = (edits: readonly Edit[]) => assembleLevel({ ...recipe, edits }, seed);
  const base = build([]);
  const first = base.level.elements.find(isScoringElement);
  if (first === undefined) throw new Error('no object');

  it('keeps one entry per object and drops entries that change nothing', () => {
    let edits = moveObject([], originOf(base, first.id), [first.x + 20, first.y]);
    expect(edits).toHaveLength(1);
    let shown = build(edits);
    edits = moveObject(edits, originOf(shown, first.id), [first.x + 30, first.y + 1]);
    expect(edits).toHaveLength(1);
    shown = build(edits);
    expect(shown.edits.errors).toEqual([]);
    expect(shown.level.elements.find((e) => e.id === first.id)).toMatchObject({
      x: Math.round((first.x + 30) * 10) / 10,
    });
    edits = setFlag(edits, originOf(shown, first.id), 'quickDisappear', true);
    expect(edits[0]).toMatchObject({ quickDisappear: true });
    shown = build(edits);
    edits = moveObject(edits, originOf(shown, first.id), [first.x, first.y]);
    edits = setFlag(edits, originOf(build(edits), first.id), 'quickDisappear', false);
    expect(edits).toEqual([]);
    for (const e of edits) expect(editSchema.safeParse(e).success).toBe(true);
  });

  it('deletes generated objects with an entry and added ones by removing theirs', () => {
    let edits = deleteObject([], originOf(base, first.id));
    expect(edits).toEqual([
      { at: [Math.round(first.x * 100) / 100, Math.round(first.y * 100) / 100], delete: true },
    ]);
    edits = addObject(edits, 'peg', [458.04, 300]);
    let shown = build(edits);
    expect(shown.scoring).toBe(base.scoring);
    const added = shown.edits.target.get(1);
    if (added === undefined) throw new Error('not added');
    edits = moveObject(edits, originOf(shown, added), [470, 310]);
    expect(edits[1]).toEqual({ add: 'peg', at: [470, 310] });
    shown = build(edits);
    edits = deleteObject(edits, originOf(shown, added));
    expect(edits).toHaveLength(1);
    expect(removeEntry(edits, 0)).toEqual([]);
  });

  it('turns bricks but not pegs, and describes entries', () => {
    expect(rotateObject([], originOf(base, first.id), 1)).toEqual([]);
    const withBrick = addObject([], 'brick', [458, 300], Math.PI / 2);
    const shown = build(withBrick);
    const id = shown.edits.target.get(0);
    if (id === undefined) throw new Error('not added');
    const turned = rotateObject(withBrick, originOf(shown, id), 0.5);
    expect(turned[0]).toMatchObject({ add: 'brick', rotation: 0.5 });
    expect(describeEdit({ at: [1, 2], to: [3, 4], canBeOrange: false })).toBe(
      'move (1, 2) to (3, 4), never orange',
    );
    expect(describeEdit({ add: 'peg', at: [5, 6] })).toBe('add peg at (5, 6)');
  });
});
