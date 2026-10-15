// Pyramid (Cat, spec 7): for 5 shots starting now the bucket carries the long sloped edges of the
// original's `_base` level, and its travel narrows a little. A green hit while it runs adds 5
// more shots (the original's tip text). A ball that lands in the bucket after bouncing off a
// slope, with no peg or brick in between, scores Pyramid Catch (spec 14.2).

import type { Power } from '../power';
import { POWER_STYLE_SHOTS } from '../style';
import { PYRAMID_SHOTS } from '../tuning';
import { refreshBucketTravel } from './common';

export const PYRAMID: Power = {
  id: 'pyramid',
  name: 'Pyramid',
  onGreen(ctx) {
    ctx.grant('pyramid', PYRAMID_SHOTS, 'now');
  },
  begin(ctx) {
    ctx.world.setPyramid(true);
    refreshBucketTravel(ctx);
  },
  event(ctx, _fx, e) {
    if (e.type !== 'bucketCatch' || !ctx.attempt.ballPath(e.ball).pyramidSincePeg) return;
    const s = POWER_STYLE_SHOTS.pyramidCatch;
    ctx.style(s.shot, s.points, e.x, e.y);
  },
  end(ctx) {
    ctx.world.setPyramid(false);
    refreshBucketTravel(ctx);
  },
};
