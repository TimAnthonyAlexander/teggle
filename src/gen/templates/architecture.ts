// Brick architecture (spec 9): walls, arches and stairs, symmetric about the center line.
// 'colonnade' is a row of arches on pillars with an upper tier on both sides of the cannon;
// 'temple' is a dome on pillars flanked by smaller arches, with stairs descending from the top
// corners. Bricks only, built from four primitives: arch, pillar, wall row and stairs.

import { z } from 'zod';
import { cos, HALF_PI, PI, sin } from '../../core/dmath';
import { BRICK_LENGTH, BRICK_WIDTH, CENTER_X, MIN_GAP, SEAM } from '../constants';
import type { BrickDraft, ScoringDraft } from '../draft';
import { bricksAlong } from '../place';
import { arcPath, PathSampler } from '../paths';
import { placeFirst, placeGroup, type TemplateContext } from '../template';

export const architectureParams = z
  .strictObject({
    layout: z.enum(['colonnade', 'temple']),
    /** Arch radius (center line of the bricks) of the main arches. */
    archRadius: z.number().min(40).max(180),
    /** Steps per staircase (0 = none). */
    steps: z.int().min(0).max(7),
    /** Bricks per stair step. */
    stepBricks: z.int().min(1).max(4),
  })
  .partial();

export type ArchitectureParams = z.infer<typeof architectureParams>;

/**
 * Bricks along a circular arc (center line radius r) from angle a0 to a1, math convention.
 * An arc that starts on the center line (to be mirrored) starts half a seam off it.
 */
export function archBricks(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
): ScoringDraft[] {
  const path = arcPath(cx, cy, r, a0, a1);
  const s = new PathSampler(path);
  const start = Math.abs(a0 - HALF_PI) < 1e-9 && cx === CENTER_X ? SEAM / 2 : 0;
  // The arc runs from a0 to a1; facing 'left' is outward when it runs clockwise (a1 < a0).
  return bricksAlong(s, start, s.length, { facing: a1 < a0 ? 'left' : 'right' });
}

/** A column of standing bricks from yTop down to at most yBottom. */
export function pillarBricks(x: number, yTop: number, yBottom: number): BrickDraft[] {
  const n = Math.max(1, Math.floor((yBottom - yTop + SEAM) / (BRICK_LENGTH + SEAM)));
  const out: BrickDraft[] = [];
  for (let i = 0; i < n; i++) {
    const y = yTop + BRICK_LENGTH / 2 + i * (BRICK_LENGTH + SEAM);
    out.push({ kind: 'brick', x, y, rotation: 0, length: BRICK_LENGTH, width: BRICK_WIDTH });
  }
  return out;
}

/** Flat bricks side by side from x0 to x1 (centers at y), lengths stretched to fill exactly. */
export function rowBricks(x0: number, x1: number, y: number): BrickDraft[] {
  const n = Math.max(1, Math.round((x1 - x0 + SEAM) / (BRICK_LENGTH + SEAM)));
  const len = (x1 - x0 - (n - 1) * SEAM) / n;
  const out: BrickDraft[] = [];
  for (let i = 0; i < n; i++) {
    const x = x0 + len / 2 + i * (len + SEAM);
    out.push({ kind: 'brick', x, y, rotation: HALF_PI, length: len, width: BRICK_WIDTH });
  }
  return out;
}

/** Bricks end to end along a straight line from (x0, y0) at `tilt` (radians, down to the right). */
export function lineBricks(x0: number, y0: number, count: number, tilt: number): BrickDraft[] {
  const ux = cos(tilt);
  const uy = sin(tilt);
  const out: BrickDraft[] = [];
  for (let i = 0; i < count; i++) {
    const s = BRICK_LENGTH / 2 + i * (BRICK_LENGTH + SEAM);
    out.push({
      kind: 'brick',
      x: x0 + ux * s,
      y: y0 + uy * s,
      rotation: HALF_PI - tilt,
      length: BRICK_LENGTH,
      width: BRICK_WIDTH,
    });
  }
  return out;
}

/**
 * Stairs: `steps` treads of `per` bricks, each dx right and dy down of the last. Treads lean
 * down toward the next step (STEP_TILT), so a ball runs off instead of resting on a flat top.
 */
export function stairBricks(
  x0: number,
  y0: number,
  steps: number,
  per: number,
  dx: number,
  dy: number,
): BrickDraft[] {
  const out: BrickDraft[] = [];
  for (let i = 0; i < steps; i++) out.push(...lineBricks(x0 + i * dx, y0 + i * dy, per, STEP_TILT));
  return out;
}

/** Lean of a stair tread (8 degrees). */
const STEP_TILT = (8 * PI) / 180;

function colonnade(ctx: TemplateContext, r: number, steps: number, per: number): void {
  const box = ctx.region.box;
  const floor = box.y1 - 4;
  // Lower tier: an odd number of arches centered on the board, on pillars three bricks tall.
  const span = 2 * r + BRICK_WIDTH;
  const pitch = span + MIN_GAP + 8;
  const count = Math.max(1, Math.floor((box.x1 - box.x0 + MIN_GAP) / pitch)) | 1;
  const baseY = floor - 3 * (BRICK_LENGTH + SEAM) - SEAM;
  for (let i = 0; i < (count + 1) / 2; i++) {
    const cx = CENTER_X + i * pitch;
    const group: ScoringDraft[] = [];
    group.push(...archBricks(cx, baseY, r, i === 0 ? HALF_PI : PI, 0));
    group.push(...pillarBricks(cx + r, baseY + SEAM, floor));
    if (i > 0) group.push(...pillarBricks(cx - r, baseY + SEAM, floor));
    placeGroup(ctx, group);
  }
  // A second, smaller arch inside every lower arch.
  for (let i = 0; i < (count + 1) / 2; i++) {
    const cx = CENTER_X + i * pitch;
    const ri = r - BRICK_WIDTH - MIN_GAP - 14;
    if (ri < 26) break;
    placeGroup(ctx, archBricks(cx, baseY, ri, i === 0 ? HALF_PI : 0.85 * PI, 0.15 * PI));
  }
  // The roof: two shallow arches under the cannon, one inside the other.
  const roofTop = Math.max(box.y0, 168);
  for (const [rr, half, drop] of [
    [440, 0.55, 0],
    [330, 0.52, 68],
  ] as const) {
    placeGroup(ctx, archBricks(CENTER_X, roofTop + drop + rr, rr, HALF_PI, HALF_PI - half));
  }
  // Small domes over the gaps between the lower arches, as high as they fit under the roof.
  for (let i = 0; i < (count - 1) / 2; i++) {
    const x = CENTER_X + (i + 0.5) * pitch;
    placeFirst(ctx, domeHeights(baseY - r - BRICK_WIDTH - 90, baseY - r - BRICK_WIDTH - 30, x));
  }
  // Towers by the walls, between the wall and the outermost pillar: a column of standing
  // bricks under a rounded cap.
  const outerPillar = CENTER_X - ((count - 1) / 2) * pitch - r - BRICK_WIDTH / 2;
  if (outerPillar - box.x0 >= BRICK_WIDTH + 2 * MIN_GAP + 6) {
    const towerX = (box.x0 + outerPillar) / 2;
    const towerTop = baseY - 96;
    placeGroup(ctx, [...pillarBricks(towerX, towerTop, floor), capBrick(towerX, towerTop)]);
  }
  // Stairs from the top corners down toward the roof: the most bricks that fit.
  placeFirst(ctx, stairOptions(box.x0 + 18, box.y0 + 36, steps, per));
}

/** Staircases from (x0, y0), largest first: fewer steps, then shorter treads. */
function* stairOptions(
  x0: number,
  y0: number,
  steps: number,
  per: number,
): Generator<BrickDraft[]> {
  const options: [number, number][] = [];
  for (let n = steps; n >= 2; n--) for (let p = per; p >= 2; p--) options.push([n, p]);
  options.sort((a, b) => b[0] * b[1] - a[0] * a[1]);
  for (const [n, p] of options) {
    yield stairBricks(x0, y0, n, p, p * (BRICK_LENGTH + SEAM) - 8, STEP_RISE);
  }
}

/** Height between stair treads: room for the ball between overlapping treads. */
const STEP_RISE = 50;

/** A small dome (three curved bricks) at x, tried at heights from top to bottom. */
function* domeHeights(top: number, bottom: number, x: number): Generator<ScoringDraft[]> {
  for (let y = top; y <= bottom; y += 3) yield archBricks(x, y + 45, 45, 0.82 * PI, 0.18 * PI);
}

/** A rounded cap on a column whose top is at yTop: one curved brick, facing up. */
function capBrick(x: number, yTop: number): ScoringDraft {
  const inner = 35;
  const sector = PI / 6;
  const rm = inner + BRICK_WIDTH / 2;
  // The arc's center is rm below the brick's position; the inner arc's ends are its lowest
  // points and must clear the column's top by a seam.
  const lowest = rm - inner * cos(sector / 2);
  return {
    kind: 'curvedBrick',
    x,
    y: yTop - SEAM - lowest,
    rotation: HALF_PI,
    innerRadius: inner,
    width: BRICK_WIDTH,
    sector,
    points: 4,
  };
}

function temple(ctx: TemplateContext, r: number, steps: number, per: number): void {
  const box = ctx.region.box;
  const floor = box.y1 - 4;
  // The dome: the top half of a ring, centered, on two pillars, with an inner arch.
  const domeY = Math.min(floor - 150, 170 + r);
  const half: ScoringDraft[] = [];
  half.push(...archBricks(CENTER_X, domeY, r, HALF_PI, 0));
  half.push(...pillarBricks(CENTER_X + r, domeY + SEAM, floor));
  const inner = r - BRICK_WIDTH - 44;
  if (inner > 40) half.push(...archBricks(CENTER_X, domeY, inner, HALF_PI, 0.35));
  placeGroup(ctx, half);
  // Side arches on pillars.
  const sr = Math.min(r * 0.55, 80);
  const sx = CENTER_X + r + BRICK_WIDTH / 2 + MIN_GAP + 40 + sr;
  const sy = domeY + 40;
  const side: ScoringDraft[] = [];
  side.push(...archBricks(sx, sy, sr, PI, 0));
  side.push(...pillarBricks(sx - sr, sy + SEAM, floor));
  side.push(...pillarBricks(sx + sr, sy + SEAM, floor));
  placeGroup(ctx, side);
  // An outer arch over the side arch, open toward the wall.
  placeGroup(ctx, archBricks(sx, sy, sr + BRICK_WIDTH + 42, PI * 0.92, PI * 0.08));
  placeFirst(ctx, stairOptions(box.x0 + 18, box.y0 + 46, steps, per));
}

export function buildArchitecture(ctx: TemplateContext, params: ArchitectureParams): void {
  const d = ctx.draw;
  const layout = params.layout ?? d.pick(['colonnade', 'temple'] as const);
  const r = params.archRadius ?? (layout === 'temple' ? d.float(130, 160) : d.float(52, 62));
  const steps = params.steps ?? d.int(4, 5);
  const per = params.stepBricks ?? 3;
  if (layout === 'colonnade') colonnade(ctx, r, steps, per);
  else temple(ctx, r, steps, per);
}
