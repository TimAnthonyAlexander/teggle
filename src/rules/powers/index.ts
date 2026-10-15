// The ten base-game powers (spec 7) and their registry. The expansion's Lightning is out of scope.

import type { Power, PowerRegistry } from '../power';
import { FIREBALL } from './fireball';
import { FLIPPERS } from './flippers';
import { FLOWER_POWER } from './flower-power';
import { GUIDE } from './guide';
import type { PowerId } from './ids';
import { LUCKY_SPIN } from './lucky-spin';
import { MULTIBALL } from './multiball';
import { PYRAMID } from './pyramid';
import { SPACE_BLAST } from './space-blast';
import { SPOOKY_BALL } from './spooky-ball';
import { ZEN_BALL } from './zen-ball';

export { FIREBALL } from './fireball';
export { FLIPPERS } from './flippers';
export { FLOWER_POWER } from './flower-power';
export { GUIDE } from './guide';
export { isPowerId, POWER_IDS, type PowerId } from './ids';
export { LUCKY_SPIN, LUCKY_SPIN_OUTCOMES, LUCKY_SPIN_POWERS } from './lucky-spin';
export { MULTIBALL } from './multiball';
export { PYRAMID } from './pyramid';
export { SPACE_BLAST } from './space-blast';
export { SPOOKY_BALL } from './spooky-ball';
export { ZEN_BALL, ZenSearch, zenSearchFor, type ZenResult } from './zen-ball';

const ALL: Record<PowerId, Power> = {
  guide: GUIDE,
  multiball: MULTIBALL,
  pyramid: PYRAMID,
  spaceBlast: SPACE_BLAST,
  flippers: FLIPPERS,
  spookyBall: SPOOKY_BALL,
  flowerPower: FLOWER_POWER,
  luckySpin: LUCKY_SPIN,
  fireball: FIREBALL,
  zenBall: ZEN_BALL,
};

/** Every base-game power by id: the registry attempts with a master use. */
export const BASE_POWERS: PowerRegistry = new Map(Object.entries(ALL));

/** The power with this id. */
export function powerById(id: PowerId): Power {
  return ALL[id];
}
