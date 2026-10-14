// Physics benchmark: full shots on a 130-object level (84 round pegs, 46 bricks, moving parts).
// Every shot starts from the same world state, as reachability sweeps and self-play do.
// Usage: npm run bench:sim [-- shots]

import { aimDirection } from '../src/sim/aim';
import { compileLevel } from '../src/sim/compile';
import { World } from '../src/sim/world';
import { benchLevel } from '../tests/fixtures/levels';
import { unstick } from '../tests/fixtures/shots';

const MAX_TICKS = 6000;

function shot(world: World, base: World, angle: number): number {
  world.copyFrom(base);
  world.launch(aimDirection(angle));
  let ticks = 0;
  while (world.ballsInPlay > 0 && ticks < MAX_TICKS) {
    world.step();
    unstick(world);
    ticks++;
  }
  return ticks;
}

function run(shots: number): { seconds: number; ticks: number } {
  const level = compileLevel(benchLevel());
  // Launch states spread over the moving parts' cycles, as a reachability sweep does.
  const bases: World[] = [];
  const clock = new World(level);
  for (let k = 0; k < 16; k++) {
    bases.push(clock.clone());
    for (let t = 0; t < 113; t++) clock.step();
  }
  const world = new World(level);
  let ticks = 0;
  const start = performance.now();
  for (let i = 0; i < shots; i++) {
    const base = bases[i % bases.length] ?? clock;
    ticks += shot(world, base, -1.6 + (3.2 * ((i * 7919) % shots)) / shots);
  }
  return { seconds: (performance.now() - start) / 1000, ticks };
}

const shots = Number(process.argv[2] ?? 2000);
run(Math.min(200, shots)); // warm-up
const { seconds, ticks } = run(shots);
console.log(
  `${shots} shots, ${(ticks / shots).toFixed(0)} ticks per shot on average: ` +
    `${(shots / seconds).toFixed(0)} shots/s, ${(ticks / seconds / 1e6).toFixed(2)} M ticks/s`,
);
