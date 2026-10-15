// Flower Power (Sunflower, spec 7): lights the nearest one fifth, rounded up, of the orange pegs
// still unlit (patent). Nearest means the straight distance between the green peg's position and
// each orange peg's or brick's; ties go to the one earlier in the level file. Every green hit
// lights another fifth of what is left; in Fever there is nothing left to light.

import type { Power } from '../power';
import { FLOWER_POWER_SHARE } from '../tuning';
import { action, nearestUnlit } from './common';

export const FLOWER_POWER: Power = {
  id: 'flowerPower',
  name: 'Flower Power',
  onGreen(ctx, green) {
    const attempt = ctx.attempt;
    const orange = nearestUnlit(attempt, green.x, green.y, (id) => attempt.color(id) === 'orange');
    if (orange.length === 0) return;
    const ids = orange.slice(0, Math.ceil(orange.length / FLOWER_POWER_SHARE));
    ctx.announce(action('flowerPower', green.x, green.y, { value: ids.length, elements: ids }));
    ctx.world.lightPegs(ids);
  },
};
