// Solids at given positions: ramps and blockers (polygons), thin barriers (rods) and round
// obstacles (circles), traced from a level's picture like its lines. They never score (spec 9).
// The coordinates are the designer's, so a solid that does not fit is an error in the recipe,
// not something to skip: the build stops and says which one and why.

import { z } from 'zod';
import type { Draft } from '../draft';
import type { TemplateContext } from '../template';

const point = z.tuple([z.number(), z.number()]);

/** Surface overrides (spec 9): 0 keeps the default. */
const surface = {
  bouncy: z.number().min(0).max(2).optional(),
  rolly: z.number().min(0).max(10).optional(),
};

export const solidsParams = z.strictObject({
  /** Closed outlines in board coordinates (no self-intersection). */
  polygons: z
    .array(z.strictObject({ points: z.array(point).min(3).max(32), ...surface }))
    .max(24)
    .default([]),
  rods: z
    .array(z.strictObject({ a: point, b: point, ...surface }))
    .max(24)
    .default([]),
  circles: z
    .array(
      z.strictObject({ x: z.number(), y: z.number(), r: z.number().min(4).max(150), ...surface }),
    )
    .max(24)
    .default([]),
});

export type SolidsParams = z.output<typeof solidsParams>;

function withSurface(
  d: Draft,
  s: { readonly bouncy?: number | undefined; readonly rolly?: number | undefined },
): Draft {
  return {
    ...d,
    ...(s.bouncy === undefined ? {} : { bouncy: s.bouncy }),
    ...(s.rolly === undefined ? {} : { rolly: s.rolly }),
  };
}

function add(ctx: TemplateContext, draft: Draft, what: string): void {
  if (ctx.builder.tryAdd(draft, ctx.part) === null) {
    throw new Error(`solids: ${what} does not fit: ${ctx.builder.lastReject}`);
  }
}

export function buildSolids(ctx: TemplateContext, params: SolidsParams): void {
  params.polygons.forEach((p, i) => {
    // Anchored at the vertices' mean, so the element's position sits inside the shape.
    let cx = 0;
    let cy = 0;
    for (const [x, y] of p.points) {
      cx += x / p.points.length;
      cy += y / p.points.length;
    }
    const draft: Draft = {
      kind: 'polygon',
      x: cx,
      y: cy,
      vertices: p.points.map(([x, y]) => ({ x: x - cx, y: y - cy })),
    };
    add(ctx, withSurface(draft, p), `polygon ${i}`);
  });
  params.rods.forEach((r, i) => {
    const cx = (r.a[0] + r.b[0]) / 2;
    const cy = (r.a[1] + r.b[1]) / 2;
    const draft: Draft = {
      kind: 'rod',
      x: cx,
      y: cy,
      a: { x: r.a[0] - cx, y: r.a[1] - cy },
      b: { x: r.b[0] - cx, y: r.b[1] - cy },
    };
    add(ctx, withSurface(draft, r), `rod ${i}`);
  });
  params.circles.forEach((c, i) => {
    add(ctx, withSurface({ kind: 'circle', x: c.x, y: c.y, radius: c.r }, c), `circle ${i}`);
  });
}
