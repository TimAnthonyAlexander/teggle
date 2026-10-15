import { describe, expect, it } from 'vitest';
import { assembleLevel } from './generate';
import { fitCount, pegsAt, spacingFor } from './fit';
import type { RecipeInput } from './recipe';

/** Three peg lines and a short brick line; 'mid' is long, 'side' short. */
function recipe(target: number, extra: Partial<RecipeInput> = {}): RecipeInput {
  return {
    name: 'Fit',
    targetCount: target,
    parts: [
      {
        template: 'outline',
        params: {
          paths: [
            {
              mode: 'pegs',
              spacing: 40,
              points: [
                [120, 240],
                [458, 210],
                [796, 240],
              ],
            },
            {
              mode: 'pegs',
              spacing: 40,
              points: [
                [160, 330],
                [458, 360],
                [756, 330],
              ],
            },
            {
              mode: 'pegs',
              spacing: 45,
              keepSpacing: true,
              points: [
                [200, 440],
                [716, 440],
              ],
            },
            {
              mode: 'bricks',
              points: [
                [380, 470],
                [536, 470],
              ],
            },
          ],
        },
      },
    ],
    fill: 'none',
    ...extra,
  };
}

// A fit builds the level up to a few dozen times: quick, but slow when other work loads every core.
describe('count fitting', { timeout: 60_000 }, () => {
  it('finds the spacing nearest the written one for a given peg count', () => {
    for (const [length, closed] of [
      [300, false],
      [281.7, true],
      [91.6, false],
    ] as const) {
      for (let n = 2; n < 12; n++) {
        const s = spacingFor(length, closed, n, 40);
        if (s === null) continue;
        expect(pegsAt(length, closed, s)).toBe(n);
        expect(s).toBeGreaterThanOrEqual(34);
        expect(s).toBeLessThanOrEqual(80);
      }
    }
    expect(spacingFor(300, false, 9, 38)).toBe(38);
    expect(spacingFor(300, false, 30, 38)).toBeNull();
  });

  it('leaves a recipe that already hits its count alone', () => {
    const start = assembleLevel(recipe(100), 1).scoring;
    const r = recipe(start);
    const fit = fitCount(r, 1);
    expect(fit.ok).toBe(true);
    expect(fit.recipe).toBe(r);
    expect(fit.nudges).toEqual([]);
  });

  it('nudges peg lines up or down to the exact count, the same way every time', () => {
    const start = assembleLevel(recipe(100), 1).scoring;
    for (const target of [start - 3, start + 2]) {
      const fit = fitCount(recipe(target), 1);
      expect(fit.ok).toBe(true);
      expect(fit.count).toBe(target);
      expect(fitCount(recipe(target), 1).recipe).toEqual(fit.recipe);
      for (const n of fit.nudges) {
        expect(n.kind).toBe('spacing');
        // The kept line and the brick line never move.
        if (n.kind === 'spacing') expect(n.path).toBeLessThan(2);
      }
      expect(fit.generated.level.provenance?.recipe).toEqual(fit.recipe);
    }
  });

  it('reports a count it cannot reach', () => {
    const fit = fitCount(recipe(200), 1);
    expect(fit.ok).toBe(false);
    expect(fit.count).toBeLessThan(200);
  });

  it('gives a fill that picks its own spacing the exact number of pegs missing', () => {
    const r = recipe(150, { fill: { style: 'lattice' } });
    const fit = fitCount(r, 4);
    expect(fit.ok).toBe(true);
    expect(fit.count).toBe(150);
    expect(fit.nudges.some((n) => n.kind === 'fill')).toBe(true);
    const plain = assembleLevel(r, 4);
    expect(plain.scoring).toBeGreaterThanOrEqual(150);
  });
});
