// Validity checks before simulation (spec 13.3 item 2), on the exact physics shapes:
//   - no two objects overlap;
//   - no two objects come closer than MIN_GAP, except bricks joined by a seam of at most
//     JOIN_GAP (the ball cannot enter the seam, so the pair is one surface);
//   - nothing leaves the board, comes near the cannon, or reaches down to the bucket;
//   - teleport triggers hold no solid object and their exits are clear.
// Moving parts are checked at every tick of the level's full cycle (the least common multiple
// of every movement's cycle), or at evenly spread ticks when that cycle is too long.

import type { Level, LevelElement } from '../level/schema';
import { compileLevel } from '../sim/compile';
import { World } from '../sim/world';
import {
  BALL_RADIUS,
  BOARD_W,
  BOTTOM_LIMIT,
  CANNON_CLEARANCE,
  CANNON_X,
  CANNON_Y,
  JOIN_GAP,
  MIN_GAP,
  SIDE_LIMIT,
  TOP_LIMIT,
} from './constants';
import {
  boundsGap,
  elementShape,
  filePose,
  pointGap,
  polyShape,
  shapeGap,
  type Pose,
  type Shape,
} from './shapes';

export type IssueKind = 'overlap' | 'gap' | 'outside' | 'cannon' | 'bottom' | 'trigger';

export interface Issue {
  readonly kind: IssueKind;
  readonly a: number;
  /** The other element of a pair issue. */
  readonly b?: number;
  /** First tick at which it happens. */
  readonly tick: number;
  /** The free distance found, for pair issues. */
  readonly gap?: number;
}

/** Cycles longer than this are sampled instead of checked tick by tick. */
const FULL_CYCLE_LIMIT = 6000;
const SAMPLES = 3000;
/** No level cycle is followed further than this (about 33 minutes). */
export const CYCLE_CAP = 200_000;

function gcd(a: number, b: number): number {
  let x = a;
  let y = b;
  while (y !== 0) {
    const t = x % y;
    x = y;
    y = t;
  }
  return x;
}

/** Ticks after which every movement on the level is back where it started. */
export function levelCycle(level: Level): { readonly ticks: number; readonly exact: boolean } {
  let l = 1;
  for (const e of level.elements) {
    const m = e.movement;
    if (m === undefined) continue;
    const cycle = m.pause1 > 0 ? m.period + m.pause1 + m.pause2 : m.period;
    l = (l / gcd(l, cycle)) * cycle;
    if (l > CYCLE_CAP) return { ticks: CYCLE_CAP, exact: false };
  }
  return { ticks: l, exact: true };
}

function isBrick(e: LevelElement): boolean {
  return e.kind === 'brick' || e.kind === 'curvedBrick';
}

function moves(e: LevelElement): boolean {
  return e.movement !== undefined || e.parent !== undefined;
}

/** Ticks at which moving parts are checked. */
export function checkTicks(level: Level): number[] {
  if (!level.elements.some(moves)) return [0];
  const { ticks } = levelCycle(level);
  if (ticks <= FULL_CYCLE_LIMIT) return Array.from({ length: ticks }, (_, i) => i);
  return Array.from({ length: SAMPLES }, (_, i) => Math.floor((i * ticks) / SAMPLES));
}

class Issues {
  readonly list: Issue[] = [];
  private readonly seen = new Set<string>();

  add(kind: IssueKind, a: number, b: number | undefined, tick: number, gap?: number): void {
    const key = `${kind}:${a}:${b ?? ''}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.list.push({
      kind,
      a,
      tick,
      ...(b === undefined ? {} : { b }),
      ...(gap === undefined ? {} : { gap }),
    });
  }
}

function checkBounds(s: Shape, id: number, tick: number, out: Issues): void {
  if (s.minX < SIDE_LIMIT || s.maxX > BOARD_W - SIDE_LIMIT || s.minY < TOP_LIMIT) {
    out.add('outside', id, undefined, tick);
  }
  if (s.maxY > BOTTOM_LIMIT) out.add('bottom', id, undefined, tick);
  if (pointGap(s, CANNON_X, CANNON_Y) < CANNON_CLEARANCE) out.add('cannon', id, undefined, tick);
}

function checkPair(
  a: LevelElement,
  sa: Shape,
  b: LevelElement,
  sb: Shape,
  tick: number,
  out: Issues,
): void {
  if (boundsGap(sa, sb) >= MIN_GAP) return;
  const g = shapeGap(sa, sb);
  if (g < 0) {
    out.add('overlap', Math.min(a.id, b.id), Math.max(a.id, b.id), tick, g);
  } else if (g < MIN_GAP && !(isBrick(a) && isBrick(b) && g <= JOIN_GAP)) {
    out.add('gap', Math.min(a.id, b.id), Math.max(a.id, b.id), tick, g);
  }
}

const CELL = 64;

/** Static shapes binned for pair queries. */
class StaticGrid {
  private readonly cells = new Map<number, number[]>();

  constructor(shapes: readonly (Shape | null)[]) {
    shapes.forEach((s, i) => {
      if (s === null) return;
      for (const key of this.keys(s, 0)) {
        const list = this.cells.get(key);
        if (list === undefined) this.cells.set(key, [i]);
        else list.push(i);
      }
    });
  }

  private *keys(s: Shape, margin: number): Generator<number> {
    const x0 = Math.floor((s.minX - margin) / CELL);
    const x1 = Math.floor((s.maxX + margin) / CELL);
    const y0 = Math.floor((s.minY - margin) / CELL);
    const y1 = Math.floor((s.maxY + margin) / CELL);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) yield (y + 64) * 4096 + x + 64;
  }

  near(s: Shape): Set<number> {
    const out = new Set<number>();
    for (const key of this.keys(s, MIN_GAP)) for (const i of this.cells.get(key) ?? []) out.add(i);
    return out;
  }
}

function triggerBox(e: Extract<LevelElement, { kind: 'teleport' }>, pose: Pose): Shape {
  const hw = e.width / 2;
  const hh = e.height / 2;
  return polyShape(
    [
      { x: -hw, y: -hh },
      { x: hw, y: -hh },
      { x: hw, y: hh },
      { x: -hw, y: hh },
    ],
    { x: pose.x, y: pose.y, rotation: 0 },
    true,
  );
}

/** Every validity issue of a level; empty when it passes. */
export function validateLevel(level: Level): Issue[] {
  const out = new Issues();
  const elements = level.elements;
  const compiled = compileLevel(level);
  const world = new World(compiled);
  const staticShapes = elements.map((e) => (moves(e) ? null : elementShape(e, filePose(e))));
  const grid = new StaticGrid(staticShapes);

  // Static elements: bounds and pairs, once.
  elements.forEach((e, i) => {
    const s = staticShapes[i];
    if (s === null || s === undefined) return;
    checkBounds(s, e.id, 0, out);
    for (const j of grid.near(s)) {
      if (j <= i) continue;
      const other = elements[j];
      const so = staticShapes[j];
      if (other === undefined || so === null || so === undefined) continue;
      checkPair(e, s, other, so, 0, out);
    }
  });

  // Moving elements, at every checked tick.
  const movingIndex = elements.map((_, i) => i).filter((i) => moves(elements[i] as LevelElement));
  const bodyOf = (e: LevelElement): number => compiled.bodyIndexById.get(e.id) ?? -1;
  const ticks = movingIndex.length > 0 ? checkTicks(level) : [];
  const shapesNow: (Shape | null)[] = new Array<Shape | null>(movingIndex.length).fill(null);
  for (const tick of ticks) {
    while (world.tick < tick) world.step();
    movingIndex.forEach((i, k) => {
      const e = elements[i];
      if (e === undefined) return;
      const body = world.bodies[bodyOf(e)];
      shapesNow[k] =
        body === undefined
          ? null
          : elementShape(e, { x: body.x, y: body.y, rotation: body.rotation });
    });
    movingIndex.forEach((i, k) => {
      const e = elements[i];
      const s = shapesNow[k];
      if (e === undefined || s === null || s === undefined) return;
      checkBounds(s, e.id, tick, out);
      for (const j of grid.near(s)) {
        const other = elements[j];
        const so = staticShapes[j];
        if (other === undefined || so === null || so === undefined) continue;
        checkPair(e, s, other, so, tick, out);
      }
      for (let k2 = k + 1; k2 < movingIndex.length; k2++) {
        const other = elements[movingIndex[k2] ?? -1];
        const so = shapesNow[k2];
        if (other === undefined || so === null || so === undefined) continue;
        checkPair(e, s, other, so, tick, out);
      }
    });
  }

  // Teleports (static ones): nothing solid inside the trigger, and room for the ball at the
  // exit.
  const byId = new Map(elements.map((e) => [e.id, e]));
  for (const e of elements) {
    if (e.kind !== 'teleport' || moves(e)) continue;
    const box = triggerBox(e, filePose(e));
    let exit: { x: number; y: number } | null = null;
    if (e.exit.type === 'point') exit = { x: e.exit.x, y: e.exit.y };
    if (e.exit.type === 'element') {
      const target = byId.get(e.exit.element);
      if (target !== undefined) exit = { x: target.x, y: target.y };
    }
    elements.forEach((o, j) => {
      const s = staticShapes[j];
      if (s === null || s === undefined || o.id === e.id) return;
      if (shapeGap(box, s) < 0) out.add('trigger', e.id, o.id, 0);
      if (exit !== null && pointGap(s, exit.x, exit.y) < BALL_RADIUS + 2) {
        out.add('trigger', e.id, o.id, 0);
      }
    });
  }
  return out.list;
}
