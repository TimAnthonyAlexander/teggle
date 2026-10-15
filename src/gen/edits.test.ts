import { describe, expect, it } from 'vitest';
import { HALF_PI } from '../core/dmath';
import { isScoringElement, parseLevel, type LevelElement } from '../level/schema';
import { BRICK_LENGTH } from './constants';
import { applyEdits, EDIT_MATCH, editSchema, type Edit } from './edits';
import { EDIT_PART, generateLevel } from './generate';
import type { RecipeInput } from './recipe';

function elements(): LevelElement[] {
  return parseLevel({
    formatVersion: 1,
    name: 't',
    background: 't',
    board: { width: 916, height: 560 },
    elements: [
      { kind: 'peg', id: 1, x: 200, y: 300 },
      { kind: 'peg', id: 2, x: 260, y: 300 },
      { kind: 'brick', id: 3, x: 400, y: 300, rotation: HALF_PI, length: 35 },
      { kind: 'circle', id: 4, x: 600, y: 300, radius: 20 },
    ],
  }).elements;
}

const edits = (list: unknown[]): Edit[] => list.map((e) => editSchema.parse(e));

describe('manual edits', () => {
  it('moves, turns, flags and deletes generated objects found by position', () => {
    const out = applyEdits(
      elements(),
      edits([
        { at: [200.5, 300.5], to: [210, 320], quickDisappear: true },
        { at: [260, 300], delete: true },
        { at: [400, 301], rotation: 0, canBeOrange: false },
      ]),
    );
    expect(out.errors).toEqual([]);
    expect(out.elements.map((e) => e.id)).toEqual([1, 3, 4]);
    expect(out.elements[0]).toMatchObject({ x: 210, y: 320, quickDisappear: true });
    expect(out.elements[1]).toMatchObject({ rotation: 0, canBeOrange: false, x: 400, y: 300 });
    expect([...out.entryOf]).toEqual([
      [1, 0],
      [2, 1],
      [3, 2],
    ]);
  });

  it('adds pegs and bricks with the next free ids', () => {
    const out = applyEdits(
      elements(),
      edits([
        { add: 'peg', at: [500, 200], canBeOrange: false },
        { add: 'brick', at: [500, 100] },
      ]),
    );
    const added = out.elements.slice(4);
    expect(added.map((e) => e.id)).toEqual([5, 6]);
    expect(added[0]).toMatchObject({ kind: 'peg', x: 500, y: 200, radius: 10, canBeOrange: false });
    expect(added[1]).toMatchObject({ kind: 'brick', rotation: HALF_PI, length: BRICK_LENGTH });
    expect(out.target.get(1)).toBe(6);
  });

  it('reports entries that find nothing, or an object another entry already changes', () => {
    const out = applyEdits(
      elements(),
      edits([
        { at: [200 + EDIT_MATCH + 0.1, 300], delete: true },
        { at: [600, 300], delete: true },
        { at: [260, 300], to: [270, 300] },
        { at: [260.5, 300], delete: true },
        { at: [200, 300], rotation: 1 },
      ]),
    );
    expect(out.errors).toEqual([
      'edit 1: no peg or brick within 2 px of (202.10, 300.00)',
      'edit 2: no peg or brick within 2 px of (600.00, 300.00)',
      "edit 4: the object at (260.50, 300.00) is already edit 3's",
      'edit 5: the object at (200.00, 300.00) is a peg, which has no rotation',
    ]);
    expect(out.elements.filter(isScoringElement)).toHaveLength(3);
  });

  it('rejects entries that change nothing or mix a delete with a change', () => {
    expect(editSchema.safeParse({ at: [1, 2] }).success).toBe(false);
    expect(editSchema.safeParse({ at: [1, 2], delete: true, to: [3, 4] }).success).toBe(false);
    expect(editSchema.safeParse({ add: 'peg', at: [1, 2], length: 35 }).success).toBe(false);
    expect(editSchema.safeParse({ add: 'brick', at: [1, 2], length: 35 }).success).toBe(true);
  });

  it('are applied by the generator after everything is placed, so a rebuild keeps them', () => {
    const base: RecipeInput = {
      name: 'Edits',
      parts: [{ template: 'plinko', params: { shape: 'rect', count: 60 } }],
      fill: 'none',
    };
    const before = generateLevel(base, 3);
    const first = before.level.elements.find(isScoringElement);
    if (first === undefined) throw new Error('no object');
    const recipe: RecipeInput = {
      ...base,
      edits: [
        { at: [first.x, first.y], delete: true },
        { add: 'peg', at: [458, 300] },
      ],
    };
    const after = generateLevel(recipe, 3);
    expect(after.edits.errors).toEqual([]);
    expect(after.scoring).toBe(before.scoring);
    expect(after.level.elements.some((e) => e.id === first.id)).toBe(false);
    const added = after.edits.target.get(1);
    expect(added).toBeDefined();
    expect(after.partOf.get(added ?? -1)).toBe(EDIT_PART);
    expect(after.generated).toHaveLength(before.level.elements.length);
  });
});
