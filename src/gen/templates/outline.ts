// Picture outline (spec 9 and 12): bricks or round pegs along vector paths. The background line
// editor will feed it drawn lines ('paths'); until then procedural shapes drive it ('shapes',
// or a seed-picked 'preset' composition). The generator decides the spacing: a brick chain is
// straight bricks where the path is straight and curved bricks where it bends (place.ts), pegs
// sit at an even spacing.
//
// A shape centered on the board is built as its right half and mirrored, so it comes out
// exactly symmetric; a shape off the center line can be mirrored to the other side.

import { z } from 'zod';
import { cos, HALF_PI, PI, sin } from '../../core/dmath';
import type { Vec2 } from '../../level/geometry';
import { BRICK_WIDTH, CENTER_X, MIN_GAP, PEG_SPACING, SEAM } from '../constants';
import type { ScoringDraft } from '../draft';
import { bricksAlong, bricksAround, pegsBetween, pointsAlong, peg } from '../place';
import {
  ellipsePath,
  flowerPath,
  heartPath,
  letterPaths,
  PathSampler,
  smoothPath,
  starPath,
  type Path,
} from '../paths';
import { place, placeGroup, type TemplateContext } from '../template';

const MODES = ['bricks', 'pegs'] as const;
export const OUTLINE_SHAPES = [
  'heart',
  'star',
  'circle',
  'ellipse',
  'flower',
  'wave',
  'arc',
  'infinity',
  'word',
] as const;
export const OUTLINE_PRESETS = ['heart', 'stars', 'waves', 'flower', 'infinity'] as const;

const shapeSchema = z.strictObject({
  shape: z.enum(OUTLINE_SHAPES),
  mode: z.enum(MODES),
  /** Center of the shape. */
  x: z.number(),
  y: z.number(),
  /** Overall width. */
  size: z.number().min(40).max(900),
  /** Height for ellipses, arcs and infinity signs; wave amplitude for waves. */
  height: z.number().min(10).max(500).optional(),
  /** Star points, flower petals, or whole waves. */
  count: z.number().min(1).max(12).optional(),
  /** Inner radius share for stars, petal depth for flowers. */
  depth: z.number().min(0.1).max(0.9).optional(),
  /** Arc span in radians (centered on straight up). */
  span: z.number().min(0.3).max(6.2).optional(),
  /** Letters for 'word'. */
  text: z.string().min(1).max(8).optional(),
  /** Peg spacing along the path. */
  spacing: z.number().min(34).max(80).optional(),
  /** Opening left at the bottom of a closed shape (and at a heart's top notch). */
  gap: z.number().min(0).max(120).optional(),
  /** Also place the mirror image (for shapes off the center line). */
  mirror: z.boolean().optional(),
});

const pathSchema = z.strictObject({
  points: z.array(z.tuple([z.number(), z.number()])).min(2),
  closed: z.boolean(),
  mode: z.enum(MODES),
  spacing: z.number().min(34).max(80).optional(),
  /** Chaikin smoothing passes (drawn lines; default 3). */
  smooth: z.int().min(0).max(6).optional(),
});

export const outlineParams = z
  .strictObject({
    preset: z.enum(OUTLINE_PRESETS),
    shapes: z.array(shapeSchema).max(12),
    /** Lines from the background line editor, in board coordinates. */
    paths: z.array(pathSchema).max(40),
  })
  .partial();

export type OutlineParams = z.infer<typeof outlineParams>;
export type OutlineShape = z.infer<typeof shapeSchema>;

const SAMPLES = 480;

function sampled(f: (t: number) => Vec2, n = SAMPLES): Path {
  const points: Vec2[] = [];
  for (let i = 0; i <= n; i++) points.push(f(i / n));
  return { closed: false, points };
}

/**
 * The right half of a symmetric shape centered on CENTER_X as an open path from its top (on
 * the center line) clockwise to its bottom (on the center line), or null for shapes that are
 * not built that way.
 */
function rightHalf(s: OutlineShape): Path | null {
  const w = s.size;
  const h = s.height ?? w;
  const cx = CENTER_X;
  switch (s.shape) {
    case 'heart':
      return halfOf(heartPath(cx, s.y, w));
    case 'circle':
      return halfOf(ellipsePath(cx, s.y, w / 2, w / 2));
    case 'ellipse':
      return halfOf(ellipsePath(cx, s.y, w / 2, h / 2));
    case 'star': {
      // Odd point counts keep a point up and a notch down, both on the center line.
      const n = Math.round(s.count ?? 5);
      return halfOf(
        starPath(
          cx,
          s.y,
          w / 2,
          (w / 2) * (s.depth ?? 0.5),
          n % 2 === 1 ? n : n + 1,
          starSharpness(s),
        ),
      );
    }
    case 'flower':
      return halfOf(flowerPath(cx, s.y, w / 2, Math.round(s.count ?? 6), s.depth ?? 0.3));
    default:
      return null;
  }
}

/**
 * Star points: rounder for bricks, whose chain cannot follow a bend much tighter than the
 * original's smallest curved brick, narrower for pegs.
 */
function starSharpness(s: OutlineShape): number {
  return s.mode === 'bricks' ? 1 : 2;
}

/** First half of a closed path that starts at its top and is symmetric about x = its start. */
function halfOf(p: Path): Path {
  const n = p.points.length;
  return { closed: false, points: [...p.points.slice(0, Math.floor(n / 2) + 1)] };
}

function full(s: OutlineShape): { path: Path; centered: boolean }[] {
  const w = s.size;
  const h = s.height ?? w;
  switch (s.shape) {
    case 'wave': {
      // A cosine wave centered on x, so it is symmetric about its middle.
      const waves = s.count ?? 2;
      const amp = s.height ?? 30;
      return [
        {
          path: sampled((t) => ({
            x: s.x - w / 2 + w * t,
            y: s.y - amp * cos((t - 0.5) * waves * 2 * PI),
          })),
          centered: true,
        },
      ];
    }
    case 'arc': {
      const span = s.span ?? PI;
      const r = w / 2 / Math.max(0.2, sin(Math.min(span / 2, HALF_PI)));
      const cy = s.y + r;
      return [
        {
          path: sampled((t) => {
            const a = HALF_PI + span / 2 - span * t;
            return { x: s.x + r * cos(a), y: cy - r * sin(a) };
          }),
          centered: true,
        },
      ];
    }
    case 'infinity': {
      // Right lobe from the crossing round and back; the left lobe is its mirror image.
      return [
        {
          path: sampled((t) => {
            const a = -HALF_PI + PI * t;
            return { x: s.x + (w / 2) * cos(a), y: s.y - (h / 2) * sin(2 * a) };
          }),
          centered: false,
        },
      ];
    }
    case 'word': {
      const text = s.text ?? 'TEG';
      const letterH = h;
      const letterW = letterH / 1.4;
      const gap = letterW * 0.45;
      const total = text.length * letterW + (text.length - 1) * gap;
      const out: { path: Path; centered: boolean }[] = [];
      for (let i = 0; i < text.length; i++) {
        const x = s.x - total / 2 + i * (letterW + gap);
        for (const p of letterPaths(text[i] ?? '', x, s.y - letterH / 2, letterH)) {
          out.push({ path: p, centered: false });
        }
      }
      return out;
    }
    default:
      return [];
  }
}

/**
 * Arc length from one end of a right-half path at which a brick chain clears its mirror image.
 * A path that meets the center line square-on joins its mirror at a seam (0); one that meets it
 * at a slant (a heart's notch and tip) has to stop short.
 */
function clearOfAxis(sampler: PathSampler, fromEnd: boolean): number {
  const L = sampler.length;
  const need = BRICK_WIDTH / 2 + MIN_GAP / 2 + 1;
  const t0 = sampler.tangent(fromEnd ? L - 0.5 : 0.5);
  if (Math.abs(t0.y) < 0.3) return 0;
  for (let s = 0; s < L / 2; s += 0.5) {
    const p = sampler.at(fromEnd ? L - s : s);
    if (Math.abs(p.x - CENTER_X) >= need) return s;
  }
  return L / 2;
}

/**
 * Claims the area of a peg outline, so a fill does not run through it and blur its shape:
 * an ellipse over a closed outline's box, the box itself for an open line.
 */
function claimOutline(
  ctx: TemplateContext,
  points: readonly Vec2[],
  closed: boolean,
  mirror: boolean,
): void {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const boxes = [{ minX, maxX }];
  if (mirror) boxes.push({ minX: 2 * CENTER_X - maxX, maxX: 2 * CENTER_X - minX });
  for (const b of boxes) {
    if (closed) {
      ctx.builder.claim({
        kind: 'ellipse',
        x: (b.minX + b.maxX) / 2,
        y: (minY + maxY) / 2,
        rx: (b.maxX - b.minX) / 2 + 6,
        ry: (maxY - minY) / 2 + 6,
      });
    } else {
      ctx.builder.claim({
        kind: 'box',
        minX: b.minX,
        maxX: b.maxX,
        minY: minY - 6,
        maxY: maxY + 6,
      });
    }
  }
}

function buildShape(ctx: TemplateContext, s: OutlineShape): void {
  const spacing = s.spacing ?? PEG_SPACING;
  const half = Math.abs(s.x - CENTER_X) < 1 ? rightHalf(s) : null;
  if (s.mode === 'pegs' && half !== null) {
    const both = [...half.points, ...half.points.map((p) => ({ x: 2 * CENTER_X - p.x, y: p.y }))];
    claimOutline(ctx, both, true, false);
  }
  if (half !== null) {
    const sampler = new PathSampler(half);
    const L = sampler.length;
    const gap = s.gap ?? 0;
    const mirrored = { ...ctx, region: { ...ctx.region, mirrored: true } };
    if (s.mode === 'bricks') {
      const start = Math.max(clearOfAxis(sampler, false), s.shape === 'heart' ? gap / 2 : 0);
      const end = L - Math.max(clearOfAxis(sampler, true), gap / 2);
      placeGroup(
        mirrored,
        bricksAlong(sampler, start + SEAM / 2, end - SEAM / 2, { facing: 'left' }),
      );
    } else {
      const topGap = s.shape === 'heart' ? gap : 0;
      const start = topGap > 0 ? topGap / 2 + MIN_GAP : 0;
      const end = gap > 0 ? L - gap / 2 - MIN_GAP : L;
      for (const p of pegsBetween(sampler, start, end, spacing)) place(mirrored, p);
    }
    return;
  }
  // Off-center closed shapes and the open ones.
  const closed: Path | null =
    s.shape === 'heart'
      ? heartPath(s.x, s.y, s.size)
      : s.shape === 'circle'
        ? ellipsePath(s.x, s.y, s.size / 2, s.size / 2)
        : s.shape === 'ellipse'
          ? ellipsePath(s.x, s.y, s.size / 2, (s.height ?? s.size) / 2)
          : s.shape === 'star'
            ? starPath(
                s.x,
                s.y,
                s.size / 2,
                (s.size / 2) * (s.depth ?? 0.5),
                Math.round(s.count ?? 5),
                starSharpness(s),
              )
            : s.shape === 'flower'
              ? flowerPath(s.x, s.y, s.size / 2, Math.round(s.count ?? 6), s.depth ?? 0.3)
              : null;
  const region = { ...ctx.region, mirrored: s.mirror === true };
  const c = { ...ctx, region };
  if (closed !== null) {
    if (s.mode === 'pegs') {
      claimOutline(ctx, closed.points, true, region.mirrored);
      for (const p of pointsAlong(closed, { spacing })) place(c, peg(p.x, p.y));
    } else if ((s.gap ?? 0) > 0) {
      // Open at the bottom: run from just past the bottom all the way round to just before it
      // (closed paths start at the top, so the bottom is half way).
      const sampler = new PathSampler(closed);
      const L = sampler.length;
      const g = s.gap ?? 0;
      placeGroup(c, bricksAlong(sampler, L / 2 + g / 2, L + L / 2 - g / 2, { facing: 'left' }));
    } else {
      placeGroup(c, bricksAround(closed, { facing: 'left' }));
    }
    return;
  }
  for (const part of full(s)) {
    const centered = part.centered && Math.abs(s.x - CENTER_X) < 1;
    const sampler = new PathSampler(part.path);
    const L = sampler.length;
    // Centered open shapes: build from the middle out and mirror. Lobes and strokes: as is.
    const mirror = centered ? true : s.shape === 'infinity' ? true : region.mirrored;
    const cc = { ...ctx, region: { ...ctx.region, mirrored: mirror } };
    if (s.mode === 'pegs') {
      claimOutline(ctx, part.path.points, false, mirror && !centered);
      if (centered) {
        for (const p of pegsBetween(sampler, L / 2, L, spacing)) place(cc, p);
      } else {
        const inset = s.shape === 'infinity' ? spacing / 2 : 0;
        for (const p of pegsBetween(sampler, inset, L - inset, spacing)) place(cc, p);
      }
    } else {
      const start = centered ? L / 2 + SEAM / 2 : s.shape === 'infinity' ? 22 : 0;
      const end = s.shape === 'infinity' ? L - 22 : L;
      placeGroup(cc, bricksAlong(sampler, start, end, { facing: 'left' }));
    }
  }
}

function buildPath(ctx: TemplateContext, p: z.infer<typeof pathSchema>): void {
  const raw: Path = { closed: p.closed, points: p.points.map(([x, y]) => ({ x, y })) };
  const path = smoothPath(raw, p.smooth ?? 3);
  const c = { ...ctx, region: { ...ctx.region, mirrored: false } };
  if (p.mode === 'pegs') {
    for (const q of pointsAlong(path, { spacing: p.spacing ?? PEG_SPACING }))
      place(c, peg(q.x, q.y));
    return;
  }
  const bricks: ScoringDraft[] = p.closed
    ? bricksAround(path, { facing: 'left' })
    : bricksAlong(path, 0, new PathSampler(path).length, { facing: 'left' });
  for (const b of bricks) place(c, b);
}

/** Seed-picked compositions of procedural shapes. */
function preset(ctx: TemplateContext, name: (typeof OUTLINE_PRESETS)[number]): OutlineShape[] {
  const d = ctx.draw;
  const box = ctx.region.box;
  const midY = (box.y0 + box.y1) / 2 + 30;
  switch (name) {
    case 'heart': {
      // The heart's tip sits 19.5 units of width / 32 below its reference point.
      const size = d.float(330, 380);
      const y = box.y1 - 14 - (19.5 * size) / 32;
      return [
        { shape: 'heart', mode: 'bricks', x: CENTER_X, y, size, gap: 30 },
        {
          shape: 'star',
          mode: 'pegs',
          x: box.x0 + 124,
          y: box.y0 + 128,
          size: d.float(205, 225),
          count: 5,
          depth: 0.5,
          spacing: 34,
          mirror: true,
        },
        {
          shape: 'wave',
          mode: 'pegs',
          x: CENTER_X,
          y: box.y1 - 40,
          size: box.x1 - box.x0 - 40,
          height: 14,
          count: 4,
          spacing: 40,
        },
      ];
    }
    case 'stars':
      return [
        {
          shape: 'star',
          mode: 'bricks',
          x: CENTER_X,
          y: midY,
          size: d.float(330, 370),
          count: 5,
          depth: 0.48,
        },
        {
          shape: 'circle',
          mode: 'pegs',
          x: box.x0 + 110,
          y: midY + 40,
          size: 150,
          mirror: true,
          spacing: 38,
        },
      ];
    case 'waves':
      return [0.22, 0.52, 0.82].map((f, i) => ({
        shape: 'wave' as const,
        mode: i === 1 ? ('bricks' as const) : ('pegs' as const),
        x: CENTER_X,
        y: box.y0 + (box.y1 - box.y0) * f,
        size: box.x1 - box.x0 - 30 - (i === 0 ? 300 : 0),
        height: 34,
        count: i === 1 ? 2 : 3,
      }));
    case 'flower':
      return [
        {
          shape: 'flower',
          mode: 'bricks',
          x: CENTER_X,
          y: midY,
          size: d.float(320, 360),
          count: 6,
          depth: 0.32,
        },
        {
          shape: 'heart',
          mode: 'pegs',
          x: box.x0 + 115,
          y: midY - 20,
          size: 150,
          mirror: true,
          spacing: 36,
        },
      ];
    case 'infinity':
      return [
        {
          shape: 'infinity',
          mode: 'bricks',
          x: CENTER_X,
          y: midY,
          size: d.float(620, 700),
          height: 260,
        },
      ];
  }
}

export function buildOutline(ctx: TemplateContext, params: OutlineParams): void {
  const shapes =
    params.shapes ??
    (params.paths === undefined
      ? preset(ctx, params.preset ?? ctx.draw.pick(OUTLINE_PRESETS))
      : []);
  for (const s of shapes) buildShape(ctx, s);
  for (const p of params.paths ?? []) buildPath(ctx, p);
}
