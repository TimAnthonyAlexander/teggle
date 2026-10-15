import { describe, expect, it } from 'vitest';
import type { LevelElementInput } from '../../level/schema';
import { aimDirection } from '../../sim/aim';
import { compileLevel } from '../../sim/compile';
import type { SimEvent } from '../../sim/events';
import { FIREBALL_RADIUS } from '../../sim/tuning';
import { plinkoLevel } from '../../../tests/fixtures/levels';
import {
  DOWN,
  dropLevel,
  FIRST,
  grazeChain,
  inShot,
  newAttempt,
  ofType,
  randomPlay,
  RAMP_START,
  ROD,
  shoot,
  SPARE,
  styles,
} from '../../../tests/fixtures/rules';
import type { Attempt } from '../attempt';
import { attemptConfig } from '../config';
import type { PowerAction, RulesEvent } from '../events';
import { BASE_AIM_GUIDE, type PowerContext } from '../power';
import { replayAttempt } from '../record';
import {
  BIG_BALL_RADIUS,
  FLIPPER_TRAVEL_INSET,
  GUIDE_AIM_TICKS,
  PYRAMID_TRAVEL_CUT,
  SPACE_BLAST_RADIUS,
} from '../tuning';
import { BASE_POWERS, LUCKY_SPIN_POWERS, MULTIBALL, POWER_IDS, type PowerId } from '.';

// The ramp of the rules tests: a ball dropped on the left lights orange peg 1, then green peg 10,
// then peg 11 in one shot (11 is blue, or green in the two-green levels). Peg 900 is an orange
// nothing touches; 902 a green out of reach.
const OTHER_GREEN: LevelElementInput = { ...SPARE, id: 902, canBeOrange: false };
const CHAIN = grazeChain([ROD, FIRST, SPARE, OTHER_GREEN], [105, 175], () => false);

function pegAt(id: number): { x: number; y: number } {
  const e = CHAIN.find((x) => x.id === id);
  if (e === undefined || e.kind !== 'peg') throw new Error(`no peg ${id}`);
  return { x: e.x, y: e.y };
}

const GREEN = pegAt(10);
const SECOND = pegAt(11);

/** A peg nothing touches (it only lights through powers), blue unless flagged. */
function ghost(id: number, x: number, y: number, canBeOrange = false): LevelElementInput {
  return { kind: 'peg', id, x, y, collision: false, canBeOrange };
}

function ramp(
  power: PowerId,
  options: {
    extra?: LevelElementInput[];
    greens?: [number, number];
    orange?: number;
    seed?: number;
  } = {},
): Attempt {
  const level = dropLevel(RAMP_START, [...CHAIN, ...(options.extra ?? [])], {
    seededGreens: options.greens ?? [10, 902],
  });
  const config = attemptConfig({
    orangeCount: options.orange ?? 2,
    purple: false,
    seededGreens: true,
    power,
  });
  return newAttempt(level, config, options.seed ?? 1, { powers: BASE_POWERS });
}

function effectChanges(events: readonly RulesEvent[]): string[] {
  return ofType(events, 'effect').map((e) => `${e.tag}:${e.change}:${e.shotsLeft}`);
}

/** Steps the shot in play until a rules event of `type` is queued; returns the events so far. */
function stepUntil(a: Attempt, type: RulesEvent['type']): RulesEvent[] {
  const events: RulesEvent[] = [];
  while (inShot(a)) {
    a.step();
    const now = a.takeEvents();
    events.push(...now);
    if (now.some((e) => e.type === type)) return events;
  }
  throw new Error(`the shot ended without a ${type} event`);
}

/** Plays the shot in play to its end; returns the rules events and copies of the sim events. */
function finish(a: Attempt): { events: RulesEvent[]; sim: SimEvent[] } {
  const events: RulesEvent[] = [];
  const sim: SimEvent[] = [];
  while (inShot(a)) {
    a.step();
    for (const e of a.world.events) sim.push({ ...e });
    events.push(...a.takeEvents());
  }
  return { events, sim };
}

function simOf<T extends SimEvent['type']>(
  events: readonly SimEvent[],
  type: T,
): Extract<SimEvent, { type: T }>[] {
  return events.filter((e): e is Extract<SimEvent, { type: T }> => e.type === type);
}

function powerLit(events: readonly RulesEvent[]): number[] {
  return ofType(events, 'pegScored')
    .filter((e) => e.cause === 'power')
    .map((e) => e.element);
}

describe('Guide', () => {
  it('lengthens the aim guide through the first bounce for the next 3 shots', () => {
    const a = ramp('guide');
    expect(a.aimGuide()).toEqual(BASE_AIM_GUIDE);
    const first = shoot(a, DOWN);
    expect(effectChanges(first)).toEqual(['guide:granted:3', 'guide:started:3']);
    const guide = { ticks: GUIDE_AIM_TICKS, throughFirstBounce: true };
    for (let shot = 0; shot < 3; shot++) {
      expect(a.aimGuide()).toEqual(guide);
      shoot(a, DOWN);
    }
    expect(a.aimGuide()).toEqual(BASE_AIM_GUIDE);
  });

  it('adds 3 shots for every further green hit', () => {
    const a = ramp('guide', { greens: [10, 11] });
    expect(effectChanges(shoot(a, DOWN))).toEqual([
      'guide:granted:3',
      'guide:extended:6',
      'guide:started:6',
    ]);
  });
});

describe('Multiball', () => {
  it('sends a second ball from the green peg toward the other half of the board', () => {
    const a = ramp('multiball');
    a.launch(DOWN);
    const events = stepUntil(a, 'greenHit');
    const [spawn] = ofType(events, 'powerAction');
    // Peg 10 sits left of the middle: the new ball leaves its right side, out and up.
    const x = GREEN.x + 10 + 6 + 1;
    expect(spawn).toMatchObject({ action: 'multiball', value: 1, x, y: GREEN.y });
    expect(a.world.balls.map((b) => [b.id, b.x, b.y, b.vx, b.vy])).toContainEqual([
      1,
      x,
      GREEN.y,
      3,
      -2,
    ]);
    const rest = finish(a);
    expect(simOf(rest.sim, 'ballOut').length + simOf(rest.sim, 'bucketCatch').length).toBe(2);
    expect(a.phase).toBe('aim');
  });

  it('adds a ball for every green hit', () => {
    const a = ramp('multiball');
    a.launch(DOWN);
    stepUntil(a, 'greenHit');
    // A second green hit, as the attempt reports one, at peg 11 right of the middle.
    const actions: PowerAction[] = [];
    const ctx = { world: a.world, attempt: a, announce: (x: PowerAction) => actions.push(x) };
    MULTIBALL.onGreen(ctx as unknown as PowerContext, {
      tick: a.world.tick,
      element: 11,
      ball: 0,
      cause: 'contact',
      x: SECOND.x,
      y: SECOND.y,
    });
    expect(actions.map((x) => x.value)).toEqual([2]);
    // That ball heads left.
    expect(a.world.balls.map((b) => [b.id, b.x, b.vx])).toEqual([
      [0, expect.any(Number), expect.any(Number)],
      [1, expect.any(Number), 3],
      [2, SECOND.x - 17, -3],
    ]);
    const { sim } = finish(a);
    expect(simOf(sim, 'ballOut').length + simOf(sim, 'bucketCatch').length).toBe(3);
  });
});

describe('Pyramid', () => {
  it('turns the bucket into the pyramid for 5 shots starting now and narrows its travel', () => {
    const a = ramp('pyramid');
    const base = a.world.level.bucketTravel;
    a.launch(DOWN);
    stepUntil(a, 'greenHit');
    expect(a.world.pyramid).toBe(true);
    finish(a);
    for (let t = 0; t < 2 * PYRAMID_TRAVEL_CUT + 2; t++) a.step();
    expect(a.world.bucketTravel).toBe(base - PYRAMID_TRAVEL_CUT);
    const ends: string[] = [];
    for (let shot = 1; shot < 5; shot++) {
      expect(a.world.pyramid).toBe(true);
      ends.push(...effectChanges(shoot(a, DOWN)));
    }
    expect(ends).toEqual(['pyramid:ended:0']);
    expect(a.world.pyramid).toBe(false);
    for (let t = 0; t < 2 * PYRAMID_TRAVEL_CUT + 2; t++) a.step();
    expect(a.world.bucketTravel).toBe(base);
  });

  it('adds 5 shots for every further green hit', () => {
    const a = ramp('pyramid', { greens: [10, 11] });
    expect(effectChanges(shoot(a, DOWN))).toEqual(['pyramid:granted:5', 'pyramid:extended:10']);
    expect(a.effects[0]?.shotsLeft).toBe(9);
  });
});

describe('Space Blast', () => {
  const g = GREEN;
  // Pegs around green peg 10 that the ball cannot touch: inside the radius 20, 21, 25, 22 by
  // distance; 23 and 24 just outside.
  const AROUND = [
    ghost(20, g.x + 30, g.y - 20),
    ghost(21, g.x - 50, g.y + 30),
    ghost(22, g.x, g.y - 79.5),
    ghost(23, g.x + 80.5, g.y),
    ghost(24, g.x - 60, g.y - 60),
    ghost(25, g.x + 20, g.y + 70),
  ];

  it('lights every peg within the radius of the green peg, nearest first', () => {
    expect(SPACE_BLAST_RADIUS).toBe(80);
    const a = ramp('spaceBlast', { extra: AROUND });
    const events = shoot(a, DOWN);
    expect(powerLit(events)).toEqual([20, 21, 25, 22]);
    expect(ofType(events, 'powerAction')).toEqual([
      expect.objectContaining({ action: 'spaceBlast', x: g.x, y: g.y, elements: [20, 21, 25, 22] }),
    ]);
    // Pegs a power lights score like any other.
    expect(ofType(events, 'shotTally')[0]?.count).toBe(3 + 4);
  });

  it('sets off a second blast when it lights the other green peg', () => {
    const other = ghost(903, g.x + 40, g.y + 40);
    const beyond = ghost(26, g.x + 100, g.y + 40);
    const a = ramp('spaceBlast', { extra: [...AROUND, other, beyond], greens: [10, 903] });
    const events = shoot(a, DOWN);
    expect(ofType(events, 'powerAction').map((e) => e.x)).toEqual([g.x, g.x + 40]);
    expect(powerLit(events)).toContain(26);
    expect(styles(events)).toContain('doublePower');
  });
});

describe('Flippers', () => {
  it('raises flippers for 3 shots starting now, clear of the bucket, swung by the button', () => {
    const a = ramp('flippers');
    const level = a.world.level;
    a.launch(DOWN);
    stepUntil(a, 'greenHit');
    expect(a.world.flippers).toBe(true);
    const flipper = level.flipperBodies[0] ?? -1;
    const rest = a.world.bodies[flipper]?.rotation;
    a.setFlipperInput(true);
    for (let t = 0; t < 20; t++) a.step();
    expect(a.world.bodies[flipper]?.rotation).not.toBe(rest);
    a.setFlipperInput(false);
    finish(a);
    const target = level.width / 2 - FLIPPER_TRAVEL_INSET;
    for (let t = 0; t < 2 * (level.bucketTravel - target) + 2; t++) a.step();
    expect(a.world.bucketTravel).toBe(target);
    shoot(a, DOWN);
    expect(effectChanges(shoot(a, DOWN))).toEqual(['flippers:ended:0']);
    expect(a.world.flippers).toBe(false);
    // The button presses are part of the record and replay to the same shots.
    const record = a.record();
    expect(record.shots[0]?.inputs.map((i) => i.flipper)).toEqual([true, false]);
    const replayed = replayAttempt(a.level, record, { powers: BASE_POWERS });
    expect(replayed.world.tick).toBe(a.world.tick);
    expect(replayed.score).toBe(a.score);
  });
});

describe('Spooky Ball', () => {
  it('brings the ball back in at the top once, with the bucket covered until then', () => {
    const a = ramp('spookyBall');
    a.launch(DOWN);
    stepUntil(a, 'greenHit');
    expect(a.world.balls[0]?.topReturns).toBe(1);
    expect(a.world.bucketCovered).toBe(true);
    let returnedAt = -1;
    while (inShot(a) && returnedAt < 0) {
      a.step();
      for (const e of a.world.events) if (e.type === 'ballReturned') returnedAt = e.tick;
    }
    expect(returnedAt).toBeGreaterThan(0);
    expect(a.world.balls[0]?.y).toBeLessThan(20);
    expect(a.world.bucketCovered).toBe(false);
    const rest = finish(a);
    expect(simOf(rest.sim, 'ballReturned')).toHaveLength(0);
    expect(effectChanges(rest.events)).toEqual(['spookyBall:ended:0']);
  });

  it('gives one more return for every green hit', () => {
    const a = ramp('spookyBall', { greens: [10, 11] });
    a.launch(DOWN);
    const { events, sim } = finish(a);
    expect(ofType(events, 'powerAction')).toHaveLength(2);
    expect(simOf(sim, 'ballReturned')).toHaveLength(2);
    expect(effectChanges(events)).toEqual(['spookyBall:granted:1', 'spookyBall:ended:0']);
  });
});

describe('Flower Power', () => {
  // Ten oranges nothing touches, in a row up and to the right of green peg 10.
  const ROW = Array.from({ length: 10 }, (_, k) =>
    ghost(30 + k, GREEN.x + 30 + 40 * k, GREEN.y - 60, true),
  );

  /** Ids of the oranges in ROW and SPARE, nearest to `p` first, without `lit`. */
  function nearest(p: { x: number; y: number }, lit: readonly number[], n: number): number[] {
    const pegs = [...ROW, SPARE].flatMap((e) => (e.kind === 'peg' ? [e] : []));
    return pegs
      .filter((e) => !lit.includes(e.id))
      .map((e) => ({ id: e.id, d: Math.hypot(e.x - p.x, e.y - p.y) }))
      .sort((u, v) => u.d - v.d)
      .slice(0, n)
      .map((e) => e.id);
  }

  it('lights the nearest fifth of the orange pegs left, rounded up', () => {
    const a = ramp('flowerPower', { extra: ROW, orange: 12 });
    const events = shoot(a, DOWN);
    // Peg 1 is lit by the ball first: 11 orange left, so 3 light.
    expect(powerLit(events)).toEqual([30, 31, 32]);
    expect(ofType(events, 'powerAction')[0]?.elements).toEqual([30, 31, 32]);
  });

  it('lights another fifth of what is left for every green hit', () => {
    const a = ramp('flowerPower', { extra: ROW, orange: 12, greens: [10, 11] });
    const events = shoot(a, DOWN);
    // 11 left at the first green (3 light), 8 at the second (2 light).
    expect(powerLit(events)).toEqual([30, 31, 32, ...nearest(SECOND, [30, 31, 32], 2)]);
  });
});

describe('Lucky Spin', () => {
  it('spins four equal segments, and each outcome does its part', () => {
    const seen = new Map<string, number>();
    for (let seed = 1; seed <= 60; seed++) {
      const a = ramp('luckySpin', { seed });
      const before = a.ballsLeft;
      const events = shoot(a, DOWN);
      const spin = ofType(events, 'powerAction').find((e) => e.action === 'luckySpin');
      if (spin === undefined) throw new Error('no spin');
      const outcome = spin.value === 3 ? 'randomPower' : spin.detail;
      seen.set(outcome, (seen.get(outcome) ?? 0) + 1);
      const blue = ofType(events, 'pegScored').find((e) => e.element === 11);
      switch (outcome) {
        case 'tripleScore':
          // Peg 11 lights after the spin: 10 x 10 (one orange left), tripled.
          expect(blue?.value).toBe(300);
          expect(a.effects).toEqual([
            { power: 'luckySpin', tag: 'tripleScore', shotsLeft: 1, pending: false },
          ]);
          break;
        case 'bigBall': {
          expect(blue?.value).toBe(100);
          for (let shot = 0; shot < 3; shot++) {
            a.launch(DOWN);
            expect(a.world.balls[0]?.radius).toBe(shot < 2 ? BIG_BALL_RADIUS : 6);
            finish(a);
          }
          break;
        }
        case 'extraBall':
          expect(ofType(events, 'freeBall').map((e) => e.reason)).toContain('power');
          expect(a.ballsLeft).toBeGreaterThanOrEqual(before);
          break;
        default:
          expect(LUCKY_SPIN_POWERS).toContain(spin.detail);
          expect(spin.detail).not.toBe('luckySpin');
      }
    }
    expect([...seen.keys()].sort()).toEqual(['bigBall', 'extraBall', 'randomPower', 'tripleScore']);
    for (const n of seen.values()) expect(n).toBeGreaterThan(6);
  });
});

describe('Fireball', () => {
  it('covers the bucket and makes the next shot a bigger ball that burns through pegs', () => {
    const a = ramp('fireball');
    const first = shoot(a, DOWN);
    expect(effectChanges(first)).toEqual(['fireball:granted:1', 'fireball:started:1']);
    expect(a.world.bucketCovered).toBe(true);
    // A plain ball bounces off a peg; the Fireball keeps its speed through it.
    const level = dropLevel({ x: 300, y: 100 }, [{ kind: 'peg', id: 1, x: 300, y: 200 }]);
    const plain = newAttempt(level, attemptConfig({ orangeCount: 1, greens: false }), 1);
    plain.launch(DOWN);
    stepUntil(plain, 'pegScored');
    expect(plain.world.balls[0]?.vy).toBeLessThan(0);

    a.launch(DOWN);
    const ball = a.world.balls[0];
    expect(ball?.radius).toBe(FIREBALL_RADIUS);
    expect(ball?.passThroughScoring).toBe(true);
    const { events } = finish(a);
    expect(effectChanges(events)).toEqual(['fireball:ended:0']);
    expect(a.world.bucketCovered).toBe(false);
  });

  it('burns the dome away when it hits it', () => {
    const a = ramp('fireball');
    shoot(a, DOWN);
    a.launch(DOWN);
    const events = stepUntil(a, 'powerAction');
    expect(ofType(events, 'powerAction')[0]?.action).toBe('coverBurned');
    expect(a.world.bucketCovered).toBe(false);
  });

  it('adds a Fireball shot for every green hit', () => {
    const a = ramp('fireball', { greens: [10, 11] });
    expect(effectChanges(shoot(a, DOWN))).toEqual([
      'fireball:granted:1',
      'fireball:extended:2',
      'fireball:started:2',
    ]);
  });
});

describe('every power', () => {
  it('replays recorded attempts to the identical events and score', () => {
    const level = compileLevel(plinkoLevel());
    for (const power of POWER_IDS) {
      // The first seed whose random play lights a green peg.
      let live = newAttempt(level, attemptConfig({ power }), 30, { powers: BASE_POWERS });
      let events: RulesEvent[] = [];
      for (let seed = 30; seed < 60; seed++) {
        live = newAttempt(level, attemptConfig({ power }), seed, { powers: BASE_POWERS });
        events = randomPlay(live, seed, { flippers: power === 'flippers', maxShots: 10 });
        if (events.some((e) => e.type === 'greenHit')) break;
      }
      expect(ofType(events, 'greenHit').length, power).toBeGreaterThan(0);
      const replayed: RulesEvent[] = [];
      const again = replayAttempt(level, live.record(), {
        powers: BASE_POWERS,
        observe: (x) => {
          replayed.push(...x.takeEvents());
        },
      });
      expect(replayed, power).toEqual(events);
      expect(again.score).toBe(live.score);
      expect(again.record()).toEqual(live.record());
    }
  });

  it('continues identically from copies taken while powers run', () => {
    const level = compileLevel(plinkoLevel());
    for (const power of ['multiball', 'spookyBall', 'pyramid', 'luckySpin', 'fireball'] as const) {
      const a = newAttempt(level, attemptConfig({ power }), 7, { powers: BASE_POWERS });
      // Play until a green lights mid-shot, then copy the attempt right there.
      let copied: Attempt | null = null;
      for (let shot = 0; shot < 30 && copied === null && a.phase === 'aim'; shot++) {
        a.launch(aimDirection(-1.2 + 0.31 * shot));
        while (inShot(a)) {
          a.step();
          if (a.takeEvents().some((e) => e.type === 'greenHit')) {
            copied = a.clone();
            break;
          }
        }
        while (inShot(a)) a.step();
        a.takeEvents();
      }
      if (copied === null) throw new Error(`${power}: no green hit`);
      const reused = newAttempt(level, attemptConfig({ orangeCount: 30 }), 99, {
        powers: BASE_POWERS,
      });
      reused.copyFrom(copied);
      const b = copied.clone();
      const run = (x: Attempt): RulesEvent[] => {
        const out: RulesEvent[] = [];
        while (inShot(x)) {
          x.step();
          out.push(...x.takeEvents());
        }
        out.push(...randomPlay(x, 5, { maxShots: x.shotsTaken + 4 }));
        return out;
      };
      const original = run(copied);
      expect(run(b), power).toEqual(original);
      expect(run(reused), power).toEqual(original);
      expect(reused.record()).toEqual(copied.record());
    }
  });
});
