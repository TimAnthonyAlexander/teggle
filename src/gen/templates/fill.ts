// Fill: round pegs in the space a template leaves free, as a regular pattern rather than a
// scatter, so the board reads as one composition. Two patterns, both symmetric about the center
// line: a triangle lattice, or arcs around the cannon. The spacing is chosen so the level comes
// close to its object count, as sparse as that allows. A fill can also be kept inside an area
// of the picture (a crown full of blossoms, a sail), like the original's peg blocks.

import { z } from 'zod';
import { cos, sin } from '../../core/dmath';
import type { Vec2 } from '../../level/geometry';
import { CANNON_X, CANNON_Y, CENTER_X, MIN_GAP, PEG_RADIUS } from '../constants';
import type { PegDraft } from '../draft';
import { smoothLine } from '../lines';
import { mirrorElement } from '../mirror';
import { peg } from '../place';
import type { Box, TemplateContext } from '../template';

export const FILL_STYLES = ['lattice', 'arcs'] as const;
export type FillStyle = (typeof FILL_STYLES)[number];

export const fillParams = z
  .strictObject({
    style: z.enum(FILL_STYLES),
    /** Fixed spacing; when absent the fill picks the sparsest one that reaches the target. */
    spacing: z.number().min(34).max(120),
    /** Free distance kept from other structures (more than the minimum gap, so they breathe). */
    clearance: z.number().min(MIN_GAP).max(80),
    /**
     * An area of the picture the fill stays inside (a crown, a sail): a closed line in board
     * coordinates, smoothed like any traced line (src/gen/lines.ts). Peg centers lie inside it.
     */
    within: z.strictObject({
      points: z
        .array(z.tuple([z.number(), z.number()]))
        .min(3)
        .max(400),
      corners: z.array(z.int().min(0)).default([]),
    }),
  })
  .partial();

export type FillParams = z.infer<typeof fillParams>;

const SPACING_MIN = 40;
const SPACING_MAX = 96;
/** Free distance fill pegs keep from structures, so the structures read as shapes. */
export const FILL_CLEARANCE = 30;

/** Candidate points on the right half (and the center line) of the box. */
function candidates(style: FillStyle, spacing: number, box: Box): PegDraft[] {
  const out: PegDraft[] = [];
  if (style === 'lattice') {
    const dy = spacing * 0.866;
    const rows = Math.floor((box.y1 - box.y0 - 2 * PEG_RADIUS) / dy) + 1;
    const top = box.y0 + PEG_RADIUS + (box.y1 - box.y0 - 2 * PEG_RADIUS - (rows - 1) * dy) / 2;
    for (let r = 0; r < rows; r++) {
      const offset = r % 2 === 0 ? 0 : 0.5;
      for (let k = 0; ; k++) {
        const x = CENTER_X + (k + offset) * spacing;
        if (x + PEG_RADIUS > box.x1) break;
        if (x - PEG_RADIUS < box.x0 && x > CENTER_X) continue;
        out.push(peg(x, top + r * dy));
      }
    }
    return out;
  }
  // Arcs centered on the cannon pivot, a ring every 0.9 spacings.
  const ringGap = spacing * 0.9;
  for (let i = 0; ; i++) {
    const r = 150 + i * ringGap;
    if (r > 620) break;
    const step = spacing / r;
    const offset = i % 2 === 0 ? 0 : 0.5;
    for (let j = 0; ; j++) {
      const a = (j + offset) * step;
      if (a > 1.65) break;
      const x = CANNON_X + r * sin(a);
      const y = CANNON_Y + r * cos(a);
      if (x < box.x0 || x > box.x1 || y < box.y0 || y > box.y1) continue;
      out.push(peg(x, y));
    }
  }
  return out;
}

/** Even-odd test of a point against a closed polygon. */
function inside(poly: readonly Vec2[], x: number, y: number): boolean {
  let hit = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

/** The fitting candidates, each with its mirror image, at one spacing. */
function fitting(
  ctx: TemplateContext,
  style: FillStyle,
  spacing: number,
  clearance: number,
  area: readonly Vec2[] | null,
) {
  const b = ctx.builder;
  const accepted: PegDraft[] = [];
  const options = { gap: clearance, avoidClaims: true };
  for (const c of candidates(style, spacing, ctx.region.box)) {
    if (area !== null && !(inside(area, c.x, c.y) && inside(area, 2 * CENTER_X - c.x, c.y))) {
      continue;
    }
    const shape = b.shapeOf(c);
    if (shape === null || !b.fits(shape, false, options)) continue;
    if (Math.abs(c.x - CENTER_X) < 1e-9) {
      accepted.push(c);
      continue;
    }
    const twin = mirrorElement(c);
    const twinShape = b.shapeOf(twin);
    if (twinShape === null || !b.fits(twinShape, false, options)) continue;
    // A pair straddling the center line must keep the peg spacing from each other.
    if (Math.abs(c.x - CENTER_X) * 2 < 2 * PEG_RADIUS + MIN_GAP) continue;
    accepted.push(c, twin as PegDraft);
  }
  return accepted;
}

/**
 * Adds fill pegs until the builder holds about `target` scoring objects. Returns the number of
 * pegs added.
 */
export function buildFill(ctx: TemplateContext, params: FillParams, target: number): number {
  const style = params.style ?? ctx.draw.pick(FILL_STYLES);
  const clearance = params.clearance ?? FILL_CLEARANCE;
  const area =
    params.within === undefined
      ? null
      : smoothLine({ closed: true, points: params.within.points, corners: params.within.corners })
          .points;
  const need = target - ctx.builder.scoringCount();
  if (need <= 0 && params.spacing === undefined) return 0;
  let chosen: PegDraft[] = [];
  if (params.spacing !== undefined) {
    chosen = fitting(ctx, style, params.spacing, clearance, area);
  } else {
    for (let s = SPACING_MAX; s >= SPACING_MIN; s -= 1) {
      chosen = fitting(ctx, style, s, clearance, area);
      if (chosen.length >= need) break;
    }
  }
  for (const d of chosen) ctx.builder.add(d, ctx.part);
  return chosen.length;
}
