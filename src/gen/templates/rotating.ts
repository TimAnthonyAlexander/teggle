// Rotating group (spec 9): wheels and windmills whose parts orbit a hub, the way the original
// builds them (every part on a rotateAroundCircle movement around one center, research 3.3).
// Two mirror-image groups left and right of the cannon turn in opposite directions; 'single'
// puts one large wheel in the middle. A static peg sits on every hub.
//   wheel:    a ring of curved bricks broken into slots, with spokes of pegs inside
//   windmill: sails of straight bricks laid along the spokes, pegs at the sail tips

import { z } from 'zod';
import { cos, HALF_PI, PI, sin } from '../../core/dmath';
import {
  BRICK_LENGTH,
  BRICK_WIDTH,
  CANNON_CLEARANCE,
  CANNON_Y,
  CENTER_X,
  MIN_GAP,
  PEG_RADIUS,
  SEAM,
} from '../constants';
import type { ScoringDraft } from '../draft';
import { mirrorElement } from '../mirror';
import { orbit } from '../motion';
import { bricksAlong, peg } from '../place';
import { facingAngle, PathSampler } from '../paths';
import type { TemplateContext } from '../template';

export const rotatingParams = z
  .strictObject({
    kind: z.enum(['wheel', 'windmill']),
    layout: z.enum(['pair', 'single']),
    /** Outer radius of the group. */
    radius: z.number().min(70).max(200),
    /** Spokes or sails. */
    spokes: z.int().min(2).max(8),
    /** Ticks per turn (the original's movement periods run 200 to 3,000). */
    period: z.int().min(400).max(4000),
    /** Slots in a wheel's ring. */
    slots: z.int().min(2).max(8),
  })
  .partial();

export type RotatingParams = z.infer<typeof rotatingParams>;

function ringArc(cx: number, cy: number, r: number, a0: number, a1: number): ScoringDraft[] {
  const pts = [];
  for (let i = 0; i <= 96; i++) {
    const a = a0 + ((a1 - a0) * i) / 96;
    pts.push({ x: cx + r * cos(a), y: cy - r * sin(a) });
  }
  const s = new PathSampler({ closed: false, points: pts });
  return bricksAlong(s, 0, s.length, { facing: a1 < a0 ? 'left' : 'right' });
}

/**
 * A wheel's parts, static, around (cx, cy): a ring of curved bricks broken by slots, a ring of
 * pegs inside it, and spokes of pegs from the hub to that ring.
 */
function wheelParts(
  cx: number,
  cy: number,
  r: number,
  spokes: number,
  slots: number,
): ScoringDraft[] {
  const out: ScoringDraft[] = [];
  const rm = r - BRICK_WIDTH / 2;
  const slotAngle = (BRICK_WIDTH + MIN_GAP + 6) / (rm - BRICK_WIDTH / 2);
  const seg = (2 * PI) / slots;
  for (let k = 0; k < slots; k++) {
    const a0 = HALF_PI - k * seg - slotAngle / 2;
    out.push(...ringArc(cx, cy, rm, a0, a0 - seg + slotAngle));
  }
  // A ring of pegs well inside the bricks (the brick polygon's chords sit a little inside the
  // arc, hence the extra margin).
  const ringR = rm - BRICK_WIDTH / 2 - MIN_GAP - PEG_RADIUS - 8;
  const first = PEG_RADIUS + MIN_GAP + PEG_RADIUS + 2;
  if (ringR - first >= 2 * PEG_RADIUS + MIN_GAP) {
    const n = Math.max(3, Math.round((2 * PI * ringR) / 42));
    for (let i = 0; i < n; i++) {
      const a = HALF_PI - ((i + 0.5) * 2 * PI) / n;
      out.push(peg(cx + ringR * cos(a), cy - ringR * sin(a)));
    }
  }
  // Spokes of pegs from the hub out to the peg ring.
  const reach = Math.max(first, ringR - 2 * PEG_RADIUS - MIN_GAP - 4);
  for (let j = 0; j < spokes; j++) {
    const a = HALF_PI - (j * 2 * PI) / spokes;
    const n = Math.max(1, Math.floor((reach - first) / 38) + 1);
    const step = n > 1 ? (reach - first) / (n - 1) : 0;
    for (let i = 0; i < n; i++) {
      const rr = first + i * step;
      out.push(peg(cx + rr * cos(a), cy - rr * sin(a)));
    }
  }
  return out;
}

/** A windmill's parts: sails of bricks along the spokes, a peg past each sail's tip. */
function windmillParts(cx: number, cy: number, r: number, sails: number): ScoringDraft[] {
  const out: ScoringDraft[] = [];
  // Clear of the hub peg, and far enough out that neighboring sails' inner ends keep the gap.
  const first = Math.max(
    PEG_RADIUS + MIN_GAP + 4,
    (BRICK_WIDTH + MIN_GAP + 2) / (2 * sin(PI / sails)),
  );
  const bricks = Math.max(
    1,
    Math.floor((r - first - 2 * PEG_RADIUS - MIN_GAP) / (BRICK_LENGTH + SEAM)),
  );
  for (let j = 0; j < sails; j++) {
    const a = HALF_PI - (j * 2 * PI) / sails;
    const ux = cos(a);
    const uy = -sin(a);
    for (let i = 0; i < bricks; i++) {
      const rr = first + BRICK_LENGTH / 2 + i * (BRICK_LENGTH + SEAM);
      // The long side runs along the spoke: the brick faces across it.
      out.push({
        kind: 'brick',
        x: cx + rr * ux,
        y: cy + rr * uy,
        rotation: facingAngle(-uy, ux),
        length: BRICK_LENGTH,
        width: BRICK_WIDTH,
      });
    }
    const tip = first + bricks * (BRICK_LENGTH + SEAM) + PEG_RADIUS + MIN_GAP + 2;
    out.push(peg(cx + tip * ux, cy + tip * uy));
  }
  return out;
}

export function buildRotating(ctx: TemplateContext, params: RotatingParams): void {
  const d = ctx.draw;
  const kind = params.kind ?? d.pick(['wheel', 'windmill'] as const);
  const layout = params.layout ?? (d.bool(0.75) ? 'pair' : 'single');
  const period = params.period ?? 4 * d.int(220, 400);
  const spokes = params.spokes ?? (kind === 'wheel' ? d.pick([3, 4, 6]) : d.pick([4, 5, 6]));
  const slots = params.slots ?? d.pick([3, 4, 6]);
  const box = ctx.region.box;
  const pair = layout === 'pair';
  // A single wheel under the cannon must stay clear of it all the way round.
  const maxR = pair
    ? Math.min((CENTER_X - box.x0) / 2 - 12, (box.y1 - box.y0) / 2 - 12)
    : Math.min((box.y1 - box.y0) / 2 - 12, (box.y1 - 14 - CANNON_Y - CANNON_CLEARANCE - 4) / 2);
  const r = Math.min(params.radius ?? (pair ? d.float(125, 145) : d.float(165, 190)), maxR);
  const cx = pair ? box.x0 + (CENTER_X - box.x0) * 0.47 : CENTER_X;
  const cy = pair ? box.y1 - r - 24 : box.y1 - r - 14;
  const zone = { kind: 'circle' as const, x: cx, y: cy, r: r + 2 };
  const twinZone = { ...zone, x: 2 * CENTER_X - cx };
  const b = ctx.builder;
  if (!b.canReserve(zone) || (pair && !b.canReserve(twinZone))) return;
  const parts =
    kind === 'wheel' ? wheelParts(cx, cy, r, spokes, slots) : windmillParts(cx, cy, r, spokes);
  b.add(peg(cx, cy), ctx.part);
  if (pair) b.add(peg(2 * CENTER_X - cx, cy), ctx.part);
  for (const p of parts) {
    const moving = orbit(p, cx, cy, period, true);
    b.add(moving, ctx.part);
    if (pair) b.add(mirrorElement(moving), ctx.part);
  }
  b.reserve(zone);
  if (pair) b.reserve(twinZone);
}
