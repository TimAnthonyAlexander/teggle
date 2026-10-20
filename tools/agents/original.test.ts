import { describe, expect, it } from 'vitest';
import { PI } from '../../src/core/dmath';
import { movementPose } from '../../src/sim/movement';
import { convertOriginal, ORIGINAL_CAMPAIGN } from './original';

// Synthetic entries in the dump format (no original level data): one of each kind the converter
// reads, with the readings it makes.
const bits = { collideable: true, ballstopreset: false };
const hidden = { collideable: false, ballstopreset: false };

describe('convertOriginal', () => {
  it('lists 55 campaign files in play order', () => {
    expect(ORIGINAL_CAMPAIGN).toHaveLength(55);
    expect(new Set(ORIGINAL_CAMPAIGN).size).toBe(55);
  });

  it('converts pegs, bricks, solids and rods', () => {
    const level = convertOriginal('test', [
      {
        id: 2,
        cls: 5,
        bits,
        peg: { canBeOrange: true, crumble: true },
        x: 100,
        y: 200,
        radius: 10,
      },
      {
        id: 3,
        cls: 6,
        bits,
        peg: { canBeOrange: false, crumble: false },
        x: 300,
        y: 250,
        straight: true,
        length: 35,
        angle: 90,
        width: 20,
      },
      {
        id: 4,
        cls: 6,
        bits,
        peg: { canBeOrange: true, crumble: false },
        x: 400,
        y: 250,
        length: 35,
        angle: 45,
        sector: 30,
        curveRaw: 4,
      },
      { id: 5, cls: 2, bits, x1: 10, y1: 20, x2: 50, y2: 60 },
      { id: 6, cls: 5, bits, x: 500, y: 300, radius: 30 },
      { id: 7, cls: 5, bits: hidden, x: 500, y: 300, radius: 30 },
      {
        id: 8,
        cls: 3,
        bits,
        x: 200,
        y: 400,
        rotation: 0.5,
        verts: [
          [0, 0],
          [40, 0],
          [0, 40],
          [0, 0],
        ],
      },
    ]);
    expect(level.board).toEqual({ width: 650, height: 560 });
    const byId = new Map(level.elements.map((e) => [e.id, e]));
    expect(byId.get(2)).toMatchObject({ kind: 'peg', canBeOrange: true, quickDisappear: true });
    expect(byId.get(3)).toMatchObject({ kind: 'brick', canBeOrange: false, rotation: PI / 2 });
    expect(byId.get(4)).toMatchObject({ kind: 'curvedBrick', innerRadius: 35, points: 6 });
    expect(byId.get(4)).toMatchObject({ sector: (30 * PI) / 180, rotation: (45 * PI) / 180 });
    expect(byId.get(5)).toMatchObject({ kind: 'rod', x: 30, y: 40, a: { x: -20, y: -20 } });
    expect(byId.get(6)).toMatchObject({ kind: 'circle', radius: 30 });
    expect(byId.has(7)).toBe(false);
    expect(byId.get(8)).toMatchObject({ kind: 'polygon', rotation: 0.5 });
    expect(byId.get(8)?.kind === 'polygon' ? byId.get(8) : null).toMatchObject({
      vertices: [
        { x: 0, y: 0 },
        { x: 40, y: 0 },
        { x: 0, y: 40 },
      ],
    });
  });

  it('hides the solids the original does not draw, never pegs or teleports', () => {
    const unseen = { ...bits, visible: false };
    const level = convertOriginal('test', [
      { id: 2, cls: 5, bits: unseen, peg: { canBeOrange: true, crumble: false }, x: 50, y: 50 },
      { id: 3, cls: 5, bits: unseen, x: 500, y: 300, radius: 30 },
      { id: 4, cls: 2, bits: unseen, x1: 10, y1: 20, x2: 50, y2: 60 },
      { id: 5, cls: 2, bits: { ...bits, visible: true }, x1: 10, y1: 90, x2: 50, y2: 90 },
      { id: 6, cls: 8, bits: unseen, x: 300, y: 300, w: 40, h: 40, dest: { x: 10, y: 10 } },
    ]);
    const visible = new Map(level.elements.map((e) => [e.id, e.visible]));
    expect([...visible]).toEqual([
      [2, true],
      [3, false],
      [4, false],
      [5, true],
      [6, true],
    ]);
  });

  it('turns a moving brick by its angle plus its mover rotation', () => {
    const level = convertOriginal('test', [
      {
        id: 2,
        cls: 6,
        bits,
        peg: { canBeOrange: true, crumble: false },
        length: 35,
        angle: -90,
        sector: 30,
        mover: {
          type: -13,
          anchorX: 326,
          anchorY: 304,
          time: 1000,
          radius: 45,
          phase: 0.25,
          rotation: PI / 2,
          moverId: 3,
        },
      },
    ]);
    const brick = level.elements[0];
    expect(brick).toMatchObject({ kind: 'curvedBrick', x: 326, y: 304, rotation: 0 });
    expect(brick?.movement).toMatchObject({
      type: 'rotateAroundCircle',
      reverse: true,
      period: 1000,
      phase: 0.25,
    });
  });

  it('nests a mover on its parent through a carrier, anchored to agree at tick 0', () => {
    // The parent mover (id 5) has no owner of its own; the reference names it as id + 1.
    const parent = { type: 2, anchorX: 300, anchorY: 100, time: 400, radius: 50, moverId: 5 };
    const level = convertOriginal('test', [
      {
        id: 2,
        cls: 5,
        bits,
        peg: { canBeOrange: true, crumble: false },
        radius: 10,
        mover: {
          type: 1,
          anchorX: 120,
          anchorY: 220,
          time: 300,
          radius: 20,
          parentX: 340,
          parentY: 100,
          parent,
          moverId: 3,
        },
      },
      {
        id: 4,
        cls: 5,
        bits,
        peg: { canBeOrange: true, crumble: false },
        radius: 10,
        mover: {
          type: 3,
          anchorX: 0,
          anchorY: 0,
          time: 300,
          radius: 20,
          parentX: 340,
          parentY: 100,
          parent: { moverRef: 6 },
          moverId: 7,
        },
      },
    ]);
    const carrier = level.elements.find((e) => e.id === 1_000_005);
    expect(carrier).toMatchObject({ kind: 'circle', collision: false, x: 300, y: 100 });
    expect(carrier?.movement).toBeDefined();
    const movement = carrier?.movement;
    if (movement === undefined) return;
    const p0 = movementPose(movement, 300, 100, 0, 0, { x: 0, y: 0, rotation: 0 });
    const peg = level.elements.find((e) => e.id === 2);
    expect(peg).toMatchObject({ parent: 1_000_005, x: 120 + p0.x - 340, y: 220 + p0.y - 100 });
    expect(level.elements.find((e) => e.id === 4)).toMatchObject({ parent: 1_000_005 });
    expect(level.elements.filter((e) => e.id === 1_000_005)).toHaveLength(1);
  });

  it('sends a teleport to a moving exit named by reference, or to a fixed point', () => {
    const level = convertOriginal('test', [
      {
        id: 2,
        cls: 3,
        bits: hidden,
        verts: [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
        mover: { type: 2, anchorX: 326, anchorY: 228, time: 1000, radius: 310, moverId: 3 },
      },
      {
        id: 4,
        cls: 8,
        bits,
        x: 50,
        y: 163,
        w: 40,
        h: 40,
        circular: true,
        outDelay: 10,
        dest: { backref: 3 },
      },
      {
        id: 5,
        cls: 8,
        bits,
        x: 600,
        y: 163,
        w: 40,
        h: 40,
        dest: { id: 6, cls: 3, bits: hidden, x: 597, y: 50 },
      },
    ]);
    const exit = level.elements.find((e) => e.id === 4);
    expect(exit).toMatchObject({
      kind: 'teleport',
      circular: true,
      outDelay: 10,
      exit: { type: 'element', element: 1_000_003 },
    });
    expect(level.elements.find((e) => e.id === 5)).toMatchObject({
      exit: { type: 'point', x: 597, y: 50 },
    });
  });

  it('splits a self-crossing outline into rods', () => {
    const level = convertOriginal('test', [
      {
        id: 2,
        cls: 3,
        bits,
        x: 100,
        y: 100,
        verts: [
          [0, 0],
          [40, 40],
          [40, 0],
          [0, 40],
          [0, 0],
        ],
      },
    ]);
    expect(level.elements).toHaveLength(4);
    expect(level.elements.every((e) => e.kind === 'rod' && e.x === 100 && e.y === 100)).toBe(true);
  });
});
