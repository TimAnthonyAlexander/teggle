import { describe, expect, it } from 'vitest';
import type { LevelSourceInput } from '../gen/campaign-source';
import { parseLines, type Line } from '../gen/lines';
import {
  addLine,
  deleteLine,
  deletePoint,
  freshId,
  idProblem,
  insertPoint,
  movePoint,
  placementOrder,
  renameLine,
  reorderLine,
  setEdits,
  setLineFields,
  toggleCorner,
  translateLine,
  type Doc,
} from './doc';
import { History } from './history';

function line(id: string, points: [number, number][], extra: Partial<Line> = {}): Line {
  return { id, mode: 'pegs', closed: false, points, corners: [], ...extra };
}

function doc(order?: string[]): Doc {
  const source: LevelSourceInput = {
    id: '2-1',
    name: 'Test',
    concept: { subject: 's', composition: 'c', layout: 'l' },
    background: { id: 'test', prompt: 'p' },
    recipe: {
      seed: 1,
      targetCount: 100,
      ...(order === undefined ? {} : { lines: order }),
      fill: { style: 'lattice', within: 'b' },
    },
  };
  return {
    lines: {
      formatVersion: 1,
      background: 'test',
      board: { width: 916, height: 560 },
      lines: [
        line('a', [
          [100, 100],
          [200, 100],
          [300, 150],
        ]),
        line(
          'b',
          [
            [400, 300],
            [500, 300],
            [450, 380],
          ],
          { closed: true, corners: [1] },
        ),
      ],
    },
    source,
  };
}

describe('editor document', () => {
  it('moves, inserts and deletes points, keeping corners on their points', () => {
    let d = insertPoint(doc(), 'b', 1, [450.04, 280.06]);
    expect(d.lines.lines[1]?.points[1]).toEqual([450, 280.1]);
    expect(d.lines.lines[1]?.corners).toEqual([2]);
    d = deletePoint(d, 'b', 0);
    expect(d.lines.lines[1]?.corners).toEqual([1]);
    expect(d.lines.lines[1]?.points).toHaveLength(3);
    // A closed line keeps three points.
    expect(deletePoint(d, 'b', 0)).toEqual(d);
    d = movePoint(d, 'a', 0, [-20, 600]);
    expect(d.lines.lines[0]?.points[0]).toEqual([0, 560]);
    d = toggleCorner(toggleCorner(d, 'a', 1), 'a', 2);
    expect(d.lines.lines[0]?.corners).toEqual([1, 2]);
    expect(translateLine(d, 'a', 10, -5).lines.lines[0]?.points[1]).toEqual([210, 95]);
  });

  it('keeps the recipe in step when lines are added, renamed, reordered or deleted', () => {
    let d = addLine(
      doc(['b', 'a']),
      line('c', [
        [10, 400],
        [60, 420],
      ]),
    );
    expect(placementOrder(d)).toEqual(['b', 'a', 'c']);
    d = renameLine(d, 'b', 'ring');
    expect(placementOrder(d)).toEqual(['ring', 'a', 'c']);
    expect(d.source.recipe.fill).toEqual({ style: 'lattice', within: 'ring' });
    d = reorderLine(d, 'c', -1);
    expect(placementOrder(d)).toEqual(['ring', 'c', 'a']);
    d = deleteLine(d, 'ring');
    expect(placementOrder(d)).toEqual(['c', 'a']);
    expect(d.source.recipe.fill).toEqual({ style: 'lattice' });
    expect(() => parseLines(d.lines)).not.toThrow();
  });

  it('reorders the lines file itself when the recipe names no order', () => {
    const d = reorderLine(doc(), 'b', -1);
    expect(d.lines.lines.map((l) => l.id)).toEqual(['b', 'a']);
    expect(placementOrder(d)).toEqual(['b', 'a']);
  });

  it('checks ids and hands out fresh ones', () => {
    expect(idProblem(doc(), 'a', 'B')).toMatch(/lowercase/);
    expect(idProblem(doc(), 'a', 'b')).toBe('already taken');
    expect(idProblem(doc(), 'a', 'a')).toBeNull();
    expect(
      freshId(
        addLine(
          doc(),
          line('line-1', [
            [1, 1],
            [9, 9],
          ]),
        ),
      ),
    ).toBe('line-2');
  });

  it('sets and clears optional line fields', () => {
    let d = setLineFields(doc(), 'a', { spacing: 37, keepSpacing: true, note: 'x' });
    expect(d.lines.lines[0]).toMatchObject({ spacing: 37, keepSpacing: true, note: 'x' });
    d = setLineFields(d, 'a', { spacing: undefined, keepSpacing: false, note: '' });
    expect(Object.keys(d.lines.lines[0] ?? {}).sort()).toEqual(
      ['closed', 'corners', 'id', 'mode', 'points'].sort(),
    );
  });

  it('removes the edits field when the list is empty', () => {
    const d = setEdits(doc(), [{ at: [1, 2], delete: true }]);
    expect(d.source.recipe.edits).toHaveLength(1);
    expect('edits' in setEdits(d, []).source.recipe).toBe(false);
  });
});

describe('history', () => {
  it('undoes and redoes, and a new step clears the redo list', () => {
    const h = new History<number>();
    h.push(1);
    h.push(2);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBe(1);
    expect(h.redo(1)).toBe(2);
    h.push(2);
    expect(h.canRedo).toBe(false);
    expect(h.undo(5)).toBe(2);
  });
});
