import { describe, expect, it } from 'vitest';
import { atan2 } from '../../core/dmath';
import { aimDirection } from '../../sim/aim';
import { compileLevel } from '../../sim/compile';
import { MAX_AIM_ANGLE } from '../../sim/tuning';
import { plinkoLevel } from '../../../tests/fixtures/levels';
import { inShot, newAttempt, ofType, randomPlay } from '../../../tests/fixtures/rules';
import type { Attempt } from '../attempt';
import { attemptConfig } from '../config';
import { replayAttempt } from '../record';
import { ZEN_STEP, ZEN_STEPS } from '../tuning';
import { BASE_POWERS, ZenSearch, zenSearchFor } from '.';

const LEVEL = compileLevel(plinkoLevel());

/** An attempt on the plinko board whose next shot is a Zen Ball shot. */
function zenReady(): Attempt {
  for (let seed = 1; seed < 40; seed++) {
    const a = newAttempt(LEVEL, attemptConfig({ power: 'zenBall' }), seed, { powers: BASE_POWERS });
    randomPlay(a, seed, { maxShots: 6 });
    for (let shot = 0; shot < 8 && a.phase === 'aim'; shot++) {
      if (a.effects.some((fx) => fx.tag === 'zenBall' && !fx.pending)) return a;
      randomPlay(a, seed + shot, { maxShots: a.shotsTaken + 1 });
    }
  }
  throw new Error('no seed gave a Zen Ball shot');
}

const AIM = aimDirection(0.37);

describe('Zen Ball', () => {
  it('replaces the shot with the best of the angles near it', () => {
    const a = zenReady();
    const search = new ZenSearch(a, AIM);
    expect(search.total).toBe(1 + 2 * ZEN_STEPS);
    const found = search.finish();
    expect(found.value).toBeGreaterThanOrEqual(found.baseline);
    const angle = atan2(found.direction.x, found.direction.y);
    expect(Math.abs(angle - 0.37)).toBeLessThanOrEqual(ZEN_STEPS * ZEN_STEP + 1e-9);

    // The shot found, played on a trial copy without the search, is what the Zen shot does.
    const plain = a.trialClone();
    a.takeEvents();
    a.launch(AIM);
    const [zen] = ofType(a.takeEvents(), 'powerAction');
    expect(zen).toMatchObject({
      action: 'zenShot',
      detail: found.better ? 'better' : 'kept',
      dx: found.direction.x,
      dy: found.direction.y,
    });
    plain.launch(found.direction);
    while (inShot(a)) a.step();
    while (inShot(plain)) plain.step();
    expect(a.score).toBe(plain.score);
    expect(a.world.tick).toBe(plain.world.tick);
    // The record keeps the player's direction.
    expect(a.record().shots.at(-1)?.direction).toEqual(AIM);
  });

  it('finds the same shot in slices, from the cache and in a replay', () => {
    const a = zenReady();
    const whole = new ZenSearch(a, AIM).finish();
    const sliced = new ZenSearch(a, AIM);
    let calls = 0;
    while (!sliced.run(97)) calls++;
    expect(calls).toBeGreaterThan(10);
    expect(sliced.finish()).toEqual(whole);

    const cached = zenSearchFor(a, AIM);
    expect(zenSearchFor(a, AIM)).toBe(cached);
    cached.run(1e9);
    const spent = cached.ticks;
    a.launch(AIM);
    // The launch used the finished search instead of running a new one.
    expect(cached.ticks).toBe(spent);
    expect(a.world.balls[0]?.vx).toBeCloseTo(4 * whole.direction.x, 12);
    while (inShot(a)) a.step();
    randomPlay(a, 3, { maxShots: a.shotsTaken + 5 });
    const replayed = replayAttempt(LEVEL, a.record(), { powers: BASE_POWERS });
    expect(replayed.score).toBe(a.score);
    expect(replayed.world.tick).toBe(a.world.tick);
  });

  it('tries half the angles at the cannon limit', () => {
    const a = zenReady();
    expect(new ZenSearch(a, aimDirection(MAX_AIM_ANGLE)).total).toBe(1 + ZEN_STEPS);
  });
});
