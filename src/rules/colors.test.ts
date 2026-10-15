import { describe, expect, it } from 'vitest';
import { Rng } from '../core/rng';
import { compileLevel, type CompiledLevel } from '../sim/compile';
import { CANNON_PIVOT_Y } from '../sim/tuning';
import { World } from '../sim/world';
import { pegGrid } from '../../tests/fixtures/rules';
import { assignColors, AttemptSetupError, movePurple } from './colors';
import { attemptConfig, campaignConfig } from './config';
import type { PegColor } from './scoring';
import { DEFAULT_ORANGE_COUNT } from './tuning';

function count(colors: readonly (PegColor | null)[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const c of colors) if (c !== null) out[c] = (out[c] ?? 0) + 1;
  return out;
}

function flaggedIds(level: CompiledLevel): Set<number> {
  const ids = new Set<number>();
  for (const b of level.bodies) {
    const e = b.element;
    if (e !== null && 'canBeOrange' in e && e.canBeOrange) ids.add(b.id);
  }
  return ids;
}

function idsOf(
  level: CompiledLevel,
  colors: readonly (PegColor | null)[],
  color: PegColor,
): number[] {
  return level.bodies.filter((_, i) => colors[i] === color).map((b) => b.id);
}

describe('color assignment', () => {
  const grid = compileLevel(pegGrid(120));
  const N = DEFAULT_ORANGE_COUNT;

  it('makes the default orange count, 2 green, 1 purple and the rest blue', () => {
    const { colors, purple } = assignColors(grid, attemptConfig(), Rng.fromSeed(7));
    expect(count(colors)).toEqual({ orange: N, green: 2, purple: 1, blue: 120 - N - 3 });
    expect(colors[purple]).toBe('purple');
    // Base geometry gets no color.
    expect(colors.slice(120).every((c) => c === null)).toBe(true);
  });

  it('is reproducible from the seed and differs between seeds', () => {
    const a = assignColors(grid, attemptConfig(), Rng.fromSeed(42)).colors;
    const b = assignColors(grid, attemptConfig(), Rng.fromSeed(42)).colors;
    const c = assignColors(grid, attemptConfig(), Rng.fromSeed(43)).colors;
    expect(b).toEqual(a);
    expect(c).not.toEqual(a);
  });

  it('picks orange, green and purple only from pegs flagged canBeOrange while enough remain', () => {
    const level = compileLevel(pegGrid(120, (id) => id % 3 !== 0)); // 80 flagged
    const flagged = flaggedIds(level);
    for (let seed = 0; seed < 20; seed++) {
      const { colors } = assignColors(level, attemptConfig(), Rng.fromSeed(seed));
      for (const color of ['orange', 'green', 'purple'] as const) {
        expect(idsOf(level, colors, color).every((id) => flagged.has(id))).toBe(true);
      }
    }
  });

  it('falls back to unflagged pegs for green and purple when the flagged set runs out', () => {
    const level = compileLevel(pegGrid(60, (id) => id <= N + 1)); // one flagged peg to spare
    const { colors } = assignColors(level, attemptConfig(), Rng.fromSeed(3));
    expect(count(colors)).toEqual({ orange: N, green: 2, purple: 1, blue: 60 - N - 3 });
    const flagged = flaggedIds(level);
    const special = [...idsOf(level, colors, 'green'), ...idsOf(level, colors, 'purple')];
    expect(special.filter((id) => flagged.has(id))).toHaveLength(1);
    expect(idsOf(level, colors, 'orange').every((id) => flagged.has(id))).toBe(true);
  });

  it('refuses a level with too few flagged pegs for the orange count', () => {
    const level = compileLevel(pegGrid(60, (id) => id <= N - 1));
    expect(() => assignColors(level, attemptConfig(), Rng.fromSeed(1))).toThrow(AttemptSetupError);
  });

  it('draws orange pegs near the cannon and near each other, but can reach any flagged peg', () => {
    const level = compileLevel(pegGrid(126));
    const pivotX = level.level.board.width / 2;
    const pos = (i: number): { x: number; y: number } => {
      const e = level.bodies[i]?.element;
      return { x: e?.x ?? 0, y: e?.y ?? 0 };
    };
    const dist = (a: { x: number; y: number }, b: { x: number; y: number }): number =>
      Math.sqrt((a.x - b.x) * (a.x - b.x) + (a.y - b.y) * (a.y - b.y));
    const pivot = { x: pivotX, y: CANNON_PIVOT_Y };
    const all = level.scoringBodies;
    const meanAll = all.reduce((s, i) => s + dist(pos(i), pivot), 0) / all.length;
    // Mean distance from the cannon, and to the nearest other orange peg, over many draws.
    let toCannon = 0;
    let toNeighbor = 0;
    let draws = 0;
    const bottomRow = new Set(all.filter((i) => pos(i).y >= 420));
    let bottomOrange = 0;
    for (let seed = 0; seed < 300; seed++) {
      const { colors } = assignColors(level, attemptConfig(), Rng.fromSeed(seed));
      const orange = all.filter((i) => colors[i] === 'orange');
      for (const i of orange) {
        toCannon += dist(pos(i), pivot);
        let nearest = Infinity;
        for (const j of orange) if (j !== i) nearest = Math.min(nearest, dist(pos(i), pos(j)));
        toNeighbor += nearest;
        draws++;
        if (bottomRow.has(i)) bottomOrange++;
      }
    }
    expect(toCannon / draws).toBeLessThan(0.75 * meanAll);
    // Rows are 45 px apart and pegs 47 px: drawn pegs mostly sit next to another orange peg.
    expect(toNeighbor / draws).toBeLessThan(60);
    expect(bottomOrange).toBeGreaterThan(0);
  });

  it('raises the orange count for challenges', () => {
    for (const orangeCount of [35, 45, 55]) {
      const { colors } = assignColors(grid, attemptConfig({ orangeCount }), Rng.fromSeed(5));
      expect(count(colors)).toEqual({
        orange: orangeCount,
        green: 2,
        purple: 1,
        blue: 117 - orangeCount,
      });
    }
  });

  it('adds green from campaign level 3 and purple from level 4', () => {
    const colorsAt = (level: number): Record<string, number> =>
      count(
        assignColors(
          grid,
          campaignConfig({ level, try: 1, firstPlay: false, power: null }),
          Rng.fromSeed(9),
        ).colors,
      );
    expect(colorsAt(1)).toEqual({ orange: N, blue: 120 - N });
    expect(colorsAt(2)).toEqual({ orange: N, blue: 120 - N });
    expect(colorsAt(3)).toEqual({ orange: N, green: 2, blue: 120 - N - 2 });
    expect(colorsAt(4)).toEqual({ orange: N, green: 2, purple: 1, blue: 120 - N - 3 });
  });

  it('uses designer-placed greens on the first campaign play and random ones on retries', () => {
    const level = compileLevel(pegGrid(120, () => true, { seededGreens: [5, 77] }));
    const first = campaignConfig({ level: 10, try: 1, firstPlay: true, power: null });
    for (let seed = 0; seed < 10; seed++) {
      const { colors } = assignColors(level, first, Rng.fromSeed(seed));
      expect(idsOf(level, colors, 'green')).toEqual([5, 77]);
      expect(count(colors).orange).toBe(N);
    }
    const retry = campaignConfig({ level: 10, try: 2, firstPlay: false, power: null });
    const greens = new Set<string>();
    for (let seed = 0; seed < 10; seed++) {
      greens.add(
        idsOf(level, assignColors(level, retry, Rng.fromSeed(seed)).colors, 'green').join(),
      );
    }
    expect(greens.size).toBeGreaterThan(1);
  });
});

describe('purple peg', () => {
  it('moves to a different blue peg still on the board, and the old one turns blue', () => {
    const level = compileLevel(pegGrid(40));
    const world = new World(level);
    const rng = Rng.fromSeed(11);
    const { colors, purple } = assignColors(level, attemptConfig(), rng);
    let current = purple;
    for (let shot = 0; shot < 30; shot++) {
      const next = movePurple(level, colors, current, world.bodies, rng);
      expect(next).not.toBe(current);
      expect(colors[next]).toBe('purple');
      expect(colors[current]).toBe('blue');
      expect(count(colors).purple).toBe(1);
      current = next;
    }
  });

  it('replaces a purple peg that was hit and removed, and stays when no other blue peg is left', () => {
    const level = compileLevel(pegGrid(30, (id) => id <= 27));
    const world = new World(level);
    const rng = Rng.fromSeed(2);
    const { colors, purple } = assignColors(level, attemptConfig(), rng);
    // Hit the purple peg: it lights and leaves at shot end.
    const purpleId = level.bodies[purple]?.id ?? -1;
    world.spawnBall({ x: 0, y: 0, vx: 0, vy: 0 });
    world.lightPegs([purpleId]);
    world.removeBall(0);
    world.endShot();
    const next = movePurple(level, colors, purple, world.bodies, rng);
    expect(next).not.toBe(purple);
    expect(world.bodies[next]?.active).toBe(true);
    expect(colors[purple]).toBe('purple'); // gone from the board with its color

    // Remove every blue peg: nowhere to move, so the purple peg stays.
    const blue = level.scoringBodies.filter((i) => colors[i] === 'blue');
    world.spawnBall({ x: 0, y: 0, vx: 0, vy: 0 });
    world.lightPegs(blue.map((i) => level.bodies[i]?.id ?? -1));
    world.removeBall(0);
    world.endShot();
    expect(movePurple(level, colors, next, world.bodies, rng)).toBe(next);
    expect(colors[next]).toBe('purple');
  });

  it('prefers flagged pegs when it moves', () => {
    const level = compileLevel(pegGrid(80, (id) => id <= 40));
    const world = new World(level);
    const rng = Rng.fromSeed(4);
    const flagged = flaggedIds(level);
    const { colors, purple } = assignColors(level, attemptConfig(), rng);
    let current = purple;
    for (let shot = 0; shot < 20; shot++) {
      current = movePurple(level, colors, current, world.bodies, rng);
      expect(flagged.has(level.bodies[current]?.id ?? -1)).toBe(true);
    }
  });
});
