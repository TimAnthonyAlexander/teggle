import { describe, expect, it } from 'vitest';
import { cos, PI, sin } from '../core/dmath';
import {
  curvedBrickVertices,
  findSelfIntersection,
  rotateVec,
  signedArea,
  straightBrickVertices,
} from './geometry';

describe('brick geometry', () => {
  it('builds a straight brick standing along y at rotation 0', () => {
    const v = straightBrickVertices(30, 20);
    expect(v).toEqual([
      { x: -10, y: -15 },
      { x: 10, y: -15 },
      { x: 10, y: 15 },
      { x: -10, y: 15 },
    ]);
    expect(Math.abs(signedArea(v))).toBe(600);
  });

  it('builds a curved brick from the research vertex math (section 2.6)', () => {
    // The Fireball cover from the original's base level: inner radius 230, width 15, 30 degree
    // sector, 7 points, facing up (rotation PI/2), at (325.33334, 539.66669).
    const r = 230;
    const w = 15;
    const sector = PI / 6;
    const n = 7;
    const a = PI / 2;
    const p = { x: 325.33334, y: 539.66669 };
    const local = curvedBrickVertices(r, w, sector, n);
    expect(local).toHaveLength(2 * n);
    const c = cos(a);
    const s = sin(a);
    const world = local.map((v) => {
      const q = rotateVec(v.x, v.y, c, s);
      return { x: p.x + q.x, y: p.y + q.y };
    });
    // Research formula: c = p - Rm n(A), outer_i = c + (R + W) n(psi_i), inner_i = c + R n(psi_i).
    const rm = r + w / 2;
    const center = { x: p.x - rm * cos(a), y: p.y + rm * sin(a) };
    for (let i = 0; i < n; i++) {
      const psi = a - sector / 2 + (i * sector) / (n - 1);
      const outer = world[i];
      const inner = world[2 * n - 1 - i];
      expect(outer?.x).toBeCloseTo(center.x + (r + w) * cos(psi), 9);
      expect(outer?.y).toBeCloseTo(center.y - (r + w) * sin(psi), 9);
      expect(inner?.x).toBeCloseTo(center.x + r * cos(psi), 9);
      expect(inner?.y).toBeCloseTo(center.y - r * sin(psi), 9);
    }
    // The cover's top sits on the bisector, about 7.5 px above the brick's position.
    expect(world[3]?.y).toBeCloseTo(p.y - w / 2, 9);
    expect(findSelfIntersection(local)).toBeNull();
  });
});

describe('polygon checks', () => {
  it('finds the crossing of a bow tie and accepts a concave outline', () => {
    const bowTie = [
      { x: 0, y: 0 },
      { x: 10, y: 10 },
      { x: 10, y: 0 },
      { x: 0, y: 10 },
    ];
    expect(findSelfIntersection(bowTie)).not.toBeNull();
    const arrow = [
      { x: 0, y: 0 },
      { x: 10, y: 5 },
      { x: 0, y: 10 },
      { x: 3, y: 5 },
    ];
    expect(findSelfIntersection(arrow)).toBeNull();
    expect(signedArea(arrow)).not.toBe(0);
  });
});
