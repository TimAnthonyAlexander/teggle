// Multiball (Gopher, spec 7): a second ball leaves the green peg toward the other half of the
// board ("from the green peg on the opposite side", research 4.10; the original's tip: hit the
// green peg on the left to send the Multiball right). It starts beside the peg on that side,
// moving out and slightly up. It is the same kind of ball as the one that lit the peg (a Fireball
// spawns a Fireball). Every green hit adds another ball.

import { BALL_RADIUS } from '../../sim/tuning';
import type { Power } from '../power';
import { MULTIBALL_GAP, MULTIBALL_SPEED_UP, MULTIBALL_SPEED_X } from '../tuning';
import { action, ballById, bodyReach } from './common';

export const MULTIBALL: Power = {
  id: 'multiball',
  name: 'Multiball',
  onGreen(ctx, green) {
    const world = ctx.world;
    const source = ballById(world, green.ball) ?? world.balls[0];
    const radius = source?.radius ?? BALL_RADIUS;
    const middle = world.level.width / 2;
    let side = green.x < middle ? 1 : green.x > middle ? -1 : 0;
    if (side === 0) side = source !== undefined && source.vx > 0 ? -1 : 1;
    const reach = bodyReach(world.element(green.element).def);
    const x = green.x + side * (reach + radius + MULTIBALL_GAP);
    const y = green.y;
    const id = world.spawnBall({
      x,
      y,
      vx: side * MULTIBALL_SPEED_X,
      vy: -MULTIBALL_SPEED_UP,
      radius,
      passThroughScoring: source?.passThroughScoring ?? false,
    });
    ctx.announce(action('multiball', x, y, { value: id }));
  },
};
