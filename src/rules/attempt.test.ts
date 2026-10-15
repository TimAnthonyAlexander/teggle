import { describe, expect, it } from 'vitest';
import { PI } from '../core/dmath';
import type { LevelElementInput } from '../level/schema';
import { compileLevel } from '../sim/compile';
import type { SimEvent } from '../sim/events';
import { FEVER_HOLE_X, ORIGINAL_BOARD_WIDTH } from '../sim/tuning';
import {
  beside,
  DOWN,
  dropLevel,
  FIRST,
  fixedColors,
  FIXTURE_WIDTH as W,
  grazeChain,
  newAttempt,
  ofType,
  pegGrid,
  pointAt,
  RAMP_START,
  ROD,
  shoot,
  shotPath,
  SPARE,
  styles,
} from '../../tests/fixtures/rules';
import { Attempt } from './attempt';
import { attemptConfig } from './config';
import type { RulesEvent } from './events';
import {
  DEFAULT_ORANGE_COUNT,
  FEVER_BUCKET_POINTS,
  SHOT_TICK_LIMIT,
  STUCK_KILL_TICKS,
  STUCK_REMOVE_TICKS,
  UNUSED_BALL_POINTS,
} from './tuning';

/** A level whose straight-down drop at (800, 500) touches nothing. */
const MISS = dropLevel({ x: 800, y: 500 }, [SPARE]);

describe('attempt setup and the shot lifecycle', () => {
  it('starts aiming with the configured balls and orange pegs', () => {
    const a = newAttempt(pegGrid(60), attemptConfig());
    expect(a.phase).toBe('aim');
    expect(a.result).toBeNull();
    expect(a.ballsLeft).toBe(10);
    expect(a.orangeLeft).toBe(DEFAULT_ORANGE_COUNT);
    expect(a.multiplier).toBe(1);
    expect(a.meterLevel).toBe(0);
    expect(a.score).toBe(0);
    expect(a.pegIds('orange')).toHaveLength(DEFAULT_ORANGE_COUNT);
    expect(a.pegIds('green')).toHaveLength(2);
    expect(a.pegIds('purple')).toEqual([a.purple]);
    expect(a.color(a.purple)).toBe('purple');
  });

  it('keeps the world moving while aiming, without rules events', () => {
    const level = dropLevel({ x: 800, y: 500 }, [
      { kind: 'peg', id: 1, x: 300, y: 300, movement: { type: 'circle', period: 400, radius: 40 } },
      SPARE,
    ]);
    const a = newAttempt(level, fixedColors(1));
    const x0 = a.world.element(1).x;
    for (let t = 0; t < 50; t++) a.step();
    expect(a.world.tick).toBe(50);
    expect(a.world.element(1).x).not.toBe(x0);
    expect(a.events).toEqual([]);
  });

  it('launches at the current tick, records the vector, and ends the shot when the ball is gone', () => {
    const a = newAttempt(MISS, fixedColors(1, { coinFlip: false }));
    for (let t = 0; t < 7; t++) a.step();
    a.launch({ x: 0, y: 2 });
    expect(a.phase).toBe('shot');
    expect(a.ballsLeft).toBe(9);
    expect(a.takeEvents()).toEqual([
      { type: 'shotStart', tick: 7, shot: 0, ballsLeft: 9, orangeLeft: 1 },
    ]);
    expect(() => {
      a.launch(DOWN);
    }).toThrow(/phase shot/);
    while (a.phase === 'shot') a.step();
    expect(a.phase).toBe('aim');
    expect(a.world.inShot).toBe(false);
    expect(ofType(a.takeEvents(), 'shotTally')).toEqual([
      expect.objectContaining({ shot: 0, sum: 0, count: 0, shotScore: 0, score: 0 }),
    ]);
    expect(a.record().shots).toEqual([{ tick: 7, direction: { x: 0, y: 2 }, inputs: [] }]);
    expect(() => {
      a.launch({ x: 0, y: 0 });
    }).toThrow(/non-zero/);
  });

  it('removes the lit pegs at shot end and adds the shot score to the total', () => {
    const chain = grazeChain([ROD, FIRST, SPARE], [105], () => false);
    const a = newAttempt(dropLevel(RAMP_START, chain), fixedColors(2));
    const events = shoot(a, DOWN);
    expect(a.world.isActive(1)).toBe(false);
    expect(a.world.isActive(10)).toBe(false);
    const tally = ofType(events, 'shotTally')[0];
    // Two orange pegs scale the meter's bounds to 2 left for x2 and 1 left for x10 (spec 14.2).
    // Peg 1 is orange with 2 left (x2), peg 10 blue with 1 left (x10): (200 + 100) x 2.
    expect(tally).toMatchObject({ sum: 300, count: 2, shotScore: 600, styleScore: 0 });
    expect(a.score).toBe(600);
  });
});

describe('scoring', () => {
  it('values each peg at the multiplier in force when it lights, also within one shot', () => {
    // 5 orange pegs: the meter's bounds scale to 3 left for x2, 2 for x5 and 1 for x10. Orange 1
    // and orange 10 score at x1, then the meter steps to x2 for blue peg 11.
    const spares: LevelElementInput[] = [900, 901, 902].map((id) => ({ ...SPARE, id }));
    const chain = grazeChain([ROD, FIRST, ...spares], [105, 175], (k) => k === 0);
    const a = newAttempt(dropLevel(RAMP_START, chain), fixedColors(5));
    const events = shoot(a, DOWN);
    const scored = ofType(events, 'pegScored');
    expect(scored.map((e) => [e.element, e.color, e.value, e.orangeLeft])).toEqual([
      [1, 'orange', 100, 4],
      [10, 'orange', 100, 3],
      [11, 'blue', 20, 3],
    ]);
    expect(scored.map((e) => e.shotScore)).toEqual([100, 400, 660]);
    const step = events.findIndex((e) => e.type === 'meterStep');
    expect(events[step]).toMatchObject({ multiplier: 2, orangeLeft: 3, meterLevel: 2 });
    expect(events.indexOf(scored[1] as RulesEvent)).toBeLessThan(step);
    expect(events.indexOf(scored[2] as RulesEvent)).toBeGreaterThan(step);
    expect(ofType(events, 'shotTally')[0]).toMatchObject({ sum: 220, count: 3, shotScore: 660 });
    expect(a.multiplier).toBe(2);
  });

  it('scores the purple peg and moves it to a different blue peg after every shot', () => {
    const level = dropLevel({ x: 800, y: 500 }, [
      SPARE,
      ...Array.from({ length: 12 }, (_, k): LevelElementInput => ({
        kind: 'peg',
        id: 100 + k,
        x: 60 + 40 * k,
        y: 300,
        canBeOrange: false,
      })),
    ]);
    const a = newAttempt(level, attemptConfig({ orangeCount: 1, greens: false, coinFlip: false }));
    let purple = a.purple;
    expect(a.color(purple)).toBe('purple');
    for (let shot = 0; shot < 5; shot++) {
      const moved = ofType(shoot(a, DOWN), 'purpleMoved');
      expect(moved).toEqual([expect.objectContaining({ from: purple, to: a.purple })]);
      expect(a.purple).not.toBe(purple);
      expect(a.color(purple)).toBe('blue');
      expect(a.color(a.purple)).toBe('purple');
      purple = a.purple;
    }
  });
});

describe('free balls', () => {
  it('flips a coin after a shot that hits nothing: about half return the ball', () => {
    const level = compileLevel(MISS);
    const trials = 2000;
    let wins = 0;
    for (let seed = 0; seed < trials; seed++) {
      const a = new Attempt(level, { levelId: 'miss', seed, config: fixedColors(1) });
      const events = shoot(a, DOWN);
      const flips = ofType(events, 'coinFlip');
      expect(flips).toHaveLength(1);
      const won = flips[0]?.won === true;
      if (won) wins++;
      // A win puts the ball back in the stock.
      expect(a.ballsLeft).toBe(won ? 10 : 9);
      expect(ofType(events, 'freeBall').map((e) => e.reason)).toEqual(won ? ['coinFlip'] : []);
    }
    expect(wins / trials).toBeGreaterThan(0.46);
    expect(wins / trials).toBeLessThan(0.54);
  });

  it('flips no coin when a peg was hit, the ball was caught, or the mode has no coin flip', () => {
    const hit = dropLevel({ x: 300, y: 200 }, [
      SPARE,
      { kind: 'peg', id: 1, x: 304, y: 300, canBeOrange: false },
    ]);
    expect(ofType(shoot(newAttempt(hit, fixedColors(1)), DOWN), 'coinFlip')).toEqual([]);
    const bucket = dropLevel({ x: 66, y: 380 }, [SPARE]);
    const caught = shoot(newAttempt(bucket, fixedColors(1)), DOWN, 200);
    expect(ofType(caught, 'freeBall').map((e) => e.reason)).toEqual(['bucket']);
    expect(ofType(caught, 'coinFlip')).toEqual([]);
    const off = newAttempt(MISS, fixedColors(1, { coinFlip: false }));
    expect(ofType(shoot(off, DOWN), 'coinFlip')).toEqual([]);
    expect(off.ballsLeft).toBe(9);
  });
});

describe('Fever', () => {
  const scale = W / ORIGINAL_BOARD_WIDTH;

  /** Drops a ball over Fever bucket `k` past the level's only orange peg, which it grazes. */
  function feverDrop(k: number, extra: LevelElementInput[] = []): ReturnType<typeof dropLevel> {
    const exit = { x: (FEVER_HOLE_X[k] ?? 0) * scale, y: 200 };
    const { points } = shotPath(dropLevel(exit, extra), DOWN);
    const at = beside(pointAt(points, 25), 15.8, k < 2 ? 1 : -1);
    return dropLevel(exit, [...extra, { kind: 'peg', id: 1, x: at.x, y: at.y }]);
  }

  /** An unflagged blue peg nothing can touch: the board can never be cleared. */
  const BLUE: LevelElementInput = {
    kind: 'peg',
    id: 901,
    x: 40,
    y: 40,
    collision: false,
    canBeOrange: false,
  };

  it('starts at the last orange, wins at once, and pays the bucket the ball lands in', () => {
    for (let k = 0; k < 5; k++) {
      const a = newAttempt(feverDrop(k, [BLUE]), fixedColors(1));
      a.launch(DOWN);
      let wonInPlay = false;
      const events: RulesEvent[] = [];
      while (a.phase === 'shot') {
        a.step();
        const batch = a.takeEvents();
        events.push(...batch);
        if (batch.some((e) => e.type === 'fever')) {
          expect(a.world.fever).toBe(true);
          wonInPlay = a.result === 'won' && a.world.ballsInPlay > 0;
        }
      }
      expect(wonInPlay).toBe(true);
      const bucket = ofType(events, 'feverBucket');
      expect(bucket).toEqual([
        expect.objectContaining({ bucket: k, points: FEVER_BUCKET_POINTS[k], fullClear: false }),
      ]);
      expect(ofType(events, 'unusedBalls')).toEqual([
        expect.objectContaining({ balls: 9, points: 9 * UNUSED_BALL_POINTS }),
      ]);
      // The last orange is worth 1,000 (x10); nothing else lit.
      const total = 1000 + (FEVER_BUCKET_POINTS[k] ?? 0) + 9 * UNUSED_BALL_POINTS;
      expect(ofType(events, 'levelWon')).toEqual([
        expect.objectContaining({
          score: total,
          fullClear: false,
          feverPoints: FEVER_BUCKET_POINTS[k],
        }),
      ]);
      expect(a.score).toBe(total);
      expect(a.phase).toBe('over');
      expect(() => {
        a.launch(DOWN);
      }).toThrow();
    }
  });

  it('pays 100,000 in every bucket on a full clear and marks it', () => {
    for (const k of [0, 2]) {
      const a = newAttempt(feverDrop(k), fixedColors(1));
      const events = shoot(a, DOWN);
      expect(ofType(events, 'feverBucket')).toEqual([
        expect.objectContaining({ bucket: k, points: 100000, fullClear: true }),
      ]);
      expect(ofType(events, 'levelWon')[0]?.fullClear).toBe(true);
      expect(a.fullClear).toBe(true);
    }
  });

  it('values pegs after the last orange at 1,000, purple at 10,000', () => {
    // Peg 1 is the only orange; pegs 10 and 11 are the purple and a blue peg, in some order.
    const chain = grazeChain([ROD, FIRST], [105, 175], () => false);
    const config = attemptConfig({ orangeCount: 1, greens: false });
    const events = shoot(newAttempt(dropLevel(RAMP_START, chain), config), DOWN);
    const scored = ofType(events, 'pegScored');
    expect(scored.map((e) => e.element)).toEqual([1, 10, 11]);
    expect(scored[0]?.value).toBe(1000);
    for (const e of scored.slice(1)) expect(e.value).toBe(e.color === 'purple' ? 10000 : 1000);
    expect(
      scored
        .slice(1)
        .map((e) => e.color)
        .sort(),
    ).toEqual(['blue', 'purple']);
  });

  it('wins even on the last ball, with no balls to convert', () => {
    const a = newAttempt(feverDrop(2, [BLUE]), fixedColors(1, { balls: 1 }));
    const events = shoot(a, DOWN);
    expect(a.result).toBe('won');
    expect(ofType(events, 'unusedBalls')[0]).toMatchObject({ balls: 0, points: 0 });
  });

  it('adds the campaign clear bonus by try', () => {
    const scores = [null, 1, 2, 3, 4].map((campaignTry) => {
      const a = newAttempt(feverDrop(2, [BLUE]), fixedColors(1, { campaignTry }));
      const events = shoot(a, DOWN);
      expect(ofType(events, 'clearBonus')).toHaveLength(campaignTry === null ? 0 : 1);
      return a.score;
    });
    const base = scores[0] ?? 0;
    expect(scores.map((s) => s - base)).toEqual([0, 100000, 50000, 25000, 0]);
  });

  it('tells how many ticks before the ball hits the last orange peg', () => {
    const a = newAttempt(feverDrop(2, [BLUE]), fixedColors(1));
    expect(a.ticksToLastOrange(100)).toBe(-1); // no shot running
    a.launch(DOWN);
    a.step();
    const ahead = a.ticksToLastOrange(200);
    expect(ahead).toBeGreaterThan(5);
    expect(a.ticksToLastOrange(ahead - 1)).toBe(-1);
    const start = a.world.tick;
    while (!a.takeEvents().some((e) => e.type === 'fever')) a.step();
    expect(a.world.tick - start).toBe(ahead);
    expect(a.ticksToLastOrange(200)).toBe(-1); // Fever is on

    // Two orange pegs left: no answer.
    const two = newAttempt(feverDrop(2, [{ ...SPARE, id: 902 }]), fixedColors(2));
    two.launch(DOWN);
    two.step();
    expect(two.ticksToLastOrange(200)).toBe(-1);
  });
});

describe('stuck ball', () => {
  function stuckEvents(elements: LevelElementInput[]): { rules: RulesEvent[]; sim: SimEvent[] } {
    const a = newAttempt(dropLevel({ x: 300, y: 200 }, [SPARE, ...elements]), fixedColors(1));
    a.launch(DOWN);
    const rules: RulesEvent[] = [];
    const sim: SimEvent[] = [];
    while (a.phase === 'shot') {
      a.step();
      rules.push(...a.takeEvents());
      for (const e of a.world.events) sim.push({ ...e });
    }
    return { rules, sim };
  }

  it('removes the lit peg the ball rests on once the stuck counter reaches 500', () => {
    // The drop falls straight onto the top of a peg, bounces in place and comes to rest on it.
    const pegs: LevelElementInput[] = [{ kind: 'peg', id: 1, x: 300, y: 320, canBeOrange: false }];
    const { rules, sim } = stuckEvents(pegs);
    const stuck = ofType(rules, 'stuck');
    expect(stuck).toEqual([expect.objectContaining({ ball: 0, element: 1 })]);
    expect(sim).toContainEqual(
      expect.objectContaining({ type: 'pegRemoved', element: 1, reason: 'stuck' }),
    );
    expect((stuck[0]?.tick ?? 0) - (ofType(rules, 'pegScored')[0]?.tick ?? 0)).toBeGreaterThan(
      STUCK_REMOVE_TICKS,
    );
    // The removed peg was lit and still scores; the ball falls on and the shot ends.
    expect(ofType(rules, 'shotTally')[0]).toMatchObject({ count: 1 });
  });

  it('picks the lit peg the ball touches, not another lit peg', () => {
    // A tray: a flat brick between two walls. Peg 2 is grazed on the way down, then the ball
    // bounces around in the tray until it lies still on the brick.
    const tray: LevelElementInput[] = [
      { kind: 'brick', id: 1, x: 300, y: 340, rotation: PI / 2, length: 80, canBeOrange: false },
      { kind: 'rod', id: 5, x: 258, y: 250, a: { x: 0, y: -90 }, b: { x: 0, y: 90 } },
      { kind: 'rod', id: 6, x: 342, y: 250, a: { x: 0, y: -90 }, b: { x: 0, y: 90 } },
    ];
    const { points } = shotPath(dropLevel({ x: 300, y: 200 }, [SPARE, ...tray]), DOWN);
    const at = beside(pointAt(points, 15), 15.8, 1);
    const { rules } = stuckEvents([
      ...tray,
      { kind: 'peg', id: 2, x: at.x, y: at.y, canBeOrange: false },
    ]);
    expect(ofType(rules, 'pegScored').map((e) => e.element)).toEqual([2, 1]);
    expect(ofType(rules, 'stuck')).toEqual([expect.objectContaining({ element: 1 })]);
  });

  it('takes the ball out of play at 1500 when it rests on no lit peg', () => {
    const solids: LevelElementInput[] = [{ kind: 'circle', id: 1, x: 300, y: 320, radius: 10 }];
    const { rules, sim } = stuckEvents(solids);
    const stuck = ofType(rules, 'stuck');
    expect(stuck).toEqual([expect.objectContaining({ ball: 0, element: -1 })]);
    const firstContact = sim.find((e) => e.type === 'solidContact')?.tick ?? 0;
    expect((stuck[0]?.tick ?? 0) - firstContact).toBeGreaterThanOrEqual(STUCK_KILL_TICKS);
    expect(sim).toContainEqual(expect.objectContaining({ type: 'ballOut', reason: 'removed' }));
    expect(ofType(rules, 'coinFlip')).toHaveLength(1);
  });

  it('ends a shot that never stalls after the shot tick limit', () => {
    // A perfectly elastic bumper right under the drop: the ball bounces on it forever.
    const bumper: LevelElementInput = {
      kind: 'circle',
      id: 1,
      x: 300,
      y: 420,
      radius: 20,
      bouncy: 1,
    };
    const a = newAttempt(dropLevel({ x: 300, y: 200 }, [SPARE, bumper]), fixedColors(1));
    a.launch(DOWN);
    const start = a.world.tick;
    while (a.phase === 'shot') a.step();
    expect(a.world.tick - start).toBe(SHOT_TICK_LIMIT);
    expect(ofType(a.takeEvents(), 'stuck')).toEqual([]);
  });
});

describe('losing', () => {
  it('ends the attempt when the balls run out with orange pegs left', () => {
    const a = newAttempt(MISS, fixedColors(1, { balls: 2, coinFlip: false }));
    expect(ofType(shoot(a, DOWN), 'levelLost')).toEqual([]);
    const events = shoot(a, DOWN);
    expect(ofType(events, 'levelLost')).toEqual([
      expect.objectContaining({ score: 0, orangeLeft: 1, shots: 2 }),
    ]);
    expect(a.phase).toBe('over');
    expect(a.result).toBe('lost');
    expect(() => {
      a.launch(DOWN);
    }).toThrow(/phase over/);
    // The world may keep moving behind the end screen; nothing more happens in the rules.
    a.step();
    expect(a.takeEvents()).toEqual([]);
  });

  it('keeps going while free balls refill the stock', () => {
    const level = dropLevel({ x: 66, y: 380 }, [SPARE]);
    const a = newAttempt(level, fixedColors(1, { balls: 1 }));
    shoot(a, DOWN, 200);
    expect(a.phase).toBe('aim');
    expect(a.ballsLeft).toBe(1);
    expect(styles(a.takeEvents())).toEqual([]);
  });
});
