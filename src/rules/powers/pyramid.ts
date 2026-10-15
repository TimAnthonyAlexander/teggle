// Pyramid (Cat, spec 7): for 5 shots starting now the bucket carries the long sloped edges of the
// original's `_base` level, and its travel narrows a little. A green hit while it runs adds 5
// more shots (the original's tip text).

import type { Power } from '../power';
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
  end(ctx) {
    ctx.world.setPyramid(false);
    refreshBucketTravel(ctx);
  },
};
