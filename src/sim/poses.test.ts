import { describe, expect, it } from 'vitest';
import { mixedLevel, moversLevel } from '../../tests/fixtures/levels';
import { compileLevel } from './compile';
import { MotionModel } from './poses';
import { World } from './world';

describe('MotionModel', () => {
  it.each([
    ['mixed', mixedLevel],
    ['movers', moversLevel],
  ])('puts every element where the world does, to the bit (%s)', (_name, make) => {
    const level = make();
    const world = new World(compileLevel(level));
    const model = new MotionModel(level.elements, level.paths);
    for (let tick = 0; tick <= 2000; tick++) {
      if (tick > 0) world.step();
      if (tick % 37 !== 0 && tick !== 1) continue;
      model.at(tick);
      level.elements.forEach((e, i) => {
        const b = world.element(e.id);
        expect([model.xs[i], model.ys[i], model.rotations[i]], `${e.id} at ${tick}`).toEqual([
          b.x,
          b.y,
          b.rotation,
        ]);
      });
    }
  });
});
