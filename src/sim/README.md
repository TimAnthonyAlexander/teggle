# Physics (`src/sim`)

Deterministic 2D physics for Teggle. It ports the original's constants and order of operations (`docs/research/original-tech.md` sections 3 and 4) and gives the same bits in every JS engine (spec 13.4). Units: board px, x right, y down, ticks of 1/100 s, angles in radians turning counterclockwise on screen.

## Files

| File | Contents |
| --- | --- |
| `tuning.ts` | Every constant, including the original's `_base` geometry (walls, ceiling, bucket, Pyramid, cover, flippers, Fever buckets) |
| `movement.ts` | `movementPhase`, `movementPose`: the original's Mover math, a pure function of the tick |
| `compile.ts` | `compileLevel(level)`: bodies for the level's elements plus the base geometry, pose tables, static broadphase grid |
| `world.ts` | `World`: stepping, contacts, triggers, control API, snapshots |
| `collide.ts`, `response.ts` | Swept contact tests and the original's contact responses |
| `events.ts` | The typed event stream |
| `preview.ts` | `TrajectoryPreview` for the aim guide |
| `aim.ts` | Aim angle to direction vector, barrel tip |

## Using it

```ts
const level = compileLevel(parseLevel(json)); // once per level, shared by any number of worlds
const world = new World(level);

world.step(); // one tick; moving parts move between shots too
world.launch(aimDirection(angle)); // the shot is a direction vector at world.tick
while (world.ballsInPlay > 0) {
  world.step();
  for (const e of world.events) rules.handle(e);
}
world.endShot(); // removes the lit pegs
```

A shot is reproduced from the world state at its launch tick, the launch direction, and the per-tick inputs (flipper button, power calls). `aimDirection` is for the input layer only; store the vector.

## Tick order

1. `tick += 1`. Level movements (parents first), the bucket, flippers and Fever parts take their pose for the new tick. A body's velocity is its pose change during this tick.
2. Quick-disappear pegs count up and vanish 97 ticks after they lit.
3. Each ball in spawn order: stuck bookkeeping, teleport and catch triggers, gravity and the speed cap, penetration recovery, swept move with up to 20 contacts, bottom exit.
4. Ball vs ball.

## Events

`world.events` lists what happened since the last `step()` began: that tick's events in order, then events from control calls made since. Event objects are pooled; copy what you need before the next `step()`. A rules layer that calls a control method while iterating by index sees the events it causes.

| Event | When |
| --- | --- |
| `ballSpawned` | `launch` or `spawnBall` |
| `pegContact` | Contact with a peg or brick. `first`: this contact lit it. `slide`: the slide branch ran |
| `pegLit` | A peg or brick lit, by contact or by `lightPegs` (`ball` -1). Score from this one |
| `solidContact`, `wallContact`, `bucketContact`, `flipperContact` | Contacts with solids, walls or ceiling, bucket rims, Pyramid, cover or Fever dividers, flippers |
| `ballContact` | Two balls collided |
| `teleport` | `enter` and `exit` of a teleport |
| `bucketCatch`, `feverCatch` | Ball caught (it leaves play) |
| `ballOut` | Ball left play: `bottom`, `teleport` (a remove exit) or `removed` |
| `ballReturned` | A Spooky ball came back in at the top |
| `pegRemoved` | `shotEnd`, `quickDisappear`, `stuck` or `power` |

Contact events carry the ball center at contact, the normal (surface to ball) and `impact`, the approach speed along it.

## Control API (for the powers and rules layers)

| Call | Use |
| --- | --- |
| `launch(dir, { radius, passThroughScoring, topReturns })` | Start a shot; throws until `endShot()` |
| `spawnBall({ x, y, vx, vy, ... })` | Multiball |
| `configureBall(id, { radius, passThroughScoring, topReturns })` | Fireball (radius 10, pass-through), Spooky Ball (`topReturns: 1`), bigger hitbox |
| `removeBall(id)` | Take a ball out of play |
| `lightPegs(ids)` | Space Blast, Flower Power |
| `removePeg(id, 'stuck' \| 'power')` | Stuck-ball handling reads `ball.stuckTicks` and picks the peg |
| `endShot()` | Removes the lit pegs; required before the next launch |
| `setPyramid(on)`, `setBucketCover(on)` | Pyramid slopes; Fireball cover |
| `setBucketTravel(px)` | Narrow the bucket's path (animates 1 px every 2 ticks) |
| `setFlippers(on)`, `setFlipperInput(pressed)` | Flippers; the input is read every tick |
| `setFever(on)` | Swap the free ball bucket for the five Fever buckets |
| `clone()`, `copyFrom(world)`, `discardBalls()` | Snapshots for Zen Ball, self-play and reachability sweeps |

Queries: `tick`, `balls` (`stuckTicks`, `hiddenTicks`, ...), `ballsInPlay`, `inShot`, `bodies` (pose and state of every body, for the renderer), `element(id)`, `isActive`, `isLit`, `litElementIds()`, `bucketX`.

## Aim guide

`new TrajectoryPreview(level, maxTicks).run(world, dir, { ticks, throughFirstBounce })` fills `points` with the launch point and the ball center after each tick, stopping at the first contact (or the second with Guide). It runs the real simulation on a private copy, so the path matches the shot to the bit.

## Determinism and speed

Only `+ - * /`, `Math.sqrt`, `Math.abs`, `Math.min/max`, `Math.round/trunc/floor` and `src/core/dmath.ts`. Golden digests in `golden.test.ts` pin the bits; `npm run test:engines` compares Node (V8) and Bun (JavaScriptCore). Stepping allocates nothing once warm. Movements are tabulated per tick of their cycle at compile time (same bits as `movementPose`), static bodies sit in a grid, moving ones are scanned. `npm run bench:sim` measures full shots on a 130-object level.
