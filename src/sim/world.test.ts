import { describe, expect, it } from 'vitest';
import { Digest } from '../core/digest';
import { HALF_PI, PI } from '../core/dmath';
import { parseLevel, type LevelElementInput } from '../level/schema';
import {
  benchLevel,
  emptyLevel,
  FIXTURE_HEIGHT as H,
  FIXTURE_WIDTH as W,
  levelWith,
  mixedLevel,
} from '../../tests/fixtures/levels';
import { aimDirection, clampAim, launchPoint } from './aim';
import { compileLevel } from './compile';
import type { SimEvent } from './events';
import { movementPose } from './movement';
import { TrajectoryPreview } from './preview';
import {
  BALL_RADIUS,
  CEILING_BOTTOM,
  CONTACT_SKIN,
  FEVER_DIVIDER_RADIUS,
  FEVER_DIVIDER_X,
  FEVER_HOLE_X,
  MAX_AIM_ANGLE,
} from './tuning';
import { World } from './world';

function worldWith(elements: LevelElementInput[]): World {
  return new World(compileLevel(levelWith(elements)));
}

/** Steps up to `max` ticks and returns copies of every event, in order. */
function run(w: World, max: number, stopWhenEmpty = true): SimEvent[] {
  const out: SimEvent[] = [];
  for (let i = 0; i < max; i++) {
    w.step();
    for (const e of w.events) out.push({ ...e });
    if (stopWhenEmpty && w.ballsInPlay === 0) break;
  }
  return out;
}

function ofType<T extends SimEvent['type']>(
  events: readonly SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

function stepTo(w: World, tick: number): void {
  while (w.tick < tick) w.step();
}

describe('launch and aim', () => {
  it('launches from the barrel tip at 4 px/tick along the direction', () => {
    const w = new World(compileLevel(emptyLevel()));
    const dir = aimDirection(0.3);
    expect(w.launch(dir)).toBe(0);
    const spawned = ofType(w.events, 'ballSpawned')[0];
    const tip = launchPoint(W, dir);
    expect(spawned).toMatchObject({ x: tip.x, y: tip.y, vx: 4 * dir.x, vy: 4 * dir.y });
    expect(tip.y).toBeCloseTo(30 + 92 * Math.cos(0.3), 9);
    expect(() => w.launch(dir)).toThrow(/endShot/);
    w.discardBalls();
    expect(() => w.launch({ x: 0, y: 0 })).toThrow(/non-zero/);
  });

  it('converts aim angles measured from straight down', () => {
    expect(aimDirection(0)).toEqual({ x: 0, y: 1 });
    expect(aimDirection(HALF_PI).x).toBe(1);
    expect(clampAim(3)).toBe(MAX_AIM_ANGLE);
    expect(MAX_AIM_ANGLE).toBeCloseTo((97 * Math.PI) / 180, 15);
  });
});

describe('base geometry', () => {
  it('bounces off the walls at x = 0 and x = width and off the ceiling', () => {
    const w = new World(compileLevel(emptyLevel()));
    w.spawnBall({ x: 100, y: 300, vx: -5, vy: 0 });
    w.spawnBall({ x: W - 100, y: 300, vx: 5, vy: 0 });
    w.spawnBall({ x: 300, y: 100, vx: 0, vy: -8 });
    const walls = ofType(run(w, 40, false), 'wallContact');
    const touch = BALL_RADIUS - CONTACT_SKIN;
    expect(walls.find((e) => e.side === 'left')?.x).toBeCloseTo(touch, 9);
    expect(walls.find((e) => e.side === 'right')?.x).toBeCloseTo(W - touch, 9);
    expect(walls.find((e) => e.side === 'ceiling')?.y).toBeCloseTo(CEILING_BOTTOM + touch, 9);
    // Walls bounce at 0.75 and always bounce (rolly 1e-5).
    expect(walls.every((e) => !e.slide)).toBe(true);
  });

  it('runs the bucket on a cosine from 66 to width - 66 at the original peak speed', () => {
    const level = compileLevel(emptyLevel());
    expect(level.bucketCycle).toBe(905);
    const original = compileLevel(
      parseLevel({
        formatVersion: 1,
        name: 'narrow',
        background: 'none',
        board: { width: 650, height: 560 },
        elements: [],
      }),
    );
    expect(original.bucketTravel).toBe(259);
    const w = new World(level);
    let min = Infinity;
    let max = -Infinity;
    let peak = 0;
    let last = w.bucketX;
    const start = w.bucketX;
    for (let t = 0; t < level.bucketCycle; t++) {
      w.step();
      min = Math.min(min, w.bucketX);
      max = Math.max(max, w.bucketX);
      peak = Math.max(peak, Math.abs(w.bucketX - last));
      last = w.bucketX;
    }
    expect(w.bucketX).toBe(start);
    // Whole ticks land within a few thousandths of a pixel of the turning points.
    expect(min).toBeCloseTo(66, 1);
    expect(max).toBeCloseTo(W - 66, 1);
    expect(peak).toBeCloseTo((2 * Math.PI * 260) / 600, 2);
  });

  it('catches a ball that drops into the bucket, unless it is covered', () => {
    const drop = (cover: boolean): SimEvent[] => {
      const w = new World(compileLevel(emptyLevel()));
      w.setBucketCover(cover);
      // The bucket rests at its left end around tick 226.
      stepTo(w, 200);
      w.spawnBall({ x: 66, y: H - 70, vx: 0, vy: 0 });
      return run(w, 300);
    };
    const open = drop(false);
    expect(ofType(open, 'bucketCatch')).toHaveLength(1);
    expect(ofType(open, 'ballOut')).toHaveLength(0);
    const covered = drop(true);
    expect(ofType(covered, 'bucketCatch')).toHaveLength(0);
    expect(ofType(covered, 'bucketContact')[0]?.part).toBe('cover');
  });

  it('adds the Pyramid slopes only while the power runs', () => {
    const drop = (pyramid: boolean): SimEvent[] => {
      const w = new World(compileLevel(emptyLevel()));
      w.setPyramid(pyramid);
      stepTo(w, 200);
      w.spawnBall({ x: 66 + 130, y: H - 80, vx: 0, vy: 0 });
      return run(w, 300);
    };
    expect(ofType(drop(true), 'bucketContact')[0]?.part).toBe('pyramid');
    expect(ofType(drop(false), 'bucketContact')).toHaveLength(0);
  });

  it('raises the Fever buckets, scaled to the board, and reports the bucket a ball lands in', () => {
    const level = compileLevel(emptyLevel());
    const scale = W / 650;
    const dividers = level.bodies.filter((b) => b.role === 'feverDivider');
    expect(dividers.map((b) => b.baseX)).toEqual(FEVER_DIVIDER_X.map((x) => x * scale));
    expect(dividers[0]?.radius).toBeCloseTo(FEVER_DIVIDER_RADIUS * scale, 12);
    // Tops stay at the original height: 591 - 37 = 554.
    expect((dividers[0]?.baseY ?? 0) - (dividers[0]?.radius ?? 0)).toBeCloseTo(554, 9);

    const w = new World(level);
    const divider = w.bodies.find((b) => b.def.role === 'feverDivider');
    const restY = divider?.def.baseY ?? 0;
    expect(divider?.y).toBeCloseTo(restY + 30, 9);
    w.setFever(true);
    run(w, 5, false);
    expect(divider?.y).toBeCloseTo(restY, 9);
    expect(w.bodies.find((b) => b.def.role === 'bucketRim')?.solid).toBe(false);

    const middle = (FEVER_HOLE_X[2] ?? 0) * scale;
    w.spawnBall({ x: middle, y: H - 60, vx: 0, vy: 0 });
    const caught = ofType(run(w, 200), 'feverCatch');
    expect(caught.map((e) => e.bucket)).toEqual([2]);
  });

  it('swings the flippers while the button is held', () => {
    const w = new World(compileLevel(emptyLevel()));
    const left = w.bodies.find((b) => b.def.role === 'flipper' && b.def.side === 'left');
    const right = w.bodies.find((b) => b.def.role === 'flipper' && b.def.side === 'right');
    // Rest is mover phase 22/30, so the saved state of the original (rotation 0.00287) comes back.
    expect(left?.rotation).toBeCloseTo(0.00287, 5);
    expect(right?.rotation).toBeCloseTo(-0.00287, 5);
    w.setFlippers(true);
    w.setFlipperInput(true);
    run(w, 15, false);
    expect(left?.rotation).toBeCloseTo(1.0443, 4);
    expect(right?.rotation).toBeCloseTo(-1.0443, 4);
    w.setFlipperInput(false);
    run(w, 15, false);
    expect(left?.rotation).toBeCloseTo(0.00287, 5);
  });

  it('bats a ball off a rising flipper, capped at its maximum bounce speed', () => {
    const w = new World(compileLevel(emptyLevel()));
    w.setFlippers(true);
    w.spawnBall({ x: 60, y: H - 120, vx: 0, vy: 0 });
    let hit: SimEvent | undefined;
    for (let i = 0; i < 200 && w.ballsInPlay > 0 && hit === undefined; i++) {
      const b = w.balls[0];
      w.setFlipperInput(b !== undefined && b.y > H - 95);
      w.step();
      hit = w.events.find((e) => e.type === 'flipperContact');
    }
    expect(hit).toMatchObject({ type: 'flipperContact', side: 'left', slide: false });
    const b = w.balls[0];
    expect(b?.vy ?? 0).toBeLessThan(0);
    expect(Math.hypot(b?.vx ?? 0, b?.vy ?? 0)).toBeLessThanOrEqual(7 + 1e-9);
  });
});

describe('pegs and shots', () => {
  it('lights a peg on the first contact, keeps it solid, and removes it at shot end', () => {
    const w = worldWith([
      { kind: 'peg', id: 1, x: 300, y: 300 },
      { kind: 'peg', id: 2, x: 600, y: 300 },
    ]);
    w.spawnBall({ x: 300, y: 250, vx: 0, vy: 0 });
    const events = run(w, 120, false);
    const contacts = ofType(events, 'pegContact');
    expect(contacts.length).toBeGreaterThan(1);
    expect(contacts.map((e) => e.first)).toEqual([true, ...contacts.slice(1).map(() => false)]);
    expect(ofType(events, 'pegLit')).toEqual([
      expect.objectContaining({ element: 1, ball: 0, cause: 'contact' }),
    ]);
    w.lightPegs([2]);
    expect(ofType(w.events, 'pegLit').at(-1)).toMatchObject({
      element: 2,
      ball: -1,
      cause: 'power',
    });
    expect(w.litElementIds()).toEqual([1, 2]);
    expect(() => {
      w.endShot();
    }).toThrow(/still in play/);
    w.removeBall(0);
    w.endShot();
    expect(ofType(w.events, 'pegRemoved').map((e) => [e.element, e.reason])).toEqual([
      [1, 'shotEnd'],
      [2, 'shotEnd'],
    ]);
    expect(w.isActive(1)).toBe(false);
    expect(w.inShot).toBe(false);
  });

  it('removes a quick-disappear peg 97 ticks after it lights', () => {
    const w = worldWith([{ kind: 'peg', id: 1, x: 300, y: 300, quickDisappear: true }]);
    w.spawnBall({ x: 302, y: 250, vx: 0, vy: 0 });
    const events = run(w, 300, false);
    const lit = ofType(events, 'pegLit')[0];
    const removed = ofType(events, 'pegRemoved')[0];
    expect(removed?.reason).toBe('quickDisappear');
    expect((removed?.tick ?? 0) - (lit?.tick ?? 0)).toBe(97);
  });

  it('counts a resting ball as stuck and resets on peg removal and ballStopReset contact', () => {
    const w = worldWith([{ kind: 'peg', id: 1, x: 300, y: 300 }]);
    w.spawnBall({ x: 300, y: 270, vx: 0, vy: 0 });
    run(w, 900, false);
    const ball = w.balls[0];
    const before = ball?.stuckTicks ?? 0;
    expect(before).toBeGreaterThan(300);
    w.step();
    expect(ball?.stuckTicks).toBe(before + 1);
    w.removePeg(1, 'stuck');
    expect(ofType(w.events, 'pegRemoved')[0]).toMatchObject({ element: 1, reason: 'stuck' });
    expect(ball?.stuckTicks).toBe(0);

    const reset = worldWith([
      { kind: 'circle', id: 1, x: 300, y: 300, radius: 10, ballStopReset: true },
    ]);
    reset.spawnBall({ x: 300, y: 270, vx: 0, vy: 0 });
    run(reset, 900, false);
    expect(reset.balls[0]?.stuckTicks ?? 99).toBeLessThan(2);
  });

  it('collides with straight and curved bricks, concave polygons and rods', () => {
    const w = worldWith([
      { kind: 'brick', id: 1, x: 100, y: 300, rotation: HALF_PI },
      { kind: 'curvedBrick', id: 2, x: 300, y: 300, rotation: HALF_PI },
      {
        kind: 'polygon',
        id: 3,
        x: 500,
        y: 300,
        vertices: [
          { x: -30, y: 0 },
          { x: 30, y: 0 },
          { x: 30, y: 20 },
          { x: 0, y: 5 },
          { x: -30, y: 20 },
        ],
      },
      { kind: 'rod', id: 4, x: 700, y: 300, a: { x: -30, y: 0 }, b: { x: 30, y: 0 } },
    ]);
    for (const x of [100, 300, 500, 700]) w.spawnBall({ x: x + 3, y: 250, vx: 0, vy: 0 });
    const events = run(w, 60, false);
    expect(ofType(events, 'pegContact').map((e) => e.element)).toEqual(
      expect.arrayContaining([1, 2]),
    );
    expect(ofType(events, 'solidContact').map((e) => e.element)).toEqual(
      expect.arrayContaining([3, 4]),
    );
    // Every first contact lands on the top surface (normal pointing up).
    for (const id of [1, 2, 3, 4]) {
      const first = events.find(
        (e) => (e.type === 'pegContact' || e.type === 'solidContact') && e.element === id,
      );
      expect(first && 'ny' in first ? first.ny : 0).toBeLessThan(-0.9);
    }
  });

  it('pushes a ball out of a polygon it ends up inside', () => {
    const w = worldWith([
      {
        kind: 'polygon',
        id: 1,
        x: 400,
        y: 300,
        vertices: [
          { x: -40, y: -10 },
          { x: 40, y: -10 },
          { x: 40, y: 10 },
          { x: -40, y: 10 },
        ],
      },
    ]);
    w.spawnBall({ x: 400, y: 297, vx: 0, vy: 0 });
    w.step();
    expect(ofType(w.events, 'solidContact')[0]?.element).toBe(1);
    expect(w.balls[0]?.y).toBeLessThanOrEqual(290 - BALL_RADIUS + 1e-9);
  });

  it('teleports after the out delay, keeps the velocity, and is edge triggered', () => {
    const w = worldWith([
      {
        kind: 'teleport',
        id: 1,
        x: 200,
        y: 300,
        width: 40,
        height: 40,
        outDelay: 5,
        exit: { type: 'element', element: 2 },
      },
      { kind: 'circle', id: 2, x: 700, y: 100, radius: 3, collision: false },
      {
        kind: 'teleport',
        id: 3,
        x: 700,
        y: 100,
        width: 30,
        height: 30,
        exit: { type: 'remove' },
      },
    ]);
    w.spawnBall({ x: 200, y: 250, vx: 0, vy: 0 });
    const events = run(w, 200);
    const tp = ofType(events, 'teleport');
    expect(tp.map((e) => [e.element, e.stage])).toEqual([
      [1, 'enter'],
      [1, 'exit'],
    ]);
    expect((tp[1]?.tick ?? 0) - (tp[0]?.tick ?? 0)).toBe(5);
    expect(tp[1]).toMatchObject({ x: 700, y: 100 });
    // The exit lies inside teleport 3; the ball has to leave and come back to trigger it, so it
    // falls out of the bottom instead.
    expect(ofType(events, 'ballOut')[0]?.reason).toBe('bottom');

    const remove = worldWith([
      { kind: 'teleport', id: 1, x: 200, y: 300, width: 40, height: 40, exit: { type: 'remove' } },
    ]);
    remove.spawnBall({ x: 200, y: 250, vx: 0, vy: 0 });
    expect(ofType(run(remove, 200), 'ballOut')[0]?.reason).toBe('teleport');
  });

  it('lets a Fireball pass through pegs while lighting them', () => {
    // Far right, where the bucket (moving left from the middle) is not.
    const w = worldWith([{ kind: 'peg', id: 1, x: 820, y: 300 }]);
    w.spawnBall({ x: 820, y: 200, vx: 0, vy: 3, radius: 10, passThroughScoring: true });
    const events = run(w, 200);
    expect(ofType(events, 'pegLit').map((e) => e.element)).toEqual([1]);
    expect(ofType(events, 'ballOut')).toHaveLength(1);
    expect(ofType(events, 'pegContact').every((e) => e.first)).toBe(true);
  });

  it('brings a Spooky ball back in at the top once', () => {
    const w = new World(compileLevel(emptyLevel()));
    w.spawnBall({ x: 860, y: 400, vx: 0, vy: 2, topReturns: 1 });
    const events = run(w, 500);
    const back = ofType(events, 'ballReturned');
    expect(back).toHaveLength(1);
    expect(back[0]?.y).toBe(CEILING_BOTTOM + BALL_RADIUS + 0.5);
    expect(ofType(events, 'ballOut')).toHaveLength(1);
  });

  it('bounces balls off each other', () => {
    const w = new World(compileLevel(emptyLevel()));
    w.spawnBall({ x: 300, y: 300, vx: 3, vy: 0 });
    w.spawnBall({ x: 330, y: 300, vx: -3, vy: 0 });
    const contact = ofType(run(w, 10, false), 'ballContact');
    expect(contact).toHaveLength(1);
    expect(w.balls[0]?.vx ?? 0).toBeLessThan(0);
    expect(w.balls[1]?.vx ?? 0).toBeGreaterThan(0);
  });
});

describe('moving parts', () => {
  it('carries a child on its parent and matches the movement math to the bit', () => {
    const w = worldWith([
      {
        kind: 'circle',
        id: 1,
        x: 400,
        y: 300,
        radius: 4,
        collision: false,
        movement: { type: 'horizontalCycle', period: 300, radius: 50 },
      },
      {
        kind: 'brick',
        id: 2,
        x: 400,
        y: 300,
        parent: 1,
        movement: { type: 'rotateAroundCircle', period: 200, radius: 30, phase: 0.1 },
      },
      { kind: 'peg', id: 3, x: 420, y: 300, parent: 1 },
    ]);
    const level = w.level.level;
    const parentMove = level.elements[0]?.movement;
    const childMove = level.elements[1]?.movement;
    if (parentMove === undefined || childMove === undefined) throw new Error('fixture');
    const p = { x: 0, y: 0, rotation: 0 };
    const c = { x: 0, y: 0, rotation: 0 };
    const ref = movementPose(parentMove, 400, 300, 0, 0, { x: 0, y: 0, rotation: 0 });
    for (let t = 0; t < 700; t++) {
      if (t > 0) w.step();
      movementPose(parentMove, 400, 300, 0, t, p);
      movementPose(childMove, 400 + (p.x - ref.x), 300 + (p.y - ref.y), 0, t, c);
      const child = w.element(2);
      expect(child.x).toBe(c.x);
      expect(child.y).toBe(c.y);
      expect(child.rotation).toBe(c.rotation);
      expect(w.element(3).x).toBe(420 + (p.x - ref.x));
    }
  });

  it('moves parts between shots, by the world clock', () => {
    const w = worldWith([
      { kind: 'peg', id: 1, x: 400, y: 300, movement: { type: 'circle', period: 400, radius: 40 } },
    ]);
    const x0 = w.element(1).x;
    run(w, 100, false);
    expect(w.tick).toBe(100);
    expect(w.element(1).x).toBeCloseTo(400, 9);
    expect(w.element(1).y).toBeCloseTo(260, 9);
    expect(x0).toBe(440);
  });
});

describe('snapshots and preview', () => {
  function digestRun(w: World, ticks: number): string {
    const d = new Digest();
    for (let i = 0; i < ticks; i++) {
      w.step();
      for (const e of w.events) for (const v of Object.values(e)) d.string(String(v));
      for (const b of w.balls) d.number(b.x).number(b.y).number(b.vx).number(b.vy);
    }
    return d.hex();
  }

  it('clones mid-shot into an independent world that continues identically', () => {
    const w = new World(compileLevel(mixedLevel()));
    run(w, 37, false);
    w.launch(aimDirection(0.4));
    run(w, 120, false);
    const copy = w.clone();
    const a = digestRun(w, 400);
    const b = digestRun(copy, 400);
    expect(b).toBe(a);

    const reused = new World(w.level);
    reused.copyFrom(copy);
    expect(digestRun(reused, 200)).toBe(digestRun(copy, 200));
  });

  it('previews the exact path up to the first contact, or through it with Guide', () => {
    const level = compileLevel(benchLevel());
    const w = new World(level);
    run(w, 50, false);
    const preview = new TrajectoryPreview(level, 400);
    const dir = aimDirection(-0.5);
    const n = preview.run(w, dir, { ticks: 400 });
    expect(preview.end).toBe('contact');
    expect(w.ballsInPlay).toBe(0);

    const real = w.clone();
    real.launch(dir);
    const path: number[] = [real.balls[0]?.x ?? 0, real.balls[0]?.y ?? 0];
    for (let i = 0; i < n - 2; i++) {
      real.step();
      path.push(real.balls[0]?.x ?? 0, real.balls[0]?.y ?? 0);
    }
    expect(Array.from(preview.points.subarray(0, path.length))).toEqual(path);

    const guided = new TrajectoryPreview(level, 400);
    const m = guided.run(w, dir, { ticks: 400, throughFirstBounce: true });
    expect(m).toBeGreaterThan(n);
    expect(Array.from(guided.points.subarray(0, path.length))).toEqual(path);
  });

  it('never moves parts of the source world while previewing', () => {
    const level = compileLevel(mixedLevel());
    const w = new World(level);
    const preview = new TrajectoryPreview(level, 100);
    preview.run(w, aimDirection(PI / 8), { ticks: 100 });
    expect(w.tick).toBe(0);
    expect(w.events).toHaveLength(0);
  });
});
