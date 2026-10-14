// Moving platforms (spec 9): groups that slide or float, every member of a group on the same
// movement so the group moves as one.
//   shelves: tiers of shallow brick arches with pegs riding above them, sliding left and
//            right (horizontalCycle), mirror images on the two sides moving in mirror image;
//            flat shelves would carry a resting ball along forever, arches shed it
//   floaters: rings of curved bricks (the original's most common brick: inner radius 35,
//            30 degrees) holding a peg, each ring floating on a small circle
// Each group reserves the area it sweeps, so nothing static gets in its way.

import { z } from 'zod';
import { atan2, cos, HALF_PI, PI, sin } from '../../core/dmath';
import {
  BRICK_LENGTH,
  BRICK_WIDTH,
  CANNON_CLEARANCE,
  CANNON_Y,
  CENTER_X,
  CURVED_INNER_RADIUS,
  CURVED_POINTS,
  MIN_GAP,
  PEG_RADIUS,
  SEAM,
} from '../constants';
import type { ScoringDraft } from '../draft';
import { mirrorElement } from '../mirror';
import { float, slide } from '../motion';
import { peg } from '../place';
import type { Zone } from '../builder';
import type { TemplateContext } from '../template';
import { archBricks } from './architecture';

export const platformParams = z
  .strictObject({
    kind: z.enum(['shelves', 'floaters']),
    /** Tiers of shelves, or rows of floating rings. */
    tiers: z.int().min(1).max(4),
    /** Bricks per shelf. */
    shelfBricks: z.int().min(2).max(6),
    /** Travel either side (shelves) or float radius (rings). */
    travel: z.number().min(10).max(160),
    period: z.int().min(400).max(3000),
  })
  .partial();

export type PlatformParams = z.infer<typeof platformParams>;

/** Adds a moving group and reserves its area (with its mirror image, unless it is centered). */
function addGroup(
  ctx: TemplateContext,
  drafts: readonly ScoringDraft[],
  zone: Zone,
  centered = false,
): boolean {
  const b = ctx.builder;
  const twin: Zone =
    zone.kind === 'circle'
      ? { ...zone, x: 2 * CENTER_X - zone.x }
      : { ...zone, minX: 2 * CENTER_X - zone.maxX, maxX: 2 * CENTER_X - zone.minX };
  const mirrored = ctx.region.mirrored && !centered;
  if (!b.canReserve(zone)) return false;
  b.reserve(zone);
  if (mirrored && !b.canReserve(twin)) {
    b.zones.pop();
    return false;
  }
  for (const d of drafts) {
    b.add(d, ctx.part);
    if (mirrored) b.add(mirrorElement(d), ctx.part);
  }
  if (mirrored) b.reserve(twin);
  return true;
}

/** Radius of a shelf's arch: shallow enough to read as a shelf, curved so balls roll off. */
const SHELF_RADIUS = 150;

/**
 * Shelves: shallow arches of curved bricks with a row of pegs riding above, sliding left and
 * right by the walls, a tier at a time; the right side mirrors the left. A column of floating
 * rings fills the middle.
 */
function shelves(
  ctx: TemplateContext,
  tiers: number,
  per: number,
  travel: number,
  period: number,
): void {
  const box = ctx.region.box;
  const R = SHELF_RADIUS;
  const chord = per * (BRICK_LENGTH + SEAM);
  const half = atan2(chord / 2, Math.sqrt(R * R - (chord * chord) / 4));
  const sag = R * (1 - cos(half));
  const pegR = R + BRICK_WIDTH / 2 + MIN_GAP + PEG_RADIUS + 4;
  const tierGap = (box.y1 - box.y0 - 60) / tiers;
  // Travel shrinks to leave the middle column to the floating rings.
  const room = CENTER_X - (RING_OUTER + RING_FLOAT + 2) - MIN_GAP - 4 - (box.x0 + 8 + STAGGER);
  const go = Math.max(10, Math.min(travel, room / 2 - chord / 2 - BRICK_WIDTH / 2 - 4));
  for (let t = 0; t < tiers; t++) {
    const top = box.y0 + 92 + t * tierGap;
    const reachX = chord / 2 + BRICK_WIDTH / 2 + go + 4;
    // Tiers step in from the wall as they go down, like a staircase of shelves.
    const cx = box.x0 + reachX + 8 + (t % 2) * STAGGER;
    const cy = top + R;
    const phase = (t * 0.5) % 1;
    const group: ScoringDraft[] = [...archBricks(cx, cy, R, HALF_PI + half, HALF_PI - half)];
    // Pegs riding above the shelf, and a shorter row hanging under it.
    const pegs = Math.max(1, per - 1);
    for (let i = 0; i < pegs; i++) {
      const a = HALF_PI + half * 0.8 - (i * 1.6 * half) / Math.max(1, pegs - 1);
      const aa = pegs === 1 ? HALF_PI : a;
      group.push(peg(cx + pegR * cos(aa), cy - pegR * sin(aa)));
    }
    const hangR = R - BRICK_WIDTH / 2 - MIN_GAP - PEG_RADIUS - 4;
    const hanging = Math.max(1, per - 2);
    for (let i = 0; i < hanging; i++) {
      const a = HALF_PI + half * 0.55 - (i * 1.1 * half) / Math.max(1, hanging - 1);
      const aa = hanging === 1 ? HALF_PI : a;
      group.push(peg(cx + hangR * cos(aa), cy - hangR * sin(aa)));
    }
    const zone: Zone = {
      kind: 'box',
      minX: cx - reachX,
      maxX: cx + reachX,
      minY: cy - pegR - PEG_RADIUS - 2,
      maxY: Math.max(top + sag + BRICK_WIDTH, cy - hangR * cos(half * 0.55) + PEG_RADIUS) + 2,
    };
    addGroup(
      ctx,
      group.map((g) => slide(g, go, period, phase)),
      zone,
    );
  }
  // Floating rings down the middle, below the cannon's area.
  const float0 = CANNON_Y + CANNON_CLEARANCE + RING_OUTER + RING_FLOAT + 10;
  const step = 2 * (RING_OUTER + RING_FLOAT) + MIN_GAP + 20;
  for (let i = 0, y = float0; y + RING_OUTER + RING_FLOAT <= box.y1; i++, y += step) {
    const group = ringParts(CENTER_X, y, 2).map((p) =>
      float(p, RING_FLOAT, period, i * HALF_PI, i % 2 === 1),
    );
    addGroup(ctx, group, { kind: 'circle', x: CENTER_X, y, r: RING_OUTER + RING_FLOAT + 2 }, true);
  }
}

const RING_OUTER = CURVED_INNER_RADIUS + BRICK_WIDTH;
const RING_FLOAT = 18;
/** Every other tier of shelves sits this much further from the wall. */
const STAGGER = 46;

/** A ring of curved bricks around (cx, cy) with an opening at the bottom, and a peg inside. */
function ringParts(cx: number, cy: number, open: number): ScoringDraft[] {
  const out: ScoringDraft[] = [];
  const sector = PI / 6;
  const rm = CURVED_INNER_RADIUS + BRICK_WIDTH / 2;
  // Twelve slots of 30 degrees; the bottom `open` slots are left out.
  for (let k = 0; k < 12; k++) {
    const a = HALF_PI - k * sector - sector / 2;
    // Brick centers run from 75 degrees down to -255; the bottom of the ring is at -90.
    if (Math.abs(a + HALF_PI) < (open * sector) / 2) continue;
    const seamAngle = SEAM / rm;
    out.push({
      kind: 'curvedBrick',
      x: cx + rm * cos(a),
      y: cy - rm * sin(a),
      rotation: a,
      innerRadius: CURVED_INNER_RADIUS,
      width: BRICK_WIDTH,
      sector: sector - seamAngle,
      points: CURVED_POINTS,
    });
  }
  out.push(peg(cx, cy));
  return out;
}

function floaters(ctx: TemplateContext, rows: number, radius: number, period: number): void {
  const box = ctx.region.box;
  const outerR = CURVED_INNER_RADIUS + BRICK_WIDTH;
  const cell = 2 * (outerR + radius) + MIN_GAP + 18;
  const rowGap = (box.y1 - box.y0 - 40) / rows;
  for (let r = 0; r < rows; r++) {
    const cy = box.y0 + 40 + rowGap * (r + 0.5);
    const offset = r % 2 === 0 ? 0.5 : 1;
    for (let k = 0; ; k++) {
      const cx = CENTER_X + (k + offset) * cell;
      if (cx + outerR + radius > box.x1) break;
      const angle = ((k + r) % 4) * HALF_PI;
      const group = ringParts(cx, cy, 2).map((p) =>
        float(p, radius, period, angle, (k + r) % 2 === 0),
      );
      const zone: Zone = { kind: 'circle', x: cx, y: cy, r: outerR + radius + 2 };
      addGroup(ctx, group, zone);
    }
  }
}

export function buildPlatforms(ctx: TemplateContext, params: PlatformParams): void {
  const d = ctx.draw;
  const kind = params.kind ?? d.pick(['shelves', 'floaters'] as const);
  const period = params.period ?? 4 * d.int(180, 320);
  if (kind === 'shelves') {
    shelves(
      ctx,
      params.tiers ?? 3,
      params.shelfBricks ?? d.int(4, 5),
      params.travel ?? d.float(50, 90),
      period,
    );
  } else {
    floaters(ctx, params.tiers ?? d.int(2, 3), params.travel ?? d.float(16, 28), period);
  }
}
