// Fixture levels and helpers for the rules tests. Built procedurally, never shipped as content.
//
// Peg colors follow the canBeOrange flags: with orangeCount equal to the number of flagged pegs,
// exactly the flagged pegs turn orange, so a test controls the colors without a seed search.

import { Rng } from '../../src/core/rng';
import type { Vec2 } from '../../src/level/geometry';
import { parseLevel, type Level, type LevelElementInput } from '../../src/level/schema';
import { Attempt, type AttemptOptions } from '../../src/rules/attempt';
import { attemptConfig, type AttemptConfig } from '../../src/rules/config';
import type { RulesEvent } from '../../src/rules/events';
import type { Power, PowerRegistry } from '../../src/rules/power';
import { aimDirection } from '../../src/sim/aim';
import { compileLevel, type CompiledLevel } from '../../src/sim/compile';
import type { SimEvent } from '../../src/sim/events';
import { World } from '../../src/sim/world';
import { FIXTURE_HEIGHT, FIXTURE_WIDTH } from './levels';

export { FIXTURE_HEIGHT, FIXTURE_WIDTH };

/** Id of the drop teleport in dropLevel. */
export const DROP_TELEPORT = 9000;
/** Straight down: the launch that enters the drop teleport. */
export const DOWN: Vec2 = { x: 0, y: 1 };

export function rulesLevel(
  elements: LevelElementInput[],
  extra: { seededGreens?: [number, number] } = {},
): Level {
  return parseLevel({
    formatVersion: 1,
    name: 'rules-fixture',
    background: 'fixture',
    board: { width: FIXTURE_WIDTH, height: FIXTURE_HEIGHT },
    elements,
    ...extra,
  });
}

/** `count` round pegs in rows of 18, 45 px apart, ids 1 to count. */
export function pegGrid(
  count: number,
  flagged: (id: number) => boolean = () => true,
  extra: { seededGreens?: [number, number] } = {},
): Level {
  const elements: LevelElementInput[] = [];
  for (let k = 0; k < count; k++) {
    const id = k + 1;
    elements.push({
      kind: 'peg',
      id,
      x: 60 + (k % 18) * 47,
      y: 150 + Math.floor(k / 18) * 45,
      canBeOrange: flagged(id),
    });
  }
  return rulesLevel(elements, extra);
}

/**
 * A level whose straight-down shot is caught by a teleport just below the cannon and comes out
 * at `exit`, moving down at about 4.2 px/tick: a ball "dropped" at that point under the normal
 * rules. Aiming slightly off straight down adds a sideways speed of 4 * sin(angle).
 */
export function dropLevel(
  exit: Vec2,
  elements: LevelElementInput[],
  extra: { seededGreens?: [number, number] } = {},
): Level {
  return rulesLevel(
    [
      {
        kind: 'teleport',
        id: DROP_TELEPORT,
        x: FIXTURE_WIDTH / 2,
        y: 150,
        width: 80,
        height: 30,
        exit: { type: 'point', x: exit.x, y: exit.y },
      },
      ...elements,
    ],
    extra,
  );
}

/** Config whose colors are fixed by the flags: no greens, no purple. */
export function fixedColors(
  orangeCount: number,
  overrides: Partial<AttemptConfig> = {},
): AttemptConfig {
  return attemptConfig({ orangeCount, greens: false, purple: false, ...overrides });
}

export function newAttempt(
  level: Level | CompiledLevel,
  config: AttemptConfig,
  seed = 1,
  options: AttemptOptions = {},
): Attempt {
  const compiled = 'bodies' in level ? level : compileLevel(level);
  return new Attempt(compiled, { levelId: 'fixture', seed, config }, options);
}

/** Aims `wait` ticks, launches, plays the shot out; returns the rules events of the shot. */
export function shoot(attempt: Attempt, direction: Vec2, wait = 0): RulesEvent[] {
  for (let t = 0; t < wait; t++) attempt.step();
  attempt.takeEvents();
  attempt.launch(direction);
  while (attempt.phase === 'shot') attempt.step();
  return attempt.takeEvents();
}

export function ofType<T extends RulesEvent['type']>(
  events: readonly RulesEvent[],
  type: T,
): Extract<RulesEvent, { type: T }>[] {
  return events.filter((e): e is Extract<RulesEvent, { type: T }> => e.type === type);
}

/** Style shots awarded in a list of events. */
export function styles(events: readonly RulesEvent[]): string[] {
  return ofType(events, 'styleShot').map((e) => e.shot);
}

export interface PathPoint {
  readonly tick: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
}

/**
 * Ball 0's center after every tick of a shot launched after `wait` ticks, with copies of the
 * simulation events: the physics alone, for placing pegs on a path. An attempt that waits and
 * launches the same way sees the same path up to its first rules-driven change (stuck
 * handling, Fever).
 */
export function shotPath(
  level: Level,
  direction: Vec2,
  wait = 0,
  maxTicks = 3000,
): { points: PathPoint[]; events: SimEvent[] } {
  const world = new World(compileLevel(level));
  for (let t = 0; t < wait; t++) world.step();
  world.launch(direction);
  const points: PathPoint[] = [];
  const events: SimEvent[] = [];
  for (let t = 0; t < maxTicks && world.ballsInPlay > 0; t++) {
    world.step();
    for (const e of world.events) events.push({ ...e });
    const b = world.balls[0];
    if (b !== undefined) points.push({ tick: world.tick, x: b.x, y: b.y, vx: b.vx, vy: b.vy });
  }
  return { points, events };
}

/** The path point at a world tick. */
export function pointAt(points: readonly PathPoint[], tick: number): PathPoint {
  const p = points.find((q) => q.tick === tick);
  if (p === undefined) throw new Error(`the ball is not in play at tick ${tick}`);
  return p;
}

/**
 * A peg center `offset` px to one side of the ball's motion at `p` (side 1 or -1): with an
 * offset just under 16 (peg radius 10 + ball radius 6) the ball grazes the peg and flies on.
 */
export function beside(p: PathPoint, offset: number, side: 1 | -1): Vec2 {
  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  return { x: p.x - (side * p.vy * offset) / speed, y: p.y + (side * p.vx * offset) / speed };
}

/**
 * A minimal test power: a green peg turns the flippers on for 4 shots, starting now, and
 * narrows the bucket's path while they run (like the original's Flippers).
 */
export const TEST_FLIPPERS: Power = {
  id: 'testFlippers',
  name: 'Test Flippers',
  onGreen: (ctx) => {
    ctx.grant('flippers', 4, 'now');
  },
  begin: (ctx) => {
    ctx.world.setFlippers(true);
    ctx.world.setBucketTravel(130);
  },
  end: (ctx) => {
    ctx.world.setFlippers(false);
    ctx.world.setBucketTravel(ctx.world.level.bucketTravel);
  },
};

export const TEST_POWERS: PowerRegistry = new Map([[TEST_FLIPPERS.id, TEST_FLIPPERS]]);

/**
 * Plays an attempt with random aims and waits from `seed` until it is over or `maxShots` were
 * fired; with `flippers`, the flipper button changes at random ticks. Returns every rules
 * event, taken after each call.
 */
export function randomPlay(
  attempt: Attempt,
  seed: number,
  options: { readonly maxShots?: number; readonly flippers?: boolean } = {},
): RulesEvent[] {
  const rng = Rng.fromSeed(seed);
  const events: RulesEvent[] = attempt.takeEvents();
  const tick = (): void => {
    if (options.flippers === true && rng.nextInt(6) === 0) attempt.setFlipperInput(rng.nextBool());
    attempt.step();
    events.push(...attempt.takeEvents());
  };
  const maxShots = options.maxShots ?? 1000;
  while (attempt.phase === 'aim' && attempt.shotsTaken < maxShots) {
    const wait = rng.nextInt(90);
    for (let t = 0; t < wait; t++) tick();
    attempt.launch(aimDirection((2 * rng.nextFloat() - 1) * 1.6));
    events.push(...attempt.takeEvents());
    while (inShot(attempt)) tick();
  }
  return events;
}

/** The phase read through a call, so the checker does not keep a narrowing across launch(). */
export function inShot(attempt: Attempt): boolean {
  return attempt.phase === 'shot';
}

type PegInput = Extract<LevelElementInput, { kind: 'peg' }>;

/** An orange peg nothing can touch: keeps a level from reaching Fever. */
export const SPARE: PegInput = { kind: 'peg', id: 900, x: 880, y: 40, collision: false };

/**
 * The ramp: a ball dropped at RAMP_START falls onto peg FIRST (id 1), flies right in a long
 * arc and bounces along a rod that crosses the board. Free flight from tick ~20 to ~140 and
 * again from ~150 to ~220; at tick 105 it is about 345 px from FIRST, at 175 about 655 px.
 */
export const ROD: LevelElementInput = {
  kind: 'rod',
  id: 50,
  x: 455,
  y: 290,
  a: { x: -425, y: -130 },
  b: { x: 425, y: 130 },
};
export const RAMP_START: Vec2 = { x: 40, y: 60 };
export const FIRST: PegInput = { kind: 'peg', id: 1, x: 32, y: 110 };

/**
 * Adds pegs 10, 11, ... one by one on the ramp, each grazing the path the earlier ones leave
 * at the given world tick; `flagged(k)` sets canBeOrange of the k-th.
 */
export function grazeChain(
  fixed: LevelElementInput[],
  ticks: readonly number[],
  flagged: (k: number) => boolean = () => true,
): LevelElementInput[] {
  const elements = [...fixed];
  ticks.forEach((tick, k) => {
    const { points } = shotPath(dropLevel(RAMP_START, elements), DOWN);
    const at = beside(pointAt(points, tick), 15.5, 1);
    elements.push({ kind: 'peg', id: 10 + k, x: at.x, y: at.y, canBeOrange: flagged(k) });
  });
  return elements;
}
