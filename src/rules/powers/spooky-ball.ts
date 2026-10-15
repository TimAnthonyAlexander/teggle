// Spooky Ball (Pumpkin, spec 7): this shot, the ball that lit the green peg comes back in at the
// top once after falling out of the bottom, at the same x with its speed kept (the physics
// decision in spec 14.2). Until it is back the bucket is covered, so it cannot land there first;
// the cover goes once it reappears ("bucket cap removed after it reappears", research 4.10).
// Every green hit adds one more return; a green lit by a power gives one to every ball in play.

import type { Power } from '../power';
import { action, ballById, hasActiveEffect, spookyReturnPending } from './common';

export const SPOOKY_BALL: Power = {
  id: 'spookyBall',
  name: 'Spooky Ball',
  onGreen(ctx, green) {
    if (ctx.effect('spookyBall') === null) ctx.grant('spookyBall', 1, 'now');
    const world = ctx.world;
    const hitter = ballById(world, green.ball);
    if (hitter !== undefined) {
      world.configureBall(hitter.id, { topReturns: hitter.topReturns + 1 });
    } else {
      for (const b of world.balls) world.configureBall(b.id, { topReturns: b.topReturns + 1 });
    }
    world.setBucketCover(true);
    ctx.announce(action('spookyBall', green.x, green.y, { value: hitter?.id ?? -1 }));
  },
  event(ctx, _fx, e) {
    if (e.type !== 'ballReturned') return;
    // The Fireball owns the cover while it runs.
    if (
      !spookyReturnPending(ctx.attempt) &&
      !hasActiveEffect(ctx.attempt, 'fireball', 'fireball')
    ) {
      ctx.world.setBucketCover(false);
    }
  },
  end(ctx) {
    if (!hasActiveEffect(ctx.attempt, 'fireball', 'fireball')) ctx.world.setBucketCover(false);
  },
};
