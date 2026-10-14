// Rings and spokes (spec 9, "web"): a spider web in the middle of the board, its rings drawn
// as straight threads between the spokes, sagging a little toward the center, plus quarter webs
// in the two top corners. Pegs only by default; 'outer' can turn the outermost ring into a
// ring of bricks. The original's web level has 123 round pegs.

import { z } from 'zod';
import { cos, PI, sin } from '../../core/dmath';
import type { Vec2 } from '../../level/geometry';
import { CENTER_X, MIN_PEG_SPACING, SIDE_LIMIT, TOP_LIMIT } from '../constants';
import type { ScoringDraft } from '../draft';
import { bricksAlong, peg } from '../place';
import { PathSampler } from '../paths';
import { place, placeGroup, type TemplateContext } from '../template';

export const webParams = z
  .strictObject({
    rings: z.int().min(2).max(6),
    /** Spokes around the center (even, so the web is symmetric). */
    spokes: z.union([z.literal(8), z.literal(10), z.literal(12), z.literal(14), z.literal(16)]),
    /** Outer ring: vertical radius, and width over height. */
    radius: z.number().min(100).max(240),
    aspect: z.number().min(1).max(2),
    /** Thread sag toward the center, as a share of the thread length. */
    sag: z.number().min(0).max(0.2),
    spacing: z.number().min(36).max(56),
    /** Quarter webs in the top corners. */
    corners: z.boolean(),
    /** The outermost ring as bricks. */
    outer: z.enum(['pegs', 'bricks']),
  })
  .partial();

export type WebParams = z.infer<typeof webParams>;

interface Web {
  readonly cx: number;
  readonly cy: number;
  /** Ring radii (x, y) from the inside out. */
  readonly radii: readonly (readonly [number, number])[];
  /** Spoke angles, math convention. */
  readonly angles: readonly number[];
  readonly sag: number;
  readonly spacing: number;
}

function onRing(w: Web, ring: number, a: number): Vec2 {
  const [rx, ry] = w.radii[ring] ?? [0, 0];
  return { x: w.cx + rx * cos(a), y: w.cy - ry * sin(a) };
}

/** Points of a thread from p to q, both ends included, sagging toward the web's center. */
function thread(w: Web, p: Vec2, q: Vec2): Vec2[] {
  const len = Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y));
  const n = Math.max(1, Math.round(len / w.spacing));
  const mx = (p.x + q.x) / 2;
  const my = (p.y + q.y) / 2;
  const tx = w.cx - mx;
  const ty = w.cy - my;
  const tl = Math.sqrt(tx * tx + ty * ty);
  const sx = tl > 0 ? (tx / tl) * w.sag * len : 0;
  const sy = tl > 0 ? (ty / tl) * w.sag * len : 0;
  const out: Vec2[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const bulge = 4 * t * (1 - t);
    out.push({ x: p.x + (q.x - p.x) * t + sx * bulge, y: p.y + (q.y - p.y) * t + sy * bulge });
  }
  return out;
}

/** Spoke angles a ring uses: every k-th spoke, so its threads stay long enough. */
function ringStep(w: Web, ring: number): number {
  for (let step = 1; step <= 4; step *= 2) {
    let ok = true;
    for (let j = 0; j + step < w.angles.length; j += step) {
      const p = onRing(w, ring, w.angles[j] ?? 0);
      const q = onRing(w, ring, w.angles[j + step] ?? 0);
      if (Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y)) < MIN_PEG_SPACING + 4) {
        ok = false;
      }
    }
    if (ok) return step;
  }
  return 4;
}

/** The right half of a web (spokes from straight up to straight down), as points. */
function webPoints(w: Web, skipOuter: boolean): Vec2[] {
  const pts: Vec2[] = [];
  const rings = w.radii.length;
  const half = w.angles.length;
  for (let r = 0; r < rings; r++) {
    if (skipOuter && r === rings - 1) continue;
    const step = ringStep(w, r);
    for (let j = 0; j + step < half; j += step) {
      const p = onRing(w, r, w.angles[j] ?? 0);
      const q = onRing(w, r, w.angles[j + step] ?? 0);
      const t = thread(w, p, q);
      pts.push(...(j === 0 ? t : t.slice(1)));
    }
  }
  // Spoke pegs between rings, where the gap leaves room.
  for (let j = 0; j < half; j++) {
    const a = w.angles[j] ?? 0;
    for (let r = 0; r + 1 < rings; r++) {
      if (skipOuter && r + 1 === rings - 1) continue;
      const p = onRing(w, r, a);
      const q = onRing(w, r + 1, a);
      const len = Math.sqrt((q.x - p.x) * (q.x - p.x) + (q.y - p.y) * (q.y - p.y));
      const n = Math.round(len / w.spacing);
      for (let i = 1; i < n; i++) {
        pts.push({ x: p.x + ((q.x - p.x) * i) / n, y: p.y + ((q.y - p.y) * i) / n });
      }
    }
  }
  return pts;
}

export function buildWeb(ctx: TemplateContext, params: WebParams): void {
  const d = ctx.draw;
  const rings = params.rings ?? d.int(3, 5);
  const spokes = params.spokes ?? d.pick([10, 12, 14] as const);
  const sag = params.sag ?? d.float(0.05, 0.12);
  const spacing = params.spacing ?? d.float(38, 43);
  const corners = params.corners ?? d.bool(0.75);
  const outerMode = params.outer ?? (d.bool(0.3) ? 'bricks' : 'pegs');
  const box = ctx.region.box;
  // The web hangs from the top of the region; the cannon's area cuts its top open.
  const ry = Math.min(params.radius ?? d.float(205, 222), (box.y1 - box.y0) / 2 - 10);
  const aspect = params.aspect ?? d.float(1.35, 1.55);
  const cy = box.y1 - ry - 14;
  const rx = Math.min(ry * aspect, (box.x1 - box.x0) / 2 - 24);
  const radii: [number, number][] = [];
  for (let k = 1; k <= rings; k++) {
    const f = (k + 0.35) / (rings + 0.35);
    radii.push([rx * f, ry * f]);
  }
  // Spokes on the right half, straight up first, straight down last.
  const angles: number[] = [];
  for (let j = 0; j <= spokes / 2; j++) angles.push(PI / 2 - (j * 2 * PI) / spokes);
  const web: Web = { cx: CENTER_X, cy, radii, angles, sag, spacing };
  const right = webPoints(web, outerMode === 'bricks');
  for (const p of right) place(ctx, peg(p.x, p.y));
  place(ctx, peg(CENTER_X, cy));
  ctx.builder.claim({ kind: 'ellipse', x: CENTER_X, y: cy, rx: rx + 6, ry: ry + 6 });
  if (outerMode === 'bricks') {
    // The outer ring as bricks, broken at every other spoke so balls can get in.
    const [orx, ory] = radii[rings - 1] ?? [rx, ry];
    const gapAngle = 26 / Math.max(orx, ory);
    for (let j = 0; j + 1 < angles.length; j++) {
      const a0 = (angles[j] ?? 0) - (j === 0 ? 0 : gapAngle / 2);
      const a1 = (angles[j + 1] ?? 0) + gapAngle / 2;
      if (j % 2 === 1) continue;
      const pts: Vec2[] = [];
      for (let i = 0; i <= 64; i++) {
        const a = a0 + ((a1 - a0) * i) / 64;
        pts.push({ x: CENTER_X + orx * cos(a), y: cy - ory * sin(a) });
      }
      const sampler = new PathSampler({ closed: false, points: pts });
      const start = j === 0 ? 0.5 : 0;
      placeGroup(ctx, bricksAlong(sampler, start, sampler.length, { facing: 'left' }));
    }
  }
  if (corners) {
    // Quarter webs hanging from the top-left corner (mirrored to the right).
    const ccx = SIDE_LIMIT - 4;
    const ccy = TOP_LIMIT - 8;
    const cr = d.float(150, 190);
    const corner: Web = {
      cx: ccx,
      cy: ccy,
      radii: [0.42, 0.71, 1].map((f) => [cr * f * 1.15, cr * f] as const),
      angles: [-0.12, -0.5, -0.9, -1.3].map((a) => a),
      sag: sag * 0.8,
      spacing,
    };
    const drafts: ScoringDraft[] = webPoints(corner, false).map((p) => peg(p.x, p.y));
    for (const p of drafts) place(ctx, p);
  }
}
