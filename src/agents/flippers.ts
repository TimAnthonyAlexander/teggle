// The agents' flipper policy (spec 13.5: full rules include the Flippers input). Simple on
// purpose: hold the button while a ball falls toward either flipper, release it otherwise, so a
// ball that drops onto a flipper gets flicked back up and a ball resting on a raised flipper
// slides off and is flicked as it falls. No allocation: it runs before every tick of a shot.

import type { World } from '../sim/world';
import { FLIPPER_ZONE_HEIGHT, FLIPPER_ZONE_X } from './tuning';

/** The flipper button state for the coming tick. False while the flippers are down. */
export function flipperPolicy(world: World): boolean {
  if (!world.flippers) return false;
  const width = world.level.width;
  const top = world.level.height - FLIPPER_ZONE_HEIGHT;
  const balls = world.balls;
  for (let i = 0; i < balls.length; i++) {
    const b = balls[i];
    if (b === undefined || b.hiddenTicks > 0 || b.vy <= 0 || b.y < top) continue;
    if (b.x <= FLIPPER_ZONE_X || b.x >= width - FLIPPER_ZONE_X) return true;
  }
  return false;
}
