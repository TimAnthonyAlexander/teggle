// Lucky Spin (Rabbit, spec 7): a wheel of four equal segments picks Big Ball, Triple Score, an
// extra ball or a random other power (research 4.10 lists the four; the original's wheel art has
// four equal segments, and fans report a 25% chance of Triple Score). Triple Score triples every
// peg lit for the rest of this shot and the next; Big Ball makes the next two shots' balls bigger;
// the random segment runs one of the nine other powers for this green hit, each equally likely.
// A green hit while an outcome runs spins again; the same outcome adds two more shots.

import type { LuckySpinOutcome } from '../events';
import type { Power } from '../power';
import { BIG_BALL_RADIUS, LUCKY_SPIN_SHOTS, TRIPLE_SCORE_FACTOR } from '../tuning';
import { action } from './common';
import type { PowerId } from './ids';

/** Wheel segments in order. */
export const LUCKY_SPIN_OUTCOMES: readonly LuckySpinOutcome[] = [
  'bigBall',
  'tripleScore',
  'extraBall',
  'randomPower',
];

/** The powers the random segment draws from: every base power but this one. */
export const LUCKY_SPIN_POWERS: readonly PowerId[] = [
  'guide',
  'multiball',
  'pyramid',
  'spaceBlast',
  'flippers',
  'spookyBall',
  'flowerPower',
  'fireball',
  'zenBall',
];

export const LUCKY_SPIN: Power = {
  id: 'luckySpin',
  name: 'Lucky Spin',
  onGreen(ctx, green) {
    const segment = ctx.rng.nextInt(LUCKY_SPIN_OUTCOMES.length);
    const outcome = LUCKY_SPIN_OUTCOMES[segment] ?? 'extraBall';
    if (outcome === 'randomPower') {
      const power = LUCKY_SPIN_POWERS[ctx.rng.nextInt(LUCKY_SPIN_POWERS.length)] ?? 'multiball';
      ctx.announce(action('luckySpin', green.x, green.y, { value: segment, detail: power }));
      ctx.trigger(power, green);
      return;
    }
    ctx.announce(action('luckySpin', green.x, green.y, { value: segment, detail: outcome }));
    switch (outcome) {
      case 'bigBall':
        ctx.grant('bigBall', LUCKY_SPIN_SHOTS, 'next');
        break;
      case 'tripleScore':
        ctx.grant('tripleScore', LUCKY_SPIN_SHOTS, 'now');
        break;
      case 'extraBall':
        ctx.freeBall();
        break;
    }
  },
  launch(_ctx, fx, plan) {
    // With a Fireball as well, the bigger of the two radii wins.
    if (fx.tag === 'bigBall') {
      plan.options.radius = Math.max(plan.options.radius ?? 0, BIG_BALL_RADIUS);
    }
  },
  pegValue(fx, value) {
    return fx.tag === 'tripleScore' ? value * TRIPLE_SCORE_FACTOR : value;
  },
};
