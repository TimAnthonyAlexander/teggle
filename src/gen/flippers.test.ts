import { describe, expect, it } from 'vitest';
import { parseLevel, type Level, type LevelElementInput } from '../level/schema';
import { compileLevel } from '../sim/compile';
import { FLIPPER_LEFT_VERTICES, FLIPPER_RIGHT_VERTICES, FLIPPER_SWING_TICKS } from '../sim/tuning';
import { World } from '../sim/world';
import { Builder } from './builder';
import { BOARD_H, BOARD_W, MIN_GAP, PEG_RADIUS } from './constants';
import { flipperGap, flipperSweeps, SWING_SUBSTEPS } from './flippers';
import { circleShape, polyShape } from './shapes';
import { validateLevel } from './validate';

function level(elements: LevelElementInput[]): Level {
  return parseLevel({
    formatVersion: 1,
    name: 'test',
    background: 'test',
    board: { width: BOARD_W, height: BOARD_H },
    elements,
  });
}

describe('flipper keep-out zone', () => {
  it('holds every pose the simulation gives the flippers, rest to fully raised', () => {
    const sweeps = flipperSweeps(BOARD_W, BOARD_H);
    expect(sweeps.map((s) => s.side)).toEqual(['left', 'right']);
    const compiled = compileLevel(level([]));
    const world = new World(compiled);
    world.setFlippers(true);
    world.setFlipperInput(true);
    for (let clock = 0; clock <= FLIPPER_SWING_TICKS; clock++) {
      compiled.flipperBodies.forEach((index, k) => {
        const body = world.bodies[index];
        const sweep = sweeps[k];
        if (body === undefined || sweep === undefined) throw new Error('missing flipper');
        const vertices = sweep.side === 'left' ? FLIPPER_LEFT_VERTICES : FLIPPER_RIGHT_VERTICES;
        const live = polyShape(vertices, { x: body.x, y: body.y, rotation: body.rotation }, true);
        expect(sweep.poses[clock * SWING_SUBSTEPS]).toEqual(live);
      });
      world.step();
    }
  });

  it('reaches from the bottom corners up to about y 420 and in to about x 95', () => {
    const [left, right] = flipperSweeps(BOARD_W, BOARD_H);
    expect(left?.minY).toBeGreaterThan(415);
    expect(left?.minY).toBeLessThan(430);
    expect(left?.maxX).toBeGreaterThan(85);
    expect(left?.maxX).toBeLessThan(100);
    expect(right?.minX).toBeGreaterThan(BOARD_W - 100);
  });

  it('measures the free distance to the swing', () => {
    expect(flipperGap(circleShape(60, 300, PEG_RADIUS), BOARD_W, BOARD_H)).toBe(Infinity);
    expect(flipperGap(circleShape(60, 460, PEG_RADIUS), BOARD_W, BOARD_H)).toBeLessThan(0);
    // Pegs at x 60 clear the swing by the minimum gap from y 400 up.
    const at = (y: number) => flipperGap(circleShape(60, y, PEG_RADIUS), BOARD_W, BOARD_H, 40);
    expect(at(400)).toBeGreaterThanOrEqual(MIN_GAP);
    expect(at(402)).toBeLessThan(MIN_GAP);
    expect(at(402)).toBeGreaterThan(0);
  });

  it('is a validity issue on every level', () => {
    const issues = validateLevel(
      level([
        { kind: 'peg', id: 1, x: 60, y: 450 },
        { kind: 'peg', id: 2, x: BOARD_W - 60, y: 440 },
        { kind: 'peg', id: 3, x: 60, y: 360 },
      ]),
    );
    expect(issues.map((i) => [i.kind, i.a])).toEqual([
      ['flipper', 1],
      ['flipper', 2],
    ]);
  });

  it('keeps placement out of it', () => {
    const b = new Builder();
    expect(b.tryAdd({ kind: 'peg', x: 60, y: 450, radius: PEG_RADIUS }, 'test')).toBeNull();
    expect(b.rejected[0]?.reason).toMatch(/flippers' swing/);
    expect(b.tryAdd({ kind: 'peg', x: 60, y: 360, radius: PEG_RADIUS }, 'test')).not.toBeNull();
    expect(b.canReserve({ kind: 'circle', x: 70, y: 430, r: 20 })).toBe(false);
  });
});
