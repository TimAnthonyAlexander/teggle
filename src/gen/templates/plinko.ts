// Plinko grid (spec 9): staggered rows of round pegs, symmetric about the center line. The
// rows fill an envelope (a rectangle, a funnel, a pyramid, a diamond or an hourglass) and can
// ripple as waves. With a count, the spacing is chosen to land on it. The original's plinko
// level has 112 pegs on the 4:3 board.

import { z } from 'zod';
import { cos, TAU } from '../../core/dmath';
import { CENTER_X, PEG_RADIUS } from '../constants';
import type { PegDraft } from '../draft';
import { peg } from '../place';
import { countFitting, place, type Box, type TemplateContext } from '../template';

export const PLINKO_SHAPES = ['rect', 'funnel', 'pyramid', 'diamond', 'hourglass'] as const;

export const plinkoParams = z
  .strictObject({
    /** Scoring objects to aim for; picks the spacing. */
    count: z.int().min(20).max(260),
    /** Horizontal distance between pegs in a row (ignored when count is given). */
    spacing: z.number().min(44).max(90),
    /** Row distance as a share of the spacing (0.866 is a regular triangle grid). */
    rowRatio: z.number().min(0.6).max(1),
    shape: z.enum(PLINKO_SHAPES),
    /** Wave amplitude of the rows in px (0 = straight rows). */
    wave: z.number().min(0).max(24),
    /** Narrowest half-width of a tapering shape, as a share of the full half-width. */
    waist: z.number().min(0.2).max(0.9),
    /** Free margin inside the region on every side. */
    margin: z.number().min(0).max(120),
  })
  .partial();

export type PlinkoParams = z.infer<typeof plinkoParams>;

interface Grid {
  readonly spacing: number;
  readonly rowRatio: number;
  readonly shape: (typeof PLINKO_SHAPES)[number];
  readonly wave: number;
  readonly waist: number;
}

/** Right half (and center line) of the grid inside a box. */
function gridDrafts(g: Grid, box: Box): PegDraft[] {
  const out: PegDraft[] = [];
  const dy = g.spacing * g.rowRatio;
  const halfFull = Math.min(CENTER_X - box.x0, box.x1 - CENTER_X) - PEG_RADIUS;
  const height = box.y1 - box.y0 - 2 * PEG_RADIUS - 2 * g.wave;
  const rows = Math.max(1, Math.floor(height / dy) + 1);
  const top = box.y0 + (box.y1 - box.y0 - (rows - 1) * dy) / 2;
  const wavelength = g.spacing * 4;
  for (let r = 0; r < rows; r++) {
    const f = rows === 1 ? 0.5 : r / (rows - 1);
    let w: number;
    switch (g.shape) {
      case 'rect':
        w = 1;
        break;
      case 'funnel':
        w = 1 - (1 - g.waist) * f;
        break;
      case 'pyramid':
        w = g.waist + (1 - g.waist) * f;
        break;
      case 'diamond':
        w = g.waist + (1 - g.waist) * (1 - Math.abs(2 * f - 1));
        break;
      case 'hourglass':
        w = g.waist + (1 - g.waist) * Math.abs(2 * f - 1);
        break;
    }
    const half = halfFull * w + 1e-9;
    const offset = r % 2 === 0 ? 0 : 0.5;
    const y = top + r * dy;
    for (let k = 0; ; k++) {
      const x = CENTER_X + (k + offset) * g.spacing;
      if (x - CENTER_X > half) break;
      const yy = g.wave > 0 ? y + g.wave * cos(((x - CENTER_X) / wavelength) * TAU) : y;
      out.push(peg(x, yy));
    }
  }
  return out;
}

export function buildPlinko(ctx: TemplateContext, params: PlinkoParams): void {
  const d = ctx.draw;
  const drawnSpacing = d.float(50, 60);
  const grid: Grid = {
    spacing: params.spacing ?? drawnSpacing,
    rowRatio: params.rowRatio ?? d.float(0.72, 0.86),
    shape: params.shape ?? d.pick(PLINKO_SHAPES),
    wave: params.wave ?? (d.bool(0.3) ? d.float(8, 16) : 0),
    waist: params.waist ?? d.float(0.3, 0.5),
  };
  const margin = params.margin ?? d.float(14, 30);
  const r = ctx.region.box;
  const box = { x0: r.x0 + margin, y0: r.y0 + margin / 2, x1: r.x1 - margin, y1: r.y1 };
  let chosen = grid;
  if (params.count !== undefined) {
    // The sparsest grid that reaches the count.
    for (let s = 90; s >= 44; s -= 0.5) {
      chosen = { ...grid, spacing: s };
      if (countFitting(ctx, gridDrafts(chosen, box)) >= params.count) break;
    }
  }
  for (const p of gridDrafts(chosen, box)) place(ctx, p);
}
