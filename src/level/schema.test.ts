import { describe, expect, it } from 'vitest';
import { isScoringElement, LevelFormatError, parseLevel, type LevelElementInput } from './schema';

function file(elements: unknown[], extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    formatVersion: 1,
    name: 'Test',
    background: 'meadow',
    board: { width: 916, height: 560 },
    elements,
    ...extra,
  };
}

function rejects(json: unknown, message: RegExp): void {
  expect(() => parseLevel(json)).toThrow(LevelFormatError);
  expect(() => parseLevel(json)).toThrow(message);
}

const peg = (id: number, more: Partial<LevelElementInput> = {}): unknown => ({
  kind: 'peg',
  id,
  x: 100 + id,
  y: 200,
  ...more,
});

describe('parseLevel', () => {
  it('fills in defaults', () => {
    const level = parseLevel(
      file([
        peg(1),
        { kind: 'brick', id: 2, x: 0, y: 0 },
        { kind: 'curvedBrick', id: 3, x: 0, y: 0 },
        { kind: 'circle', id: 4, x: 0, y: 0, radius: 5, movement: { type: 'circle', period: 200 } },
      ]),
    );
    const [p, b, c, s] = level.elements;
    expect(p).toMatchObject({
      radius: 10,
      canBeOrange: true,
      quickDisappear: false,
      collision: true,
      visible: true,
      layer: 0,
      bouncy: 0,
      rolly: 0,
      ballStopReset: false,
      maxBounceVelocity: 0,
    });
    expect(b).toMatchObject({ length: 30, width: 20, rotation: 0 });
    expect(c).toMatchObject({ innerRadius: 35, width: 20, points: 4 });
    expect(s?.movement).toMatchObject({ reverse: false, offset: 0, phase: 0, radius2: 0 });
    expect(level.elements.filter(isScoringElement).map((e) => e.id)).toEqual([1, 2, 3]);
  });

  it('keeps seeded greens and provenance', () => {
    const level = parseLevel(
      file([peg(1), peg(2), peg(3)], {
        seededGreens: [1, 3],
        provenance: { generatorVersion: '1.0.0', seed: 42 },
      }),
    );
    expect(level.seededGreens).toEqual([1, 3]);
    expect(level.provenance).toEqual({ generatorVersion: '1.0.0', seed: 42 });
  });

  it('rejects other format versions with a clear message', () => {
    rejects(file([], { formatVersion: 2 }), /Unsupported level formatVersion 2/);
  });

  it('rejects malformed elements', () => {
    rejects(file([{ kind: 'emitter', id: 1, x: 0, y: 0 }]), /elements\[0\]\.kind/);
    rejects(file([peg(1, { radius: -2 })]), /elements\[0\]\.radius/);
    rejects(file([{ ...(peg(1) as object), color: 'red' }]), /Unrecognized key/);
    rejects(file([peg(1), peg(1)]), /duplicate element id 1/);
  });

  it('rejects bad references', () => {
    rejects(file([peg(1, { parent: 9 })]), /parent 9 does not exist/);
    rejects(file([peg(1, { parent: 1 })]), /its own parent/);
    rejects(file([peg(1, { parent: 2 }), peg(2, { parent: 1 })]), /loops back/);
    rejects(
      file([
        {
          kind: 'teleport',
          id: 1,
          x: 0,
          y: 0,
          width: 20,
          height: 20,
          exit: { type: 'element', element: 5 },
        },
      ]),
      /teleport exit element 5 does not exist/,
    );
    rejects(
      file([peg(1), { kind: 'circle', id: 2, x: 0, y: 0, radius: 4 }], { seededGreens: [1, 2] }),
      /seeded green 2/,
    );
    rejects(file([peg(1)], { seededGreens: [1, 1] }), /two different elements/);
  });

  it('rejects broken shapes and movements', () => {
    rejects(
      file([
        {
          kind: 'polygon',
          id: 1,
          x: 0,
          y: 0,
          vertices: [
            { x: 0, y: 0 },
            { x: 10, y: 10 },
            { x: 10, y: 0 },
            { x: 0, y: 12 },
          ],
        },
      ]),
      /intersect/,
    );
    rejects(
      file([{ kind: 'rod', id: 1, x: 0, y: 0, a: { x: 1, y: 1 }, b: { x: 1, y: 1 } }]),
      /rod end points coincide/,
    );
    rejects(
      file([peg(1, { movement: { type: 'circle', period: 100, pause2: 10 } })]),
      /pause2 has no effect unless pause1 > 0/,
    );
    rejects(file([peg(1, { movement: { type: 'spin', period: 100 } } as never)]), /movement\.type/);
    rejects(file([peg(1, { movement: { type: 'circle', period: 0 } })]), /movement\.period/);
  });

  it('reads paths and the followPath movements that name them', () => {
    const level = parseLevel(
      file([peg(1, { movement: { type: 'followPath', path: 0, period: 300 } })], {
        paths: [
          {
            closed: true,
            points: [
              { x: 0, y: 0 },
              { x: 40, y: 0 },
              { x: 20, y: 30 },
            ],
          },
        ],
      }),
    );
    expect(level.paths?.[0]?.closed).toBe(true);
    expect(level.elements[0]?.movement).toMatchObject({ type: 'followPath', path: 0 });
    const open = { points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] };
    expect(parseLevel(file([], { paths: [open] })).paths?.[0]?.closed).toBe(false);
  });

  it('rejects followPath without a path, a path elsewhere, and broken paths', () => {
    const paths = [{ points: [{ x: 0, y: 0 }, { x: 10, y: 0 }] }];
    rejects(
      file([peg(1, { movement: { type: 'followPath', period: 300 } })], { paths }),
      /names its path/,
    );
    rejects(
      file([peg(1, { movement: { type: 'circle', period: 300, path: 0 } })], { paths }),
      /only a followPath movement has one/,
    );
    rejects(
      file([peg(1, { movement: { type: 'followPath', path: 1, period: 300 } })], { paths }),
      /follows path 1, which does not exist/,
    );
    rejects(file([], { paths: [{ points: [{ x: 1, y: 1 }, { x: 1, y: 1 }] }] }), /coincide/);
    rejects(file([], { paths: [{ closed: true, ...paths[0] }] }), /closed path needs 3 points/);
  });

  it('accepts a concave polygon', () => {
    const level = parseLevel(
      file([
        {
          kind: 'polygon',
          id: 1,
          x: 0,
          y: 0,
          vertices: [
            { x: 0, y: 0 },
            { x: 40, y: 0 },
            { x: 40, y: 10 },
            { x: 10, y: 10 },
            { x: 10, y: 40 },
            { x: 0, y: 40 },
          ],
        },
      ]),
    );
    expect(level.elements).toHaveLength(1);
  });
});
