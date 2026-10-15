import { describe, expect, it } from 'vitest';
import { PI, cos, sin } from '../core/dmath';
import type { LevelElementInput } from '../level/schema';
import type { SimEvent } from '../sim/events';
import type { BallView } from '../sim/world';
import {
  beside,
  DOWN,
  dropLevel,
  FIRST,
  fixedColors,
  FIXTURE_HEIGHT as H,
  FIXTURE_WIDTH as W,
  grazeChain,
  newAttempt,
  ofType,
  pointAt,
  RAMP_START,
  ROD,
  shoot,
  shotPath,
  SPARE,
  styles,
} from '../../tests/fixtures/rules';
import { attemptConfig } from './config';
import { orangeRushTarget } from './scoring';
import { StyleTracker, type StyleShotId } from './style';

/** `n` orange pegs nothing can touch, ids 900 and up. */
function spares(n: number): LevelElementInput[] {
  return Array.from({ length: n }, (_, k) => ({ ...SPARE, id: 900 + k }));
}

// ---------------------------------------------------------------------------------------------
// The definitions, on hand-made event streams (spec 14.2).

type Contact = { x: number; y: number; slide?: boolean; tick?: number; ball?: number };

const base = { nx: 0, ny: -1, impact: 1 };

function peg(element: number, c: Contact & { first?: boolean }): SimEvent {
  return {
    type: 'pegContact',
    tick: c.tick ?? 0,
    ball: c.ball ?? 0,
    element,
    first: c.first ?? true,
    slide: c.slide ?? false,
    x: c.x,
    y: c.y,
    ...base,
  };
}

function wall(c: Contact): SimEvent {
  return {
    type: 'wallContact',
    side: 'left',
    tick: c.tick ?? 0,
    ball: c.ball ?? 0,
    slide: c.slide ?? false,
    x: c.x,
    y: c.y,
    ...base,
  };
}

function rim(c: Contact): SimEvent {
  return {
    type: 'bucketContact',
    part: 'rim',
    tick: c.tick ?? 0,
    ball: c.ball ?? 0,
    slide: c.slide ?? false,
    x: c.x,
    y: c.y,
    ...base,
  };
}

const spawn: SimEvent = {
  type: 'ballSpawned',
  tick: 0,
  ball: 0,
  x: 0,
  y: 0,
  vx: 0,
  vy: 4,
  cause: 'launch',
};
const catchAt = (x: number, y: number): SimEvent => ({
  type: 'bucketCatch',
  tick: 0,
  ball: 0,
  x,
  y,
});
const teleport: SimEvent = {
  type: 'teleport',
  tick: 0,
  ball: 0,
  element: 99,
  stage: 'exit',
  x: 0,
  y: 0,
};

/** Runs events through a tracker on the fixture board; returns the awards in order. */
function track(
  events: readonly SimEvent[],
  colored: (id: number) => boolean = () => true,
  balls: (i: number) => readonly BallView[] = () => [],
): StyleShotId[] {
  const t = new StyleTracker(W, H);
  t.startShot();
  const out: StyleShotId[] = [];
  const sink = {
    awardStyle: (shot: StyleShotId): void => {
      out.push(shot);
    },
  };
  t.handle(spawn, colored, sink);
  events.forEach((e, i) => {
    t.handle(e, colored, sink);
    t.sample(balls(i));
  });
  return out;
}

const ball = (y: number): BallView[] => [
  {
    id: 0,
    x: 100,
    y,
    vx: 0,
    vy: 0,
    radius: 6,
    passThroughScoring: false,
    topReturns: 0,
    hiddenTicks: 0,
    age: 0,
    stuckTicks: 0,
  },
];

describe('style shot definitions', () => {
  const long = W / 3;
  const superLong = (2 * W) / 3;

  it('Long Shot: two non-blue pegs at least a third of the board width apart', () => {
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, { x: long, y: 0 })])).toEqual(['longShot']);
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, { x: long - 0.01, y: 0 })])).toEqual([]);
    // Straight-line distance in any direction.
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, { x: 0.6 * long, y: 0.8 * long })])).toEqual([
      'longShot',
    ]);
  });

  it('Super Long Shot replaces Long Shot from two thirds of the width', () => {
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, { x: superLong, y: 0 })])).toEqual([
      'superLongShot',
    ]);
  });

  it('needs both pegs non-blue and the second lit by that contact', () => {
    const blue1 = (id: number): boolean => id !== 1;
    const blue2 = (id: number): boolean => id !== 2;
    const far = { x: long + 10, y: 0 };
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, far)], blue1)).toEqual([]);
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, far)], blue2)).toEqual([]);
    expect(track([peg(1, { x: 0, y: 0 }), peg(2, { ...far, first: false })])).toEqual([]);
  });

  it('is broken by a contact with another peg, a teleport or a Spooky return, not by walls', () => {
    const a = peg(1, { x: 0, y: 0 });
    const b = peg(2, { x: long + 10, y: 0 });
    expect(track([a, peg(3, { x: 50, y: 0 }), b])).toEqual([]);
    expect(track([a, teleport, b])).toEqual([]);
    expect(track([a, { type: 'ballReturned', tick: 0, ball: 0, x: 0, y: 0 }, b])).toEqual([]);
    expect(track([a, wall({ x: 20, y: 0 }), b])).toEqual(['longShot']);
    // Touching the first peg again moves the start to the new contact point.
    expect(track([a, peg(1, { x: 20, y: 0, first: false }), b])).toEqual([]);
    expect(track([a, peg(1, { x: -20, y: 0, first: false }), b])).toEqual(['longShot']);
  });

  it('Double Long Shot: a long hop that starts where a long hop ended', () => {
    const a = peg(1, { x: 0, y: 0 });
    const b = peg(2, { x: long + 1, y: 0 });
    const c = peg(3, { x: 2 * long + 2, y: 0 });
    expect(track([a, b, c])).toEqual(['longShot', 'longShot', 'doubleLongShot']);
    // A short hop in between ends the chain.
    const short = peg(4, { x: long + 50, y: 0 });
    expect(track([a, b, short, peg(3, { x: 2 * long + 60, y: 0 })])).toEqual([
      'longShot',
      'longShot',
    ]);
  });

  it('Bucket Bounce: exactly one peg, then straight into the bucket', () => {
    const p = peg(1, { x: 100, y: 400 });
    const again = peg(1, { x: 101, y: 401, first: false });
    expect(track([p, again, catchAt(100, 556)])).toEqual(['bucketBounce']);
    expect(track([p, peg(2, { x: 120, y: 420 }), catchAt(100, 556)])).toEqual([]);
    expect(track([p, rim({ x: 100, y: 540 }), catchAt(100, 556)])).toEqual([]);
    expect(track([catchAt(100, 556)])).toEqual([]);
  });

  it('Lucky Bounce: rises a quarter of the board height after a bucket contact, then lands in it', () => {
    const rise = H / 4;
    const events = [rim({ x: 100, y: 540 }), wall({ x: 0, y: 500 }), catchAt(100, 556)];
    const highest = (top: number) => (i: number) => ball(i === 1 ? top : 540);
    expect(track(events, () => true, highest(540 - rise))).toEqual(['luckyBounce']);
    expect(track(events, () => true, highest(540 - rise + 0.5))).toEqual([]);
    // The rise is measured from the bucket contact, not from where the ball came back in.
    const spooky = [rim({ x: 100, y: 540 }), { ...teleport }, catchAt(100, 556)];
    expect(track(spooky, () => true, highest(20))).toEqual([]);
  });

  it('Long Slide: 12 different pegs in one run of slide contacts', () => {
    const run = (ids: number[], gap = 5): SimEvent[] =>
      ids.map((id, i) => peg(id, { x: id, y: 0, slide: true, tick: i * gap }));
    const twelve = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(track(run(twelve))).toEqual(['longSlide']);
    expect(track(run(twelve.slice(0, 11)))).toEqual([]);
    // Repeats do not count; a gap of more than 25 ticks or a bounce ends the run.
    expect(track(run([1, 2, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]))).toEqual([]);
    expect(track(run(twelve, 26))).toEqual([]);
    expect(track(run(twelve, 25))).toEqual(['longSlide']);
    const broken = run(twelve);
    broken.splice(6, 0, wall({ x: 0, y: 0, tick: 31 }));
    expect(track(broken)).toEqual([]);
    // Once per shot.
    expect(track(run([...twelve, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24]))).toEqual([
      'longSlide',
    ]);
  });

  it('flags a peg lit right after a bucket contact (Bucket Kick)', () => {
    const t = new StyleTracker(W, H);
    const sink = { awardStyle: (): void => undefined };
    const all = (): boolean => true;
    t.handle(spawn, all, sink);
    t.handle(rim({ x: 100, y: 540 }), all, sink);
    t.handle(wall({ x: 0, y: 400 }), all, sink);
    t.handle(peg(1, { x: 50, y: 300 }), all, sink);
    expect(t.litFromBucket(0)).toBe(true);
    t.handle(peg(2, { x: 50, y: 300 }), all, sink);
    expect(t.litFromBucket(0)).toBe(false);
  });
});

// ---------------------------------------------------------------------------------------------
// The same style shots from real shots on fixture levels.

function contactPoint(events: readonly SimEvent[], element: number): { x: number; y: number } {
  const e = events.find((c) => c.type === 'pegContact' && c.element === element);
  if (e === undefined || e.type !== 'pegContact') throw new Error(`no contact with ${element}`);
  return { x: e.x, y: e.y };
}

describe('style shots in play', () => {
  it('awards Long Shot, Super Long Shot and Double Long Shot by the measured distance', () => {
    const cases: [number[], string[]][] = [
      [[80], []],
      [[105], ['longShot']],
      [[175], ['superLongShot']],
      [
        [105, 195],
        ['longShot', 'longShot', 'doubleLongShot'],
      ],
    ];
    // 25 orange pegs, all but the lit ones out of reach, so no Orange Rush joins in.
    for (const [ticks, expected] of cases) {
      const elements = grazeChain([ROD, FIRST, ...spares(24 - ticks.length)], ticks);
      const level = dropLevel(RAMP_START, elements);
      const events = shoot(newAttempt(level, fixedColors(25)), DOWN);
      expect(styles(events)).toEqual(expected);
      // Cross-check the distance of the first hop against the definition.
      const { events: sim } = shotPath(level, DOWN);
      const a = contactPoint(sim, 1);
      const b = contactPoint(sim, 10);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      expect(d >= W / 3).toBe(expected.length > 0);
      expect(d >= (2 * W) / 3).toBe(expected[0] === 'superLongShot');
      // Style points are not shot score: no threshold free ball.
      expect(ofType(events, 'freeBall').filter((e) => e.reason === 'threshold')).toEqual([]);
    }
  });

  it('gives no Long Shot when a blue peg is touched in between or an end is blue', () => {
    const between = grazeChain([ROD, FIRST, SPARE], [60, 105], (k) => k === 1);
    expect(styles(shoot(newAttempt(dropLevel(RAMP_START, between), fixedColors(3)), DOWN))).toEqual(
      [],
    );
    const blueEnd = grazeChain([ROD, FIRST, SPARE], [105], () => false);
    expect(styles(shoot(newAttempt(dropLevel(RAMP_START, blueEnd), fixedColors(2)), DOWN))).toEqual(
      [],
    );
  });

  it('awards Bucket Bounce for one peg straight into the bucket, not after a rim touch', () => {
    const level = (dx: number): ReturnType<typeof dropLevel> =>
      dropLevel({ x: 66 + dx, y: 380 }, [
        { kind: 'peg', id: 1, x: 66, y: 470, canBeOrange: false },
        SPARE,
      ]);
    // Launch ticks found by a search over drop points: the bucket rests at its left end.
    const clean = shoot(newAttempt(level(3), fixedColors(1)), DOWN, 220);
    expect(ofType(clean, 'freeBall').map((e) => e.reason)).toEqual(['bucket']);
    expect(styles(clean)).toEqual(['bucketBounce']);
    const rimTouch = shoot(newAttempt(level(-9), fixedColors(1)), DOWN, 230);
    expect(ofType(rimTouch, 'freeBall').map((e) => e.reason)).toEqual(['bucket']);
    expect(styles(rimTouch)).toEqual([]);
  });

  it('awards Lucky Bounce for a high bounce off the bucket that lands in it', () => {
    // Found by a search over drop points and launch ticks: the ball bounces off the left rim,
    // rises about 200 px and comes down into the moving bucket.
    const level = dropLevel({ x: 126, y: 120 }, [SPARE]);
    const events = shoot(newAttempt(level, fixedColors(1)), DOWN, 152);
    expect(ofType(events, 'freeBall').map((e) => e.reason)).toEqual(['bucket']);
    expect(styles(events)).toEqual(['luckyBounce']);
  });

  it('awards Bucket Kick when the last orange is hit right after a bucket bounce', () => {
    const wait = 152;
    const fixed: LevelElementInput[] = [];
    const { points, events } = shotPath(dropLevel({ x: 126, y: 120 }, fixed), DOWN, wait);
    const bounce = events.find((e) => e.type === 'bucketContact');
    if (bounce === undefined) throw new Error('the drop no longer touches the bucket');
    const at = beside(pointAt(points, bounce.tick + 25), 15.5, 1);
    const kick = dropLevel({ x: 126, y: 120 }, [{ kind: 'peg', id: 1, x: at.x, y: at.y }]);
    const out = shoot(newAttempt(kick, fixedColors(1)), DOWN, wait);
    expect(styles(out)).toEqual(['bucketKick']);
    expect(ofType(out, 'fever')).toHaveLength(1);

    // The same last orange hit from above gets nothing.
    const plain = dropLevel({ x: 300, y: 200 }, [{ kind: 'peg', id: 1, x: 304, y: 300 }]);
    expect(styles(shoot(newAttempt(plain, fixedColors(1)), DOWN))).toEqual([]);
  });

  it('awards Long Slide for sliding through 12 bricks of a bowl, not 11', () => {
    const bowl = (count: number): LevelElementInput[] => {
      const out: LevelElementInput[] = [SPARE];
      for (let i = 0; i < count; i++) {
        const a = PI + ((i + 0.5) * PI) / 16;
        out.push({
          kind: 'curvedBrick',
          id: 1 + i,
          x: 300 + cos(a) * 110,
          y: 300 - sin(a) * 110,
          rotation: a,
          innerRadius: 100,
          sector: PI / 16,
          canBeOrange: false,
        });
      }
      return out;
    };
    // The ball lands on the second brick and slides through every brick after it.
    const slide = (count: number): ReturnType<typeof shoot> =>
      shoot(newAttempt(dropLevel({ x: 208, y: 280 }, bowl(count)), fixedColors(1)), DOWN);
    const full = slide(13);
    expect(ofType(full, 'pegScored')).toHaveLength(12);
    expect(styles(full)).toEqual(['longSlide']);
    const short = slide(12);
    expect(ofType(short, 'pegScored')).toHaveLength(11);
    expect(styles(short)).toEqual([]);
  });

  it('awards Orange Rush when one shot reaches the target for the oranges left', () => {
    // 5 orange pegs: peg 1, three grazed oranges and one spare out of reach.
    const four = grazeChain([ROD, FIRST, ...spares(1)], [60, 105, 175]);
    const rush = shoot(newAttempt(dropLevel(RAMP_START, four), fixedColors(5)), DOWN);
    expect(ofType(rush, 'pegScored').map((e) => e.color)).toEqual([
      'orange',
      'orange',
      'orange',
      'orange',
    ]);
    // 5 orange pegs in all: the 25-orange table's target scales from 10 down to 2.
    expect(orangeRushTarget(5, 5)).toBe(2);
    expect(styles(rush)).toContain('orangeRush');
    const one = grazeChain([ROD, FIRST, ...spares(4)], [105, 175], () => false);
    const fewer = shoot(newAttempt(dropLevel(RAMP_START, one), fixedColors(5)), DOWN);
    expect(ofType(fewer, 'pegScored').map((e) => e.color)).toEqual(['orange', 'blue', 'blue']);
    expect(styles(fewer)).not.toContain('orangeRush');
  });

  it('awards Clean Finish for a peg, the last orange, then the last peg on the board', () => {
    // Peg 1 (blue), 10 (the only orange), 11 (blue), and nothing else.
    const blueFirst = { ...FIRST, canBeOrange: false };
    const chain = grazeChain([ROD, blueFirst], [105, 175], (k) => k === 0);
    const events = shoot(newAttempt(dropLevel(RAMP_START, chain), fixedColors(1)), DOWN);
    expect(ofType(events, 'pegScored').map((e) => e.color)).toEqual(['blue', 'orange', 'blue']);
    expect(styles(events)).toContain('cleanFinish');
    // With the last orange first there is no Clean Finish.
    const early = grazeChain([ROD, FIRST], [105], () => false);
    const earlyEvents = shoot(newAttempt(dropLevel(RAMP_START, early), fixedColors(1)), DOWN);
    expect(ofType(earlyEvents, 'pegScored').map((e) => e.color)).toEqual(['orange', 'blue']);
    expect(styles(earlyEvents)).not.toContain('cleanFinish');
  });

  it('awards Double Power for both green pegs in one shot', () => {
    // Only the two grazed pegs are not flagged, so they are the greens.
    const greens = grazeChain([ROD, FIRST, SPARE], [105, 175], () => false);
    const config = attemptConfig({ orangeCount: 2, purple: false });
    const events = shoot(newAttempt(dropLevel(RAMP_START, greens), config), DOWN);
    expect(ofType(events, 'pegScored').map((e) => e.color)).toEqual(['orange', 'green', 'green']);
    expect(ofType(events, 'greenHit')).toHaveLength(2);
    expect(styles(events)).toContain('doublePower');
  });

  it('awards Bucket Streak at 5 shots in a row in the bucket and Big Bucket Streak at 10', () => {
    const level = dropLevel({ x: 66, y: 380 }, [SPARE]);
    const attempt = newAttempt(level, fixedColors(1, { balls: 3 }));
    const cycle = attempt.level.bucketCycle;
    const awarded: string[][] = [];
    for (let shot = 0; shot < 15; shot++) {
      const wait = (((200 - attempt.world.tick) % cycle) + cycle) % cycle;
      const events = shoot(attempt, DOWN, wait);
      expect(ofType(events, 'freeBall').map((e) => e.reason)).toEqual(['bucket']);
      awarded.push(styles(events));
    }
    expect(attempt.ballsLeft).toBe(3);
    const at = awarded.flatMap((s, i) => s.map((name) => `${i + 1}:${name}`));
    expect(at).toEqual(['5:bucketStreak', '10:bigBucketStreak', '15:bucketStreak']);
    // A miss breaks the streak.
    shoot(attempt, { x: 0.3, y: 1 }, (((600 - attempt.world.tick) % cycle) + cycle) % cycle);
    expect(attempt.bucketStreak).toBe(0);
  });
});
