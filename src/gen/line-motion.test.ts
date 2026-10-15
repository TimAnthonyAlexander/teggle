// The lines format's moving parts: groups, their movements and traveling lines, as the lines
// file stores them, the editor writes them and the recipe carries them; plus manual edits and
// count fitting on moving lines.

import { describe, expect, it } from 'vitest';
import { applyEdits, editPosition } from './edits';
import { fitCount } from './fit';
import { generateLevel } from './generate';
import { linesJson } from './json';
import { lineGroups, linePaths, LinesFormatError, parseLines } from './lines';
import type { RecipeInput } from './recipe';

function file(lines: unknown[], groups?: unknown[]): unknown {
  return {
    formatVersion: 1,
    background: 'test-picture',
    board: { width: 916, height: 560 },
    lines,
    ...(groups === undefined ? {} : { groups }),
  };
}

const ring = (id: string, cx: number, extra: Record<string, unknown> = {}): unknown => ({
  id,
  mode: 'pegs',
  closed: true,
  points: [
    [cx + 50, 300],
    [cx, 250],
    [cx - 50, 300],
    [cx, 350],
  ],
  ...extra,
});

describe('moving lines in the lines file', () => {
  it('reads groups, movements and traveling lines, and writes them back the same', () => {
    const f = parseLines(
      file(
        [
          ring('wheel', 300, { group: 'mill' }),
          ring('loop', 600, { spacing: 120, travel: { period: 2400, reverse: true } }),
          {
            id: 'route',
            mode: 'bricks',
            points: [
              [100, 120],
              [800, 120],
            ],
          },
        ],
        [
          {
            id: 'mill',
            note: 'turns',
            pivot: [300, 300],
            movement: { type: 'rotate', period: 1600, phase: 0.25 },
          },
          {
            id: 'cart',
            parent: 'mill',
            pivot: [300, 260],
            movement: { type: 'followPath', line: 'route', period: 900 },
          },
        ],
      ),
    );
    expect(f.lines[1]?.travel).toEqual({ period: 2400, reverse: true });
    const text = linesJson(f);
    // A group on one line when it fits, else a field per line, the movement on one line.
    expect(text).toContain(
      '      "movement": { "type": "rotate", "period": 1600, "phase": 0.25 }\n    },',
    );
    expect(text).toContain('"movement": { "type": "followPath", "line": "route", "period": 900 }');
    expect(text).toContain('"travel": { "period": 2400, "reverse": true }');
    expect(parseLines(JSON.parse(text))).toEqual(f);
  });

  it('rejects groups that do not add up', () => {
    const bad = (lines: unknown[], groups: unknown[], message: RegExp): void => {
      expect(() => parseLines(file(lines, groups))).toThrow(LinesFormatError);
      expect(() => parseLines(file(lines, groups))).toThrow(message);
    };
    const mill = { id: 'mill', movement: { type: 'rotate', period: 400 } };
    bad([ring('a', 300, { group: 'boat' })], [mill], /no group "boat"/);
    bad([ring('a', 300, { group: 'mill' })], [mill, mill], /duplicate group id "mill"/);
    bad([ring('a', 300, { group: 'mill' })], [{ id: 'mill', pivot: [1, 1] }], /no movement/);
    bad(
      [ring('a', 300, { group: 'a' })],
      [
        { id: 'a', parent: 'b', movement: { type: 'rotate', period: 400 } },
        { id: 'b', parent: 'a', pivot: [1, 1], movement: { type: 'rotate', period: 400 } },
      ],
      /rides on itself/,
    );
    bad([ring('a', 300)], [mill], /no lines of its own, so it needs a pivot/);
    bad(
      [ring('a', 300, { group: 'mill' })],
      [{ id: 'mill', movement: { type: 'followPath', period: 400 } }],
      /followPath names the line to follow/,
    );
    bad(
      [ring('a', 300, { group: 'mill' })],
      [{ id: 'mill', movement: { type: 'followPath', line: 'nowhere', period: 400 } }],
      /no line "nowhere" to follow/,
    );
    bad(
      [ring('a', 300, { group: 'mill' })],
      [
        {
          id: 'mill',
          movement: { type: 'rotateAroundCircle', period: 400, radius: 20, radius2: 30 },
        },
      ],
      /on a circle only/,
    );
    bad(
      [ring('a', 300, { group: 'mill' })],
      [{ id: 'mill', movement: { type: 'rotateBackAndForth', period: 402 } }],
      /divisible by 4/,
    );
    bad([ring('a', 300, { spacing: 120 })], [], /for pegs that travel/);
  });

  it('hands a recipe the groups of the lines it places, a line to follow as its geometry', () => {
    const f = parseLines(
      file(
        [
          ring('cabin', 300, { group: 'cart' }),
          ring('other', 600),
          {
            id: 'route',
            mode: 'bricks',
            points: [
              [100, 120],
              [800, 120],
            ],
          },
        ],
        [
          { id: 'cart', movement: { type: 'followPath', line: 'route', period: 900 } },
          { id: 'unused', pivot: [5, 5], movement: { type: 'rotate', period: 400 } },
        ],
      ),
    );
    expect(linePaths(f, ['cabin'])[0]).toMatchObject({ group: 'cart' });
    expect(lineGroups(f, ['cabin'])).toEqual([
      {
        id: 'cart',
        movement: {
          type: 'followPath',
          period: 900,
          along: {
            closed: false,
            points: [
              [100, 120],
              [800, 120],
            ],
          },
        },
      },
    ]);
    expect(lineGroups(f, ['other'])).toEqual([]);
  });
});

describe('edits and fitting on moving lines', { timeout: 60_000 }, () => {
  const recipe: RecipeInput = {
    name: 'Moving',
    targetCount: 60,
    parts: [
      {
        template: 'outline',
        params: {
          paths: [
            {
              mode: 'pegs',
              closed: true,
              spacing: 44,
              points: [
                [558, 300],
                [458, 230],
                [358, 300],
                [458, 370],
              ],
              group: 'g',
            },
            {
              mode: 'pegs',
              closed: true,
              spacing: 70,
              points: [
                [800, 260],
                [720, 160],
                [640, 260],
                [720, 360],
              ],
              travel: { period: 1800 },
            },
          ],
          groups: [{ id: 'g', movement: { type: 'circle', period: 1200, radius: 20 } }],
        },
      },
    ],
    fill: { style: 'lattice' },
  };

  it('finds a moving object where it is at tick 0, deletes and flags it, but never moves it', () => {
    const g = generateLevel(recipe, 4);
    const tracks = g.level.paths?.map(() => null) ?? [];
    expect(tracks.length).toBe(1);
    const moving = g.generated.find((e) => e.movement?.type === 'circle');
    if (moving === undefined) throw new Error('no moving peg');
    const at = editPosition(moving);
    // The circle mover starts radius 20 to the right of its anchor.
    expect(at.x).toBeCloseTo(moving.x + 20, 9);
    const p: [number, number] = [at.x, at.y];
    const del = applyEdits(g.generated, [{ at: p, delete: true }]);
    expect(del.errors).toEqual([]);
    expect(del.elements).toHaveLength(g.generated.length - 1);
    expect(applyEdits(g.generated, [{ at: p, canBeOrange: false }]).errors).toEqual([]);
    expect(applyEdits(g.generated, [{ at: p, to: [100, 100] }]).errors[0]).toMatch(
      /moves with its line; move the line instead/,
    );
    expect(
      applyEdits(g.generated, [{ at: [moving.x, moving.y], delete: true }]).errors,
    ).toHaveLength(1);
  });

  it('fits a count by nudging traveling pegs like a closed line', () => {
    const outline = recipe.parts[0];
    const params = outline?.params as { paths: unknown[] } | undefined;
    const rows = [440, 480].map((y) => ({
      mode: 'pegs',
      keepSpacing: true,
      points: [
        [130, y],
        [786, y],
      ],
    }));
    const r: RecipeInput = {
      ...recipe,
      fill: 'none',
      parts: [
        { template: 'outline', params: { ...params, paths: [...(params?.paths ?? []), ...rows] } },
      ],
    };
    const before = generateLevel(r, 4).scoring;
    const fit = fitCount({ ...r, targetCount: before + 1 }, 4);
    expect(fit.ok).toBe(true);
    // One peg more on one of the two moving peg lines (the rows keep their spacing).
    expect(fit.nudges).toHaveLength(1);
    expect(fit.nudges[0]).toMatchObject({ kind: 'spacing', path: expect.any(Number) as number });
    expect(fit.generated.issues).toEqual([]);
  });
});
