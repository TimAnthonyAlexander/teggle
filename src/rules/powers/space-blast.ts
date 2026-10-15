// Space Blast (Alien, spec 7): lights every peg and brick around the green peg, "e.g., four
// pegs wide" (patent): within SPACE_BLAST_RADIUS of its position, the nearest first. A blast
// that lights the other green peg sets off a second blast.

import type { Power } from '../power';
import { SPACE_BLAST_RADIUS } from '../tuning';
import { action, nearestUnlit } from './common';

export const SPACE_BLAST: Power = {
  id: 'spaceBlast',
  name: 'Space Blast',
  onGreen(ctx, green) {
    const r2 = SPACE_BLAST_RADIUS * SPACE_BLAST_RADIUS;
    const ids = nearestUnlit(ctx.attempt, green.x, green.y, (_id, d2) => d2 <= r2);
    ctx.announce(
      action('spaceBlast', green.x, green.y, { value: SPACE_BLAST_RADIUS, elements: ids }),
    );
    ctx.world.lightPegs(ids);
  },
};
