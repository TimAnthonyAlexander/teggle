// Golden scenarios: complete shots whose every event and every ball state per tick feed a
// digest. The same digests must come out of every JS engine (tools/engine-digest.ts) and must
// only change on purpose (src/sim/golden.test.ts).

import { Digest } from '../../src/core/digest';
import { aimDirection } from '../../src/sim/aim';
import { compileLevel } from '../../src/sim/compile';
import { FIREBALL_RADIUS } from '../../src/sim/tuning';
import { World } from '../../src/sim/world';
import { benchLevel, mixedLevel, plinkoLevel } from './levels';
import { idle, runDrop, runShot, waitForBucketEnd } from './shots';

export function feed(d: Digest, world: World): void {
  d.int(world.tick);
  for (const e of world.events) {
    for (const [key, value] of Object.entries(e)) {
      d.string(key);
      if (typeof value === 'number') d.number(value);
      else if (typeof value === 'boolean') d.int(value ? 1 : 0);
      else d.string(String(value));
    }
  }
  for (const b of world.balls) {
    d.int(b.id).number(b.x).number(b.y).number(b.vx).number(b.vy).int(b.stuckTicks);
  }
}

/** Ten shots across the aim range with idle gaps, so moving parts meet them at new phases. */
export function sweepScenario(world: World, d: Digest, shots: number): void {
  for (let s = 0; s < shots; s++) {
    const angle = -1.55 + (3.1 * s) / (shots - 1) + 0.013 * s;
    runShot(world, aimDirection(angle), {
      onTick: (w) => {
        feed(d, w);
      },
    });
    idle(world, 37 + 11 * s);
    feed(d, world);
  }
}

export function scenarioDigests(): Record<string, string> {
  const out: Record<string, string> = {};

  {
    const d = new Digest();
    sweepScenario(new World(compileLevel(plinkoLevel())), d, 10);
    out.plinko = d.hex();
  }
  {
    const d = new Digest();
    const world = new World(compileLevel(mixedLevel()));
    // A far-left shot that ends up in the delayed teleport and comes out at its exit marker.
    runShot(world, aimDirection(-1.69 + (3.38 * 18) / 400), {
      onTick: (w) => {
        feed(d, w);
      },
    });
    sweepScenario(world, d, 12);
    out.mixed = d.hex();
  }
  {
    const d = new Digest();
    sweepScenario(new World(compileLevel(benchLevel())), d, 10);
    out.bench = d.hex();
  }

  // Multiball: the first peg a ball lights spawns a second ball there, heading the other way.
  {
    const d = new Digest();
    const world = new World(compileLevel(mixedLevel()));
    for (let s = 0; s < 6; s++) {
      let spawned = false;
      runShot(world, aimDirection(-0.9 + 0.35 * s), {
        onTick: (w) => {
          feed(d, w);
          if (spawned) return;
          for (const e of w.events) {
            if (e.type === 'pegLit' && e.ball === 0) {
              const b = w.balls[0];
              if (b === undefined) return;
              spawned = true;
              w.spawnBall({ x: e.x, y: e.y - 20, vx: -b.vx, vy: -Math.abs(b.vy) });
              return;
            }
          }
        },
      });
      idle(world, 23);
    }
    out.multiball = d.hex();
  }

  // Powers: Pyramid, the Fireball cover, Fireball pass-through, Spooky Ball, flippers, Fever.
  // Each gets a full shot plus a drop that is sure to touch the part.
  {
    const d = new Digest();
    const onTick = (w: World): void => {
      feed(d, w);
    };
    const world = new World(compileLevel(plinkoLevel()));
    const bottom = world.level.height;
    world.setPyramid(true);
    runShot(world, aimDirection(0.2), { onTick });
    waitForBucketEnd(world, 'left');
    runDrop(world, { x: world.bucketX + 130, y: bottom - 80 }, { onTick });
    world.setPyramid(false);

    world.setBucketCover(true);
    world.setBucketTravel(130);
    runShot(world, aimDirection(-0.4), {
      launch: { radius: FIREBALL_RADIUS, passThroughScoring: true },
      onTick,
    });
    waitForBucketEnd(world, 'right');
    runDrop(world, { x: world.bucketX, y: bottom - 70 }, { onTick });
    world.setBucketCover(false);

    runShot(world, aimDirection(0.7), { launch: { topReturns: 1 }, onTick });

    world.setFlippers(true);
    const flip = (w: World): void => {
      const b = w.balls[0];
      w.setFlipperInput(b !== undefined && b.y > bottom - 95);
      feed(d, w);
    };
    runShot(world, aimDirection(-1.1), { onTick: flip });
    runDrop(world, { x: 60, y: bottom - 120 }, { onTick: flip });
    world.setFlippers(false);

    world.setFever(true);
    runShot(world, aimDirection(0.05), { onTick });
    out.powers = d.hex();
  }
  return out;
}

/** One digest over every scenario, for the cross-engine check. */
export function engineDigest(): string {
  const d = new Digest();
  for (const [name, hex] of Object.entries(scenarioDigests())) d.string(name).string(hex);
  return d.hex();
}
