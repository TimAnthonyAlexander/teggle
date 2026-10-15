import { describe, expect, it } from 'vitest';
import { Rng } from '../../core/rng';
import type { Level, LevelElementInput } from '../../level/schema';
import { aimDirection } from '../../sim/aim';
import { compileLevel } from '../../sim/compile';
import type { SimEvent } from '../../sim/events';
import { BUCKET_CATCH_Y } from '../../sim/tuning';
import { benchLevel, mixedLevel, plinkoLevel } from '../../../tests/fixtures/levels';
import {
  DOWN,
  dropLevel,
  FIRST,
  grazeChain,
  inShot,
  newAttempt,
  ofType,
  RAMP_START,
  ROD,
  shoot,
  SPARE,
  styles,
} from '../../../tests/fixtures/rules';
import { Attempt } from '../attempt';
import { attemptConfig } from '../config';
import type { RulesEvent } from '../events';
import type { Power, PowerRegistry } from '../power';
import { POWER_STYLE_SHOTS, styleShotName, styleShotPoints } from '../style';
import { FLIPPER_RALLY_PEGS } from '../tuning';
import { BASE_POWERS, type PowerId } from '.';

// The master-specific style shots (spec 5; triggers in spec 14.2). Fever Multiball and Double
// Catch are set up on the ramp of the rules tests; the shots that need a bounce off a moving
// part (Pyramid Catch, Flipper Rally, Fireball Catch, Big Ball Catch) are checked against an
// independent reading of the simulation's events over many random attempts.

const OTHER_GREEN: LevelElementInput = { ...SPARE, id: 902, canBeOrange: false };
const CHAIN = grazeChain([ROD, FIRST, SPARE, OTHER_GREEN], [105, 175], () => false);
const S = POWER_STYLE_SHOTS;

/** The ramp without the unreachable orange: with one orange, peg 1 starts Fever. */
function feverRamp(power: string, greens: [number, number], powers: PowerRegistry): Attempt {
  const level = dropLevel(
    RAMP_START,
    CHAIN.filter((e) => e.id !== SPARE.id),
    { seededGreens: greens },
  );
  const config = attemptConfig({ orangeCount: 1, purple: false, seededGreens: true, power });
  return newAttempt(level, config, 1, { powers });
}

function ramp(power: string, powers: PowerRegistry): Attempt {
  const level = dropLevel(RAMP_START, CHAIN, { seededGreens: [10, 902] });
  const config = attemptConfig({ orangeCount: 2, purple: false, seededGreens: true, power });
  return newAttempt(level, config, 1, { powers });
}

function count(events: readonly RulesEvent[], shot: string): number {
  return styles(events).filter((s) => s === shot).length;
}

describe('Fever Multiball', () => {
  it('scores when a Multiball starts during Fever', () => {
    const events = shoot(feverRamp('multiball', [10, 902], BASE_POWERS), DOWN);
    expect(ofType(events, 'fever')).toHaveLength(1);
    expect(count(events, S.feverMultiball.shot)).toBe(1);
    const spawn = ofType(events, 'powerAction')[0];
    const style = ofType(events, 'styleShot').find((e) => e.shot === S.feverMultiball.shot);
    expect(style).toMatchObject({ points: 25000, x: spawn?.x, y: spawn?.y });
  });

  it('does not score before Fever', () => {
    const events = shoot(ramp('multiball', BASE_POWERS), DOWN);
    expect(ofType(events, 'powerAction')).toHaveLength(1);
    expect(count(events, S.feverMultiball.shot)).toBe(0);
  });
});

describe('Double Catch', () => {
  /** A test power that drops `n` balls straight into the bucket from just above it. */
  function drops(n: number): PowerRegistry {
    const p: Power = {
      id: 'drops',
      name: 'Drops',
      onGreen(ctx) {
        const w = ctx.world;
        for (let k = 0; k < n; k++) {
          const x = w.bucketX + (k - (n - 1) / 2) * 16;
          w.spawnBall({ x, y: w.level.height + BUCKET_CATCH_Y - 18, vx: 0, vy: 1 });
        }
      },
    };
    return new Map([[p.id, p]]);
  }

  it('scores when a second ball of the shot lands in the bucket, once per shot', () => {
    for (const n of [2, 3]) {
      const events = shoot(ramp('drops', drops(n)), DOWN);
      const caught = ofType(events, 'freeBall').filter((e) => e.reason === 'bucket');
      expect(caught.length).toBeGreaterThanOrEqual(n);
      expect(count(events, 'doubleCatch')).toBe(1);
      expect(ofType(events, 'styleShot').find((e) => e.shot === 'doubleCatch')?.points).toBe(
        100000,
      );
    }
    expect(count(shoot(ramp('drops', drops(1)), DOWN), 'doubleCatch')).toBe(0);
  });
});

describe('master-specific style shots', () => {
  it('score at most once per shot, at their points', () => {
    const p: Power = {
      id: 'eager',
      name: 'Eager',
      onGreen(ctx, green) {
        ctx.style('power:eager:trick', 10000, green.x, green.y);
        ctx.style('power:eager:trick', 10000, green.x, green.y);
      },
      event(ctx, _fx, e) {
        if (e.type === 'pegLit') ctx.style('power:eager:trick', 10000, e.x, e.y);
      },
    };
    const level = dropLevel(RAMP_START, CHAIN, { seededGreens: [10, 11] });
    const config = attemptConfig({
      orangeCount: 2,
      purple: false,
      seededGreens: true,
      power: 'eager',
    });
    const events = shoot(newAttempt(level, config, 1, { powers: new Map([[p.id, p]]) }), DOWN);
    // Two greens and two more lit pegs asked for it five times.
    expect(count(events, 'power:eager:trick')).toBe(1);
    const awarded = ofType(events, 'styleShot').reduce((sum, e) => sum + e.points, 0);
    expect(ofType(events, 'shotTally')[0]?.styleScore).toBe(awarded);
    expect(styles(events)).toContain('doublePower');
  });

  it('have Teggle names and the fan wiki points', () => {
    expect(Object.values(S).map((s) => [styleShotName(s.shot), styleShotPoints(s.shot)])).toEqual([
      ['Fever Multiball', 25000],
      ['Pyramid Catch', 10000],
      ['Flipper Rally', 25000],
      ['Fireball Catch', 25000],
      ['Big Ball Catch', 10000],
    ]);
    expect(styleShotName('doubleCatch')).toBe('Double Catch');
    expect(styleShotPoints('doubleCatch')).toBe(100000);
    expect(styleShotName('power:other:Odd Trick')).toBe('Odd Trick');
    expect(styleShotPoints('power:other:Odd Trick')).toBeNull();
  });
});

// ---------------------------------------------------------------------------------------------
// Random attempts against an independent reading of the simulation's events

interface ShotLog {
  /** The launched ball burns (a Fireball shot). */
  readonly fireball: boolean;
  /** Lucky Spin's Big Ball covers this shot. */
  readonly bigBall: boolean;
  readonly sim: SimEvent[];
  readonly rules: RulesEvent[];
}

/** Plays an attempt like randomPlay, logging each shot's simulation and rules events. */
function playLogged(level: Level, power: PowerId, seed: number, flippers: boolean): ShotLog[] {
  const a = new Attempt(
    compileLevel(level),
    { levelId: 'style', seed, config: attemptConfig({ power }) },
    { powers: BASE_POWERS },
  );
  const rng = Rng.fromSeed(seed * 1000);
  const shots: ShotLog[] = [];
  const tick = (log: ShotLog | null): void => {
    if (flippers && rng.nextInt(6) === 0) a.setFlipperInput(rng.nextBool());
    a.step();
    if (log !== null) for (const e of a.world.events) log.sim.push({ ...e });
    const rules = a.takeEvents();
    if (log !== null) log.rules.push(...rules);
  };
  while (a.phase === 'aim' && a.shotsTaken < 40) {
    const wait = rng.nextInt(90);
    for (let t = 0; t < wait; t++) tick(null);
    a.launch(aimDirection((2 * rng.nextFloat() - 1) * 1.6));
    const log: ShotLog = {
      fireball: a.world.balls[0]?.passThroughScoring === true,
      bigBall: a.effects.some((fx) => fx.tag === 'bigBall' && !fx.pending),
      sim: a.world.events.map((e) => ({ ...e })),
      rules: a.takeEvents(),
    };
    while (inShot(a)) tick(log);
    shots.push(log);
  }
  return shots;
}

/** Per-ball facts read straight from the simulation's events, in order. */
class PathReading {
  private readonly pyramid = new Map<number, boolean>();
  private readonly flipped = new Map<number, boolean>();
  private readonly touched = new Map<number, boolean>();
  flipperPegs = 0;

  read(e: SimEvent): void {
    switch (e.type) {
      case 'ballSpawned':
        this.pyramid.set(e.ball, false);
        this.flipped.set(e.ball, false);
        this.touched.set(e.ball, false);
        break;
      case 'pegContact':
        this.pyramid.set(e.ball, false);
        this.touched.set(e.ball, true);
        break;
      case 'bucketContact':
        if (e.part === 'pyramid') this.pyramid.set(e.ball, true);
        break;
      case 'flipperContact':
        this.flipped.set(e.ball, true);
        break;
      case 'teleport':
      case 'ballReturned':
        this.pyramid.set(e.ball, false);
        break;
      case 'pegLit':
        if (e.ball >= 0 && this.flipped.get(e.ball) === true) this.flipperPegs++;
        break;
      default:
        break;
    }
  }

  pyramidSincePeg(ball: number): boolean {
    return this.pyramid.get(ball) === true;
  }

  touchedPeg(ball: number): boolean {
    return this.touched.get(ball) === true;
  }
}

/** Whether a shot earns each power shot, read from its simulation events alone. */
function expected(log: ShotLog): Record<string, boolean> {
  const path = new PathReading();
  const out = { pyramid: false, rally: false, fireball: false, bigBall: false };
  for (const e of log.sim) {
    path.read(e);
    if (e.type === 'bucketCatch') {
      if (path.pyramidSincePeg(e.ball)) out.pyramid = true;
      if (log.fireball) out.fireball = true;
      if (log.bigBall && path.touchedPeg(e.ball)) out.bigBall = true;
    }
  }
  out.rally = path.flipperPegs >= FLIPPER_RALLY_PEGS;
  return {
    [S.pyramidCatch.shot]: out.pyramid,
    [S.flipperRally.shot]: out.rally,
    [S.fireballCatch.shot]: out.fireball,
    [S.bigBallCatch.shot]: out.bigBall,
  };
}

describe('power style shots in random attempts', () => {
  const cases: [PowerId, () => Level, string][] = [
    ['pyramid', plinkoLevel, S.pyramidCatch.shot],
    ['flippers', benchLevel, S.flipperRally.shot],
    ['fireball', mixedLevel, S.fireballCatch.shot],
    ['luckySpin', benchLevel, S.bigBallCatch.shot],
  ];

  it.each(cases)('%s: match the definitions shot by shot', (power, level, shot) => {
    let awarded = 0;
    for (let seed = 1; seed <= 20; seed++) {
      for (const log of playLogged(level(), power, seed, power === 'flippers')) {
        const want = expected(log);
        for (const [id, earned] of Object.entries(want)) {
          expect(count(log.rules, id), `${power} seed ${seed} ${id}`).toBe(earned ? 1 : 0);
        }
        awarded += count(log.rules, shot);
      }
    }
    expect(awarded).toBeGreaterThan(0);
  });
});
