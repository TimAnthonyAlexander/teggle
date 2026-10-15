// Flippers (Lobster, spec 7): for 3 shots starting now two flippers stand in the bottom corners;
// the player's button raises both and holding keeps them up (research 4.10). The input is the
// attempt's setFlipperInput, recorded per tick. The bucket keeps clear of the flippers while
// they stand. A green hit while they run adds 3 more shots.

import type { Power } from '../power';
import { FLIPPER_SHOTS } from '../tuning';
import { refreshBucketTravel } from './common';

export const FLIPPERS: Power = {
  id: 'flippers',
  name: 'Flippers',
  onGreen(ctx) {
    ctx.grant('flippers', FLIPPER_SHOTS, 'now');
  },
  begin(ctx) {
    ctx.world.setFlippers(true);
    refreshBucketTravel(ctx);
  },
  end(ctx) {
    ctx.world.setFlippers(false);
    refreshBucketTravel(ctx);
  },
};
