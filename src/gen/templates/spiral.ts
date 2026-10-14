// Spiral (spec 9): objects along Archimedean spiral arms. 'twin' places two mirror-image
// spirals left and right of the cannon, which suits the wide board; 'single' places one
// centered spiral, stretched to the board's shape. The arm is round pegs, bricks, or bricks on
// the outer turns and pegs inside. A spiral can spin (every object orbits the center).

import { z } from 'zod';
import { PI } from '../../core/dmath';
import { CANNON_CLEARANCE, CANNON_Y, CENTER_X } from '../constants';
import type { ScoringDraft } from '../draft';
import { mirrorElement } from '../mirror';
import { orbit } from '../motion';
import { bricksAlong, peg, pegsBetween } from '../place';
import { PathSampler, spiralPath } from '../paths';
import { placeGroup, type TemplateContext } from '../template';

export const spiralParams = z
  .strictObject({
    layout: z.enum(['twin', 'single']),
    /** What the arm is made of. */
    arm: z.enum(['pegs', 'bricks', 'mixed']),
    turns: z.number().min(1).max(3.5),
    /** Inner and outer radius of the arm. */
    inner: z.number().min(24).max(120),
    outer: z.number().min(100).max(260),
    /** Share of the arm (from the outer end) made of bricks in 'mixed'. */
    brickShare: z.number().min(0.1).max(0.95),
    /** Ticks per turn when the spiral spins; 0 keeps it still. */
    spin: z.int().min(0).max(4000),
    /** Peg spacing along the arm. */
    spacing: z.number().min(36).max(56),
    /** A peg on the spiral's center. */
    hub: z.boolean(),
  })
  .partial();

export type SpiralParams = z.infer<typeof spiralParams>;

/** Smallest distance between neighboring turns of an arm. */
const TURN_GAP = 52;

export function buildSpiral(ctx: TemplateContext, params: SpiralParams): void {
  const d = ctx.draw;
  const layout = params.layout ?? d.pick(['twin', 'single'] as const);
  const arm = params.arm ?? d.pick(['pegs', 'bricks', 'mixed'] as const);
  const drawnTurns = params.turns ?? d.float(2.2, 2.7);
  const spacing = params.spacing ?? d.float(38, 42);
  const brickShare = params.brickShare ?? d.float(0.35, 0.55);
  const spin = params.spin ?? (d.bool(0.3) ? 4 * d.int(250, 450) : 0);
  const hub = params.hub ?? d.bool(0.5);
  const box = ctx.region.box;
  const twin = layout === 'twin';
  // A twin spiral sits in the left half of the region (mirrored to the right); a single one
  // sits on the center line, under the cannon's area.
  const right = twin ? Math.min(box.x1, CENTER_X - 30) : box.x1;
  const top = twin ? box.y0 : Math.max(box.y0, CANNON_Y + CANNON_CLEARANCE + 14);
  const cy = (top + box.y1) / 2 + (twin ? 12 : 0);
  const cx = twin ? (box.x0 + right) / 2 : CENTER_X;
  const halfW = (right - box.x0) / 2 - 10;
  // Room for the arm's own half width (a brick is 20 wide) and the spin zone's margin.
  const halfH = (box.y1 - top) / 2 - (twin ? 12 : 16);
  const fitR = twin ? Math.min(halfW, halfH) : halfH;
  const outer = Math.min(params.outer ?? fitR, fitR);
  const inner = params.inner ?? d.float(30, 40);
  // Turns at least TURN_GAP apart, so pegs and bricks of neighboring turns keep the gap.
  const turns = Math.max(1, Math.min(drawnTurns, (outer - inner) / TURN_GAP));
  // A still single spiral stretches across the wide board; a spinning one stays round.
  const stretch = twin || spin > 0 ? 1 : Math.min(1.7, halfW / outer);
  // The left spiral of a twin turns clockwise; the outer end of the arm sits at the bottom.
  const clockwise = twin;
  const a0 = -PI / 2 - (clockwise ? -1 : 1) * turns * 2 * PI;
  const raw = spiralPath(0, 0, inner, outer, turns, a0, clockwise, 1);
  const sampler = new PathSampler({
    closed: false,
    points: raw.points.map((p) => ({ x: cx + p.x * stretch, y: cy + p.y })),
  });
  const L = sampler.length;
  const drafts: ScoringDraft[] = [];
  const split = arm === 'pegs' ? L : arm === 'bricks' ? 0 : L * (1 - brickShare);
  if (split > 0) drafts.push(...pegsBetween(sampler, 0, split, spacing));
  if (split < L) {
    const start = arm === 'mixed' ? split + spacing * 0.75 : 0;
    drafts.push(...bricksAlong(sampler, start, L, { facing: clockwise ? 'left' : 'right' }));
  }
  if (hub && inner >= 34) drafts.push(peg(cx, cy));
  const claim = { kind: 'ellipse' as const, x: cx, y: cy, rx: outer * stretch, ry: outer };
  if (spin === 0) {
    // A twin spiral is mirrored; a single one is chiral and placed as it is.
    const c = twin ? ctx : { ...ctx, region: { ...ctx.region, mirrored: false } };
    if (placeGroup(c, drafts) > 0) {
      ctx.builder.claim(claim);
      if (twin) ctx.builder.claim({ ...claim, x: 2 * CENTER_X - cx });
    }
    return;
  }
  const zone = { kind: 'circle' as const, x: cx, y: cy, r: outer + 12 };
  const twinZone = { ...zone, x: 2 * CENTER_X - cx };
  if (!ctx.builder.canReserve(zone)) return;
  if (twin && !ctx.builder.canReserve(twinZone)) return;
  for (const p of drafts) {
    const moving = orbit(p, cx, cy, spin, !clockwise);
    ctx.builder.add(moving, ctx.part);
    if (twin) ctx.builder.add(mirrorElement(moving), ctx.part);
  }
  ctx.builder.reserve(zone);
  if (twin) ctx.builder.reserve(twinZone);
}
