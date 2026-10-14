// Objects along paths. A brick chain covers a stretch of a path with bricks of about the
// standard length, a seam apart: straight bricks where the path is straight, curved bricks
// (an arc through both ends and the middle of their stretch) where it bends. Pegs go along a
// path at an even spacing. These are the placement rules of the outline template, and every
// other template uses them for its arcs, rings and lines.

import { atan2 } from '../core/dmath';
import { curvedBrickVertices, straightBrickVertices, type Vec2 } from '../level/geometry';
import {
  BRICK_LENGTH,
  BRICK_WIDTH,
  CURVED_INNER_RADIUS,
  CURVED_POINTS,
  CURVED_SECTOR_MAX,
  JOIN_GAP,
  MIN_GAP,
  PEG_RADIUS,
  SEAM,
} from './constants';
import { polyShape, shapeGap, type Shape } from './shapes';
import {
  withExtra,
  type BrickDraft,
  type CurvedBrickDraft,
  type Extra,
  type PegDraft,
} from './draft';
import { facingAngle, PathSampler, type Path } from './paths';

export type BrickLike = BrickDraft | CurvedBrickDraft;

/** A brick whose sagitta (bulge over its length) stays below this is straight. */
export const STRAIGHT_SAGITTA = 0.35;
/** Curved bricks tighter than this inner radius are not used (the original's are 35 or more). */
export const MIN_INNER_RADIUS = 25;

export interface BrickOptions {
  /** Target length along the path (default 35). */
  readonly length?: number;
  readonly seam?: number;
  /**
   * Which side straight bricks face, relative to the direction of travel: 'left' faces
   * (dy, -dx), which is outward on a clockwise path. Curved bricks always face away from the
   * center of their arc.
   */
  readonly facing?: 'left' | 'right';
  /** Largest sector of a curved brick (default 30 degrees, the original's maximum). */
  readonly maxSector?: number;
  /** Extra fields for every brick (movement, flags). */
  readonly extra?: Extra;
  /** The stretch is a whole closed path: the last brick also meets the first. */
  readonly loop?: boolean;
}

function asin(z: number): number {
  return atan2(z, Math.sqrt(Math.max(0, 1 - z * z)));
}

function norm(x: number, y: number): number {
  return Math.sqrt(x * x + y * y);
}

/** One brick spanning [s0, s1] of the path, or null when the stretch bends too tightly. */
export function brickOnSpan(
  path: PathSampler,
  s0: number,
  s1: number,
  facing: 'left' | 'right',
): BrickLike | null {
  const p0 = path.at(s0);
  const p1 = path.at(s1);
  const pm = path.at((s0 + s1) / 2);
  const cx = p1.x - p0.x;
  const cy = p1.y - p0.y;
  const chord = Math.sqrt(cx * cx + cy * cy);
  if (chord < 1) return null;
  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const bx = pm.x - mx;
  const by = pm.y - my;
  const h = Math.sqrt(bx * bx + by * by);
  if (h < STRAIGHT_SAGITTA) {
    const dx = cx / chord;
    const dy = cy / chord;
    const nx = facing === 'left' ? dy : -dy;
    const ny = facing === 'left' ? -dx : dx;
    return {
      kind: 'brick',
      x: mx,
      y: my,
      rotation: facingAngle(nx, ny),
      length: chord,
      width: BRICK_WIDTH,
    };
  }
  const ux = bx / h;
  const uy = by / h;
  const rm = (chord * chord) / 4 / (2 * h) + h / 2;
  const inner = rm - BRICK_WIDTH / 2;
  if (inner < MIN_INNER_RADIUS) return null;
  const sector = 2 * asin(Math.min(1, chord / (2 * rm)));
  return {
    kind: 'curvedBrick',
    x: mx + ux * h,
    y: my + uy * h,
    rotation: facingAngle(ux, uy),
    innerRadius: inner,
    width: BRICK_WIDTH,
    sector,
    points: CURVED_POINTS,
  };
}

/** Sector a stretch of path would need as one curved brick (0 when straight). */
function spanSector(path: PathSampler, s0: number, s1: number): number {
  const p0 = path.at(s0);
  const p1 = path.at(s1);
  const pm = path.at((s0 + s1) / 2);
  const chord = norm(p1.x - p0.x, p1.y - p0.y);
  const h = norm(pm.x - (p0.x + p1.x) / 2, pm.y - (p0.y + p1.y) / 2);
  if (h < 1e-9 || chord < 1e-9) return 0;
  const rm = (chord * chord) / 4 / (2 * h) + h / 2;
  return 2 * asin(Math.min(1, chord / (2 * rm)));
}

/** Collision outline of a brick draft, as the physics builds it. */
function brickShape(b: BrickLike): Shape {
  const local =
    b.kind === 'brick'
      ? straightBrickVertices(b.length ?? BRICK_LENGTH, b.width ?? BRICK_WIDTH)
      : curvedBrickVertices(
          b.innerRadius ?? CURVED_INNER_RADIUS,
          b.width ?? BRICK_WIDTH,
          b.sector ?? CURVED_SECTOR_MAX,
          b.points ?? CURVED_POINTS,
        );
  return polyShape(local, { x: b.x, y: b.y, rotation: b.rotation ?? 0 }, true);
}

/** Room left so scaling a chain's lengths up a little keeps sectors within the maximum. */
const SECTOR_ROOM = 0.9;
/** Largest nudge (px along the path) that resolves a bad joint between neighbors. */
const MAX_NUDGE = 16;

/** Neighbors either join at a seam or keep the full gap; anything between can wedge a ball. */
function seamOk(gap: number): boolean {
  return gap >= 0 && (gap <= JOIN_GAP || gap >= MIN_GAP);
}

/**
 * Bricks covering [start, end] of a path with seams between them (none at either end).
 * Each brick's natural length is the target, shortened where the path bends so that no curved
 * brick spans more than maxSector. The count is the one whose lengths need the least
 * stretching to fill the stretch exactly. Where two neighbors with different curvature would
 * still overlap at their inner corners, the second one starts a little later.
 */
export function bricksAlong(
  path: Path | PathSampler,
  start: number,
  end: number,
  options: BrickOptions = {},
): BrickLike[] {
  const sampler = path instanceof PathSampler ? path : new PathSampler(path);
  const target = options.length ?? BRICK_LENGTH;
  const seam = options.seam ?? SEAM;
  const maxSector = (options.maxSector ?? CURVED_SECTOR_MAX) * SECTOR_ROOM;
  const facing = options.facing ?? 'left';
  const total = end - start;
  if (total < target * 0.5) return [];
  // Natural lengths, walking on past the end so the last one is a whole brick.
  const natural: number[] = [];
  let s = start;
  while (s < end - 1e-9) {
    let a = target;
    for (let i = 0; i < 3; i++) {
      // An open path ends; a closed one wraps around.
      const s1 = sampler.closed ? s + a : Math.min(sampler.length, s + a);
      if (s1 - s < 1e-6) break;
      const sector = spanSector(sampler, s, s1);
      if (sector > maxSector) a *= maxSector / sector;
    }
    natural.push(a);
    s += a + seam;
  }
  // Pick the count whose scale factor is closest to 1.
  let best = natural.length;
  let bestCost = Infinity;
  for (const k of [natural.length - 1, natural.length]) {
    if (k < 1) continue;
    const sum = natural.slice(0, k).reduce((acc, v) => acc + v, 0);
    const scale = (total - (k - 1) * seam) / sum;
    const cost = Math.abs(scale > 1 ? scale - 1 : 1 / scale - 1);
    if (cost < bestCost) {
      bestCost = cost;
      best = k;
    }
  }
  const lengths = natural.slice(0, best);
  const scale = (total - (best - 1) * seam) / lengths.reduce((acc, v) => acc + v, 0);
  const out: BrickLike[] = [];
  s = start;
  let prev: Shape | null = null;
  for (let i = 0; i < lengths.length; i++) {
    const s1 = i === lengths.length - 1 ? end : s + (lengths[i] ?? target) * scale;
    let s0 = s;
    let b = brickOnSpan(sampler, s0, s1, facing);
    // Push the start along until the brick either joins its neighbor at a seam or clears it by
    // the full gap. Where the path bends too sharply for that (a cusp), the brick is left out
    // and the chain opens there.
    while (b !== null && prev !== null && !seamOk(shapeGap(prev, brickShape(b)))) {
      if (s0 - s >= MAX_NUDGE) {
        b = null;
        break;
      }
      s0 += 0.25;
      b = brickOnSpan(sampler, s0, s1, facing);
    }
    if (b !== null) {
      out.push(withExtra(b, options.extra));
      prev = brickShape(b);
    }
    s = s1 + seam;
  }
  // Around a closed path the last brick also meets the first: pull its end back if needed.
  const first = out[0];
  const lastIndex = out.length - 1;
  if (options.loop === true && first !== undefined && lastIndex > 0) {
    const firstShape = brickShape(first);
    const s0 = end - (lengths[lastIndex] ?? target) * scale;
    let s1 = end;
    let b: BrickLike | null = out[lastIndex] ?? null;
    while (b !== null && !seamOk(shapeGap(firstShape, brickShape(b)))) {
      if (end - s1 >= MAX_NUDGE) {
        b = null;
        break;
      }
      s1 -= 0.25;
      b = brickOnSpan(sampler, s0, s1, facing);
    }
    if (b !== null) out[lastIndex] = withExtra(b, options.extra);
    else out.pop();
  }
  return out;
}

/** Bricks around a whole closed path, a seam at the path's start point. */
export function bricksAround(path: Path, options: BrickOptions = {}): BrickLike[] {
  const sampler = new PathSampler(path);
  const seam = options.seam ?? SEAM;
  return bricksAlong(sampler, seam / 2, sampler.length - seam / 2, { ...options, loop: true });
}

export interface PegOptions {
  /** Distance between neighbors along the path (default 41). */
  readonly spacing: number;
  /** Leave this much path free at both ends of an open path. */
  readonly inset?: number;
  /** On a closed path: a peg at the start point ('peg') or the start between two ('gap'). */
  readonly start?: 'peg' | 'gap';
  readonly extra?: Extra;
}

/** Points evenly spaced along a path (count chosen from the spacing). */
export function pointsAlong(path: Path | PathSampler, options: PegOptions): Vec2[] {
  const sampler = path instanceof PathSampler ? path : new PathSampler(path);
  const L = sampler.length;
  const out: Vec2[] = [];
  if (sampler.closed) {
    const n = Math.max(3, Math.round(L / options.spacing));
    const step = L / n;
    const offset = options.start === 'gap' ? step / 2 : 0;
    for (let i = 0; i < n; i++) out.push(sampler.at(offset + i * step));
    return out;
  }
  const inset = options.inset ?? 0;
  const usable = L - 2 * inset;
  if (usable < 0) return out;
  const n = Math.max(1, Math.round(usable / options.spacing) + 1);
  if (n === 1) {
    out.push(sampler.at(L / 2));
    return out;
  }
  const step = usable / (n - 1);
  for (let i = 0; i < n; i++) out.push(sampler.at(inset + i * step));
  return out;
}

/** Pegs on [s0, s1] of a path, both ends included, at about the given spacing. */
export function pegsBetween(
  sampler: PathSampler,
  s0: number,
  s1: number,
  spacing: number,
  extra?: Extra,
): PegDraft[] {
  const n = Math.max(1, Math.round((s1 - s0) / spacing) + 1);
  if (n === 1) {
    const p = sampler.at((s0 + s1) / 2);
    return [peg(p.x, p.y, extra)];
  }
  const step = (s1 - s0) / (n - 1);
  const out: PegDraft[] = [];
  for (let i = 0; i < n; i++) {
    const p = sampler.at(s0 + i * step);
    out.push(peg(p.x, p.y, extra));
  }
  return out;
}

export function peg(x: number, y: number, extra?: Extra): PegDraft {
  return withExtra({ kind: 'peg', x, y, radius: PEG_RADIUS }, extra);
}

export function pegsAlong(path: Path | PathSampler, options: PegOptions): PegDraft[] {
  return pointsAlong(path, options).map((p) => peg(p.x, p.y, options.extra));
}
