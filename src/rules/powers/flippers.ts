// Flippers (Lobster, spec 7): for 3 shots starting now two flippers stand in the bottom corners;
// the player's button raises both and holding keeps them up (research 4.10). The input is the
// attempt's setFlipperInput, recorded per tick. The bucket keeps clear of the flippers while
// they stand. A green hit while they run adds 3 more shots. Lighting FLIPPER_RALLY_PEGS pegs in
// one shot with balls that touched a flipper before scores Flipper Rally (spec 14.2).

import type { Power } from '../power';
import { POWER_STYLE_SHOTS } from '../style';
import { FLIPPER_RALLY_PEGS, FLIPPER_SHOTS } from '../tuning';
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
  event(ctx, _fx, e) {
    if (e.type !== 'pegLit' || ctx.attempt.shotFlipperPegs < FLIPPER_RALLY_PEGS) return;
    const s = POWER_STYLE_SHOTS.flipperRally;
    ctx.style(s.shot, s.points, e.x, e.y);
  },
  end(ctx) {
    ctx.world.setFlippers(false);
    refreshBucketTravel(ctx);
  },
};
