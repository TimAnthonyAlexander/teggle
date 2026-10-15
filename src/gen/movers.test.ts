import { describe, expect, it } from 'vitest';
import { atan2, PI, wrapAngle } from '../core/dmath';
import { isScoringElement, type LevelElement } from '../level/schema';
import { MotionModel } from '../sim/poses';
import { MOVEMENT_TYPES, type MovementType } from '../level/schema';
import { generateLevel, type GeneratedLevel } from './generate';
import type { LineGeometryInput, RecipeGroupInput } from './lines';
import { lineTrack, phaseFor, trainCount } from './movers';
import type { RecipeInput } from './recipe';

type Pt = [number, number];

function ring(cx: number, cy: number, r: number, n: number): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = (2 * PI * i) / n;
    return [
      Math.round((cx + r * Math.cos(a)) * 10) / 10,
      Math.round((cy - r * Math.sin(a)) * 10) / 10,
    ];
  });
}

function outline(
  paths: LineGeometryInput[],
  groups: RecipeGroupInput[] = [],
  seed = 3,
): GeneratedLevel {
  const recipe: RecipeInput = {
    name: 'Movers',
    parts: [{ template: 'outline', params: { paths, ...(groups.length > 0 ? { groups } : {}) } }],
    fill: 'none',
  };
  return generateLevel(recipe, seed);
}

function inPart(g: GeneratedLevel, path: number): LevelElement[] {
  return g.level.elements.filter(
    (e) => isScoringElement(e) && g.partOf.get(e.id)?.endsWith(`/path ${path}`) === true,
  );
}

/** Element positions (and brick rotations) at a tick, by element id. */
function posesAt(
  g: GeneratedLevel,
  tick: number,
): Map<number, { x: number; y: number; r: number }> {
  const model = new MotionModel(g.level.elements, g.level.paths).at(tick);
  return new Map(
    g.level.elements.map((e, i) => [
      e.id,
      { x: model.xs[i] ?? 0, y: model.ys[i] ?? 0, r: model.rotations[i] ?? 0 },
    ]),
  );
}

/** Checks that a set of elements moves as one rigid body over `ticks`. */
function expectRigid(g: GeneratedLevel, members: readonly LevelElement[], ticks: number): void {
  const peg = members.find((e) => e.kind === 'peg');
  const bricks = members.filter((e) => e.kind !== 'peg');
  if (peg === undefined) throw new Error('the test needs a peg in the group');
  const start = posesAt(g, 0);
  const shape = (p: Map<number, { x: number; y: number; r: number }>) => {
    const o = p.get(peg.id) ?? { x: 0, y: 0, r: 0 };
    return members.map((e) => {
      const q = p.get(e.id) ?? o;
      return { d: Math.hypot(q.x - o.x, q.y - o.y), a: atan2(-(q.y - o.y), q.x - o.x), r: q.r };
    });
  };
  const s0 = shape(start);
  for (let t = 1; t < ticks; t += 13) {
    const s = shape(posesAt(g, t));
    // The frame turns by the same angle for every part: compare each part to the first brick.
    const ref = members.indexOf(bricks[0] ?? peg);
    const turn = wrapAngle((s[ref]?.a ?? 0) - (s0[ref]?.a ?? 0));
    s.forEach((p, k) => {
      const q = s0[k];
      if (q === undefined) return;
      expect(p.d, `distance of part ${k} at tick ${t}`).toBeCloseTo(q.d, 6);
      if (q.d > 1) {
        expect(wrapAngle(p.a - q.a - turn), `direction of part ${k} at tick ${t}`).toBeCloseTo(
          0,
          6,
        );
      }
      if (members[k]?.kind !== 'peg') {
        expect(wrapAngle(p.r - q.r - turn), `facing of part ${k} at tick ${t}`).toBeCloseTo(0, 6);
      }
    });
  }
}

const BOAT: LineGeometryInput[] = [
  { mode: 'pegs', closed: true, spacing: 40, points: ring(458, 320, 52, 10), group: 'g' },
  {
    mode: 'bricks',
    points: [
      [380, 410],
      [536, 410],
    ],
    group: 'g',
  },
];

const PARAMS: Record<MovementType, Record<string, number>> = {
  verticalCycle: { radius: 40 },
  horizontalCycle: { radius: 60 },
  circle: { radius: 30, radius2: 18 },
  horizontalInfinity: { radius: 60, radius2: 40 },
  verticalInfinity: { radius: 40, radius2: 50 },
  horizontalArc: { radius: 40, maxAngle: 1.2 },
  verticalArc: { radius: 30, radius2: 40 },
  rotate: {},
  rotateBackAndForth: { maxAngle: 0.5, pathRotation: 0.1 },
  verticalWrap: { radius: 50 },
  horizontalWrap: { radius: 80 },
  rotateAroundCircle: { radius: 25 },
};

describe('moving groups', { timeout: 60_000 }, () => {
  it.each(MOVEMENT_TYPES)('%s keeps the group rigid and valid', (type) => {
    const g = outline(BOAT, [
      {
        id: 'g',
        pivot: [458, 360],
        movement: { type, period: 800, phase: 0.3, reverse: type === 'rotate', ...PARAMS[type] },
      },
    ]);
    const members = [...inPart(g, 0), ...inPart(g, 1)];
    expect(members.length).toBe(g.scoring);
    expect(inPart(g, 0).length).toBeGreaterThan(5);
    expect(inPart(g, 1).length).toBeGreaterThan(2);
    expect(g.issues).toEqual([]);
    // Wraps jump back at the end of their cycle, all parts at the same tick.
    expectRigid(g, members, 800);
  });

  it('turns about the pivot: the pivot stays put, a part elsewhere circles it', () => {
    const g = outline(BOAT, [
      { id: 'g', pivot: [458, 360], movement: { type: 'rotate', period: 400 } },
    ]);
    const peg = inPart(g, 0)[0];
    if (peg === undefined) throw new Error('no peg');
    const a = posesAt(g, 0).get(peg.id);
    const b = posesAt(g, 100).get(peg.id);
    if (a === undefined || b === undefined) throw new Error('no pose');
    expect(Math.hypot(a.x - 458, a.y - 360)).toBeCloseTo(Math.hypot(b.x - 458, b.y - 360), 6);
    // A quarter turn counterclockwise on screen.
    expect(wrapAngle(atan2(-(b.y - 360), b.x - 458) - atan2(-(a.y - 360), a.x - 458))).toBeCloseTo(
      PI / 2,
      6,
    );
  });

  it('glides along another line, starting where the line passes nearest the pivot', () => {
    const along: Pt[] = [
      [200, 200],
      [458, 160],
      [716, 200],
    ];
    const g = outline(BOAT, [
      {
        id: 'g',
        pivot: [458, 360],
        movement: { type: 'followPath', period: 1200, along: { points: along } },
      },
    ]);
    const members = [...inPart(g, 0), ...inPart(g, 1)];
    expect(g.issues).toEqual([]);
    expectRigid(g, members, 1200);
    // At tick 0 every part is where it was traced.
    const peg = members[0];
    if (peg === undefined) throw new Error('no peg');
    const p0 = posesAt(g, 0).get(peg.id);
    expect([p0?.x, p0?.y]).toEqual([peg.x, peg.y]);
    // The carrier starts on the line next to the pivot, so the parts first move right.
    const p1 = posesAt(g, 50).get(peg.id);
    expect((p1?.x ?? 0) - (p0?.x ?? 0)).toBeGreaterThan(5);
  });

  it('rides a child group on a turning parent at its pivot, upright', () => {
    const paths: LineGeometryInput[] = [
      { mode: 'bricks', closed: true, points: ring(458, 320, 150, 16), group: 'wheel' },
      { mode: 'pegs', closed: true, spacing: 36, points: ring(458, 250, 24, 6), group: 'cabin' },
    ];
    const g = outline(paths, [
      { id: 'wheel', pivot: [458, 320], movement: { type: 'rotate', period: 2000 } },
      { id: 'cabin', parent: 'wheel', pivot: [458, 250] },
    ]);
    expect(g.issues).toEqual([]);
    const cabin = inPart(g, 1);
    expect(cabin.length).toBeGreaterThan(3);
    // Upright: the cabin's pegs only translate, all by the same offset, around the wheel.
    const at0 = posesAt(g, 0);
    const at500 = posesAt(g, 500);
    const offsets = cabin.map((e) => {
      const a = at0.get(e.id);
      const b = at500.get(e.id);
      return [(b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0)];
    });
    for (const o of offsets) {
      expect(o[0]).toBeCloseTo(offsets[0]?.[0] ?? 0, 6);
      expect(o[1]).toBeCloseTo(offsets[0]?.[1] ?? 0, 6);
    }
    // A quarter turn carries the cabin from above the hub to its left.
    expect(offsets[0]?.[0]).toBeCloseTo(-70, 6);
    expect(offsets[0]?.[1]).toBeCloseTo(70, 6);
  });

  it('places a group whole or not at all, and static lines keep clear of its sweep', () => {
    const groups: RecipeGroupInput[] = [
      { id: 'g', movement: { type: 'horizontalCycle', period: 900, radius: 160 } },
    ];
    // A solid in the boat's way, placed before the lines: nothing of the boat is placed.
    const blocked = generateLevel(
      {
        name: 'Blocked',
        parts: [
          { template: 'solids', params: { rods: [{ a: [260, 300], b: [260, 420] }] } },
          { template: 'outline', params: { paths: BOAT, groups } },
        ],
        fill: 'none',
      },
      3,
    );
    expect(blocked.scoring).toBe(0);
    expect(blocked.rejected.length).toBeGreaterThan(10);
    for (const r of blocked.rejected) {
      expect(r.reason).toMatch(/^group g: .* from element 1 \(1:solids\) as it moves$/);
    }
    // Moving lines go before static ones, whatever their order: a static line in the boat's way
    // gives way.
    const block: LineGeometryInput = {
      mode: 'pegs',
      spacing: 40,
      points: [
        [260, 300],
        [260, 440],
      ],
    };
    const boat = outline([block, ...BOAT], groups);
    expect(inPart(boat, 1).length).toBeGreaterThan(5);
    expect(inPart(boat, 0)).toHaveLength(0);
    expect(boat.rejected.find((r) => r.part.endsWith('/path 0'))?.reason).toBe(
      "in a moving part's zone",
    );
    expect(boat.issues).toEqual([]);
  });
});

describe('traveling lines', { timeout: 60_000 }, () => {
  it('spreads pegs evenly over a closed line and keeps them evenly spaced', () => {
    const g = outline([
      {
        mode: 'pegs',
        closed: true,
        spacing: 60,
        points: ring(458, 330, 120, 12),
        travel: { period: 1500 },
      },
    ]);
    const pegs = inPart(g, 0);
    const line = lineTrack({ closed: true, points: ring(458, 330, 120, 12), corners: [] });
    expect(pegs).toHaveLength(trainCount(line.track.length, true, 'pegs', 60));
    expect(g.issues).toEqual([]);
    for (const t of [0, 377, 1100]) {
      const p = posesAt(g, t);
      const d = pegs.map((e, i) => {
        const a = p.get(e.id);
        const b = p.get(pegs[(i + 1) % pegs.length]?.id ?? -1);
        return Math.hypot((b?.x ?? 0) - (a?.x ?? 0), (b?.y ?? 0) - (a?.y ?? 0));
      });
      // Even in arc length; the chords differ a little where the path is a polyline.
      for (const x of d) expect(Math.abs(x - (d[0] ?? 0))).toBeLessThan(1);
    }
  });

  it('runs bricks along an open line, facing as it turns, and back to its start', () => {
    const points: Pt[] = [
      [150, 420],
      [458, 380],
      [766, 420],
    ];
    const g = outline([{ mode: 'bricks', points, travel: { period: 2000 } }]);
    const bricks = inPart(g, 0);
    expect(bricks.length).toBeGreaterThan(5);
    expect(g.issues).toEqual([]);
    const brick = bricks[0];
    if (brick === undefined) throw new Error('no brick');
    const p0 = posesAt(g, 0).get(brick.id);
    const p1 = posesAt(g, 1600).get(brick.id);
    // Four fifths through the cycle it has run that far along the line: past the bend, turned
    // with it (the line turns 15 degrees clockwise there).
    expect((p1?.x ?? 0) - (p0?.x ?? 0)).toBeGreaterThan(400);
    expect(wrapAngle((p1?.r ?? 0) - (p0?.r ?? 0))).toBeLessThan(-0.2);
    const p2 = posesAt(g, 2000).get(brick.id);
    expect([p2?.x, p2?.y, p2?.r]).toEqual([p0?.x, p0?.y, p0?.r]);
  });

  it('refuses a train whose pegs meet where its line crosses itself', () => {
    const eight: Pt[] = Array.from({ length: 16 }, (_, i) => {
      const t = (2 * PI * i) / 16;
      return [
        Math.round((458 + 230 * Math.cos(t)) * 10) / 10,
        Math.round((300 - 95 * Math.sin(2 * t)) * 10) / 10,
      ];
    });
    const crowded = outline([
      { mode: 'pegs', closed: true, spacing: 60, points: eight, travel: { period: 3000 } },
    ]);
    expect(inPart(crowded, 0)).toHaveLength(0);
    expect(crowded.rejected[0]?.reason).toMatch(
      /^traveling line: two of its objects (overlap|come)/,
    );
    const spaced = outline([
      { mode: 'pegs', closed: true, spacing: 142, points: eight, travel: { period: 3000 } },
    ]);
    expect(inPart(spaced, 0).length).toBeGreaterThan(5);
    expect(spaced.issues).toEqual([]);
  });

  it('rides along with the group the line is in', () => {
    const g = outline(
      [
        {
          mode: 'pegs',
          closed: true,
          spacing: 40,
          points: ring(458, 330, 70, 10),
          travel: { period: 600 },
          group: 'g',
        },
      ],
      [{ id: 'g', movement: { type: 'verticalCycle', period: 1000, radius: 40 } }],
    );
    expect(g.issues).toEqual([]);
    const carrier = g.level.elements.find((e) => e.kind === 'circle');
    expect(carrier).toMatchObject({ collision: false, visible: false });
    expect(inPart(g, 0).every((e) => e.parent === carrier?.id)).toBe(true);
  });
});

describe('phaseFor', () => {
  it('gives a phase the clock turns back into the same whole tick', () => {
    for (const period of [7, 600, 1599, 3600]) {
      for (let t = 0; t < period; t += Math.max(1, Math.floor(period / 97))) {
        expect(Math.trunc(phaseFor(t, period) * period)).toBe(t);
      }
    }
    expect(phaseFor(0, 600)).toBe(0);
  });
});
