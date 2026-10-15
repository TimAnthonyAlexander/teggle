import { describe, expect, it } from 'vitest';
import { generateLevel } from '../generate';
import type { RecipeInput } from '../recipe';
import { levelJson } from '../serialize';
import { levelStats } from '../stats';
import { TEMPLATE_NAMES, type TemplateName } from '.';

/** A one-template recipe; the parameters keep each template on a path that places objects. */
function recipe(template: TemplateName): RecipeInput {
  const params: Partial<Record<TemplateName, Record<string, unknown>>> = {
    spiral: { layout: 'twin', arm: 'mixed', spin: 0 },
    rotating: { layout: 'pair' },
    platforms: { kind: 'floaters', tiers: 2 },
    helix: { bands: 1, sides: true },
    outline: { preset: 'heart' },
    solids: {
      polygons: [
        {
          points: [
            [40, 200],
            [160, 250],
            [160, 262],
            [40, 212],
          ],
        },
      ],
      rods: [{ a: [760, 250], b: [876, 200] }],
      circles: [{ x: 458, y: 330, r: 24 }],
    },
  };
  return {
    name: `Test ${template}`,
    parts: [{ template, ...(params[template] === undefined ? {} : { params: params[template] }) }],
    fill: 'none',
  };
}

describe('templates', () => {
  it.each(TEMPLATE_NAMES)('%s: the same seed gives the same bytes', (template) => {
    const a = levelJson(generateLevel(recipe(template), 7).level);
    const b = levelJson(generateLevel(recipe(template), 7).level);
    expect(a).toBe(b);
  });

  it.each(TEMPLATE_NAMES.filter((t) => t !== 'solids'))(
    '%s: places objects and passes the validity checks',
    (template) => {
      const g = generateLevel(recipe(template), 7);
      expect(g.parts[0]?.scoring ?? 0).toBeGreaterThan(10);
      expect(g.issues).toEqual([]);
    },
  );

  it('places solids where the recipe says, and refuses one that does not fit', () => {
    const g = generateLevel(recipe('solids'), 7);
    expect(g.level.elements.map((e) => e.kind)).toEqual(['polygon', 'rod', 'circle']);
    expect(g.level.elements[2]).toMatchObject({ x: 458, y: 330, radius: 24 });
    expect(g.issues).toEqual([]);
    // Too close to the cannon.
    expect(() =>
      generateLevel(
        {
          name: 'x',
          parts: [{ template: 'solids', params: { circles: [{ x: 458, y: 120, r: 20 }] } }],
          fill: 'none',
        },
        1,
      ),
    ).toThrow(/circle 0 does not fit/);
  });

  it('draws unspecified parameters from the seed', () => {
    const a = levelJson(
      generateLevel({ name: 'x', parts: [{ template: 'web' }], fill: 'none' }, 1).level,
    );
    const b = levelJson(
      generateLevel({ name: 'x', parts: [{ template: 'web' }], fill: 'none' }, 2).level,
    );
    expect(a).not.toBe(b);
  });

  it('mixes two templates in one level and fills up to the target', () => {
    const g = generateLevel(
      {
        name: 'Mixed',
        targetCount: 150,
        parts: [
          {
            template: 'rotating',
            region: 'center',
            params: { kind: 'windmill', layout: 'single' },
          },
          { template: 'spiral', region: 'sides', params: { layout: 'twin', arm: 'bricks' } },
        ],
        fill: { style: 'arcs' },
      },
      101,
    );
    expect(g.parts.map((p) => p.scoring > 0)).toEqual([true, true, true]);
    expect(g.issues).toEqual([]);
    const s = levelStats(g.level);
    expect(s.scoring).toBeGreaterThanOrEqual(120);
    expect(s.scoring).toBeLessThanOrEqual(189);
  });

  it('records the generator version, seed and recipe in the level', () => {
    const r = recipe('plinko');
    const g = generateLevel(r, 123);
    expect(g.level.provenance).toMatchObject({ seed: 123, recipe: r });
    expect(g.level.provenance?.generatorVersion).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('builds outlines from drawn paths, bricks where straight and curved where bent', () => {
    const g = generateLevel(
      {
        name: 'Paths',
        parts: [
          {
            template: 'outline',
            params: {
              paths: [
                {
                  // An L: a long straight stroke, a sharp corner, another straight stroke.
                  points: [
                    [200, 200],
                    [200, 420],
                    [420, 420],
                  ],
                  corners: [1],
                  closed: false,
                  mode: 'bricks',
                },
                {
                  // A soft arc through three points.
                  points: [
                    [140, 110],
                    [220, 150],
                    [300, 110],
                  ],
                  mode: 'bricks',
                },
                {
                  points: [
                    [600, 200],
                    [800, 260],
                    [700, 420],
                  ],
                  closed: true,
                  mode: 'pegs',
                },
              ],
            },
          },
        ],
        fill: 'none',
      },
      5,
    );
    const s = levelStats(g.level);
    expect(s.straightBricks).toBeGreaterThan(5);
    expect(s.curvedBricks).toBeGreaterThan(0);
    expect(s.pegs).toBeGreaterThan(8);
    expect(g.issues).toEqual([]);
  });
});
