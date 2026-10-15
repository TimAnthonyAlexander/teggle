// The editor's moving lines: the document operations on groups and travel (doc.ts) and what the
// board shows of them (motion.ts).

import { describe, expect, it } from 'vitest';
import type { LevelSourceInput } from '../gen/campaign-source';
import { generateLevel } from '../gen/generate';
import { parseLines, smoothLine, type Line, type LineGroup } from '../gen/lines';
import {
  deleteGroup,
  findGroup,
  freshGroupId,
  putGroup,
  renameGroup,
  renameLine,
  setLineGroup,
  setLineTravel,
  type Doc,
} from './doc';
import { groupPivot, Preview, unitLines } from './motion';

function line(id: string, x: number, extra: Partial<Line> = {}): Line {
  return {
    id,
    mode: 'pegs',
    closed: true,
    points: [
      [x + 40, 300],
      [x, 260],
      [x - 40, 300],
      [x, 340],
    ],
    corners: [],
    ...extra,
  };
}

function doc(lines: Line[], groups: LineGroup[] = []): Doc {
  const source: LevelSourceInput = {
    id: '3-2',
    name: 'Test',
    concept: { subject: 's', composition: 'c', layout: 'l' },
    background: { id: 'test', prompt: 'p' },
    recipe: { seed: 1, targetCount: 100 },
  };
  return {
    lines: parseLines({
      formatVersion: 1,
      background: 'test',
      board: { width: 916, height: 560 },
      lines,
      ...(groups.length > 0 ? { groups } : {}),
    }),
    source,
  };
}

const rotate = { type: 'rotate', period: 800 } as const;

describe('groups in the editor document', () => {
  it('puts lines into groups and takes them out, travel alongside', () => {
    let d = doc([line('a', 200), line('b', 400)]);
    const id = freshGroupId(d, 'a');
    d = setLineGroup(putGroup(d, { id, movement: rotate }), 'a', id);
    expect(d.lines.lines[0]?.group).toBe('a');
    expect(freshGroupId(d, 'a')).toBe('a-2');
    d = setLineTravel(d, 'b', { period: 1200 });
    expect(d.lines.lines[1]?.travel).toEqual({ period: 1200 });
    d = setLineTravel(setLineGroup(d, 'a', undefined), 'b', undefined);
    expect(d.lines.lines.map((l) => [l.group, l.travel])).toEqual([
      [undefined, undefined],
      [undefined, undefined],
    ]);
    expect('group' in (d.lines.lines[0] ?? {})).toBe(false);
  });

  it('renames a group everywhere and a followed line in its movement', () => {
    let d = doc(
      [line('a', 200, { group: 'mill' }), line('b', 400, { group: 'cart' }), line('route', 600)],
      [
        { id: 'mill', movement: rotate },
        {
          id: 'cart',
          parent: 'mill',
          movement: { type: 'followPath', line: 'route', period: 900 },
        },
      ],
    );
    d = renameGroup(d, 'mill', 'wheel');
    expect(d.lines.lines[0]?.group).toBe('wheel');
    expect(findGroup(d, 'cart')?.parent).toBe('wheel');
    d = renameLine(d, 'route', 'track');
    expect(findGroup(d, 'cart')?.movement?.line).toBe('track');
    // Taken or malformed ids change nothing.
    expect(renameGroup(d, 'wheel', 'cart')).toBe(d);
    expect(renameGroup(d, 'wheel', 'Big Wheel')).toBe(d);
  });

  it('deletes a group: its lines stand still, its riders ride on its parent', () => {
    let d = doc(
      [
        line('a', 200, { group: 'top' }),
        line('b', 400, { group: 'mid' }),
        line('c', 600, { group: 'low' }),
      ],
      [
        { id: 'top', movement: rotate },
        { id: 'mid', parent: 'top', movement: rotate },
        { id: 'low', parent: 'mid', movement: rotate },
      ],
    );
    d = deleteGroup(d, 'mid');
    expect(d.lines.lines[1]?.group).toBeUndefined();
    expect(findGroup(d, 'low')?.parent).toBe('top');
    d = deleteGroup(deleteGroup(d, 'low'), 'top');
    expect(d.lines.groups).toBeUndefined();
  });
});

describe('the board view of moving lines', () => {
  const lines = doc(
    [
      line('a', 200, { group: 'top' }),
      line('b', 400, { group: 'rider' }),
      line('c', 600, { travel: { period: 900 } }),
      line('d', 760),
    ],
    [
      { id: 'top', movement: rotate },
      { id: 'rider', parent: 'top', pivot: [400, 300] },
    ],
  ).lines;

  it('knows which lines move together', () => {
    expect([...unitLines(lines, 'a')].sort()).toEqual(['a', 'b']);
    expect([...unitLines(lines, 'b')].sort()).toEqual(['a', 'b']);
    expect([...unitLines(lines, 'c')]).toEqual(['c']);
    expect(unitLines(lines, 'd').size).toBe(0);
  });

  it("finds a group's pivot: its own, or the middle of its lines", () => {
    const smoothed = new Map(lines.lines.map((l) => [l.id, smoothLine(l)]));
    const top = findGroup({ lines, source: {} as LevelSourceInput }, 'top');
    const rider = findGroup({ lines, source: {} as LevelSourceInput }, 'rider');
    if (top === null || rider === null) throw new Error('no group');
    const p = groupPivot(lines, smoothed, top);
    expect(p?.[0]).toBeCloseTo(200, 6);
    expect(p?.[1]).toBeCloseTo(300, 0);
    expect(groupPivot(lines, smoothed, rider)).toEqual([400, 300]);
  });

  it('previews the level at any tick of its cycle and samples where a unit goes', () => {
    const level = generateLevel(
      {
        name: 'Preview',
        parts: [
          {
            template: 'outline',
            params: {
              paths: [
                {
                  mode: 'pegs',
                  closed: true,
                  points: [
                    [500, 300],
                    [458, 260],
                    [416, 300],
                    [458, 340],
                  ],
                  group: 'g',
                },
              ],
              groups: [{ id: 'g', movement: { type: 'horizontalCycle', period: 400, radius: 50 } }],
            },
          },
        ],
        fill: 'none',
      },
      1,
    ).level;
    const preview = new Preview(level);
    expect(preview.moving).toBe(true);
    expect(preview.cycle).toBe(400);
    const peg = level.elements[0];
    if (peg === undefined) throw new Error('no peg');
    const at0 = preview.at(0).pose(peg.id);
    const at200 = preview.at(200).pose(peg.id);
    // Half a cycle of a horizontal cycle: from one end of the slide to the other.
    expect(at0.x - at200.x).toBeCloseTo(100, 6);
    expect(preview.at(400).pose(peg.id)).toEqual(at0);
    const sweep = preview.sweep(new Set(level.elements.map((e) => e.id)), 40);
    expect(sweep).toHaveLength(40 * level.elements.length);
    // Sampling leaves the preview where it was.
    expect(preview.pose(peg.id)).toEqual(at0);
  });
});
