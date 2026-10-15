// Golden shots on the level with Teggle's followPath movements (tests/fixtures/levels.ts,
// moversLevel), digested like the original golden scenarios (golden.ts): every event and every
// ball state per tick, plus the pose of every moving body after each shot and idle gap. Kept
// apart from engineDigest so the digests pinned before followPath existed never change. Every JS
// engine must give the same digest (tools/engine-digest.ts, tests/browser), and it changes only
// on purpose (src/sim/golden.test.ts).

import { Digest } from '../../src/core/digest';
import { aimDirection } from '../../src/sim/aim';
import { compileLevel } from '../../src/sim/compile';
import { World } from '../../src/sim/world';
import { feed } from './golden';
import { moversLevel } from './levels';
import { idle, runShot } from './shots';

function poses(d: Digest, world: World): void {
  for (const index of world.level.elementMotionOrder) {
    const b = world.bodies[index];
    if (b !== undefined) d.number(b.x).number(b.y).number(b.rotation);
  }
}

export function moversDigest(): string {
  const d = new Digest();
  const world = new World(compileLevel(moversLevel()));
  poses(d, world);
  for (let s = 0; s < 12; s++) {
    const angle = -1.5 + (3 * s) / 11 + 0.017 * s;
    runShot(world, aimDirection(angle), {
      onTick: (w) => {
        feed(d, w);
      },
    });
    poses(d, world);
    idle(world, 53 + 29 * s);
    poses(d, world);
  }
  return d.hex();
}
