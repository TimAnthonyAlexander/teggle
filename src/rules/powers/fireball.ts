// Fireball (Wyvern, spec 7): the next shot's ball has radius 10 and burns through every peg and
// brick it meets, lighting them without bouncing (the decompiled code passes through objects with
// PegInfo); walls, solids, the bucket and the flippers it still bounces off. A dome covers the
// bucket while the Fireball shot is aimed and flies; the Fireball burns it away when it hits it,
// so a later bounce can still land in the bucket (research 4.10). A green hit adds one more
// Fireball shot. A Fireball that lands in the bucket scores Fireball Catch (the original's tip;
// spec 14.2); every ball of a Fireball shot burns, a Multiball's included.

import { FIREBALL_RADIUS } from '../../sim/tuning';
import type { Power } from '../power';
import { POWER_STYLE_SHOTS } from '../style';
import { FIREBALL_SHOTS } from '../tuning';
import { action, ballById, spookyReturnPending } from './common';

export const FIREBALL: Power = {
  id: 'fireball',
  name: 'Fireball',
  onGreen(ctx) {
    ctx.grant('fireball', FIREBALL_SHOTS, 'next');
  },
  begin(ctx) {
    ctx.world.setBucketCover(true);
  },
  launch(_ctx, _fx, plan) {
    plan.options.radius = Math.max(plan.options.radius ?? 0, FIREBALL_RADIUS);
    plan.options.passThroughScoring = true;
  },
  event(ctx, _fx, e) {
    if (e.type === 'bucketCatch') {
      const s = POWER_STYLE_SHOTS.fireballCatch;
      ctx.style(s.shot, s.points, e.x, e.y);
      return;
    }
    if (e.type !== 'bucketContact' || e.part !== 'cover' || !ctx.world.bucketCovered) return;
    if (ballById(ctx.world, e.ball)?.passThroughScoring !== true) return;
    ctx.world.setBucketCover(false);
    ctx.announce(action('coverBurned', e.x, e.y, { value: e.ball }));
  },
  end(ctx) {
    if (!spookyReturnPending(ctx.attempt)) ctx.world.setBucketCover(false);
  },
};
