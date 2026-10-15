// Lines traced over a level's background picture (spec 12): the shapes in the picture that a
// layout follows, as vector paths in board coordinates. The background line editor reads and
// writes this format, and Claude Code writes it when it derives lines from a picture. Each
// line produces either bricks or round pegs (spec 14.1); the outline template places them.
//
// A line is a list of control points. It is smoothed with a centripetal Catmull-Rom spline that
// passes through every point, so the curve stays on what was traced and never overshoots into
// loops or cusps between two points. A point listed in `corners` is a sharp corner: the spline
// ends there and starts again. Two neighboring breaks (corners or the ends of an open line)
// with no point between them make a straight segment, and points in a straight row smooth to a
// straight line. Only square roots and arithmetic are used, so a smoothed line is the same bits
// in every engine.

import { z } from 'zod';
import type { Vec2 } from '../level/geometry';
import type { Path } from './paths';

export const LINES_FORMAT_VERSION = 1;
export const LINE_MODES = ['bricks', 'pegs'] as const;
export type LineMode = (typeof LINE_MODES)[number];

/** Neighboring control points must be at least this far apart (px). */
export const MIN_POINT_DISTANCE = 1;
/** A smoothed line is sampled at most this far apart along each spline piece (px). */
export const SAMPLE_STEP = 2;
/** Asset ids and line ids: lowercase words joined by hyphens. */
export const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const pointSchema = z.tuple([z.number(), z.number()]);

/** The geometry of a line, as the outline template takes it. */
const geometryShape = {
  mode: z.enum(LINE_MODES),
  closed: z.boolean().default(false),
  points: z.array(pointSchema).min(2).max(400),
  /** Indices of control points that are sharp corners. */
  corners: z.array(z.int().min(0)).default([]),
  /** Peg spacing along the line (pegs only; default 41, the original's median). */
  spacing: z.number().min(34).max(80).optional(),
};

interface Geometry {
  readonly closed: boolean;
  readonly points: readonly (readonly [number, number])[];
  readonly corners: readonly number[];
}

function checkGeometry(g: Geometry, ctx: z.RefinementCtx): void {
  const n = g.points.length;
  if (g.closed && n < 3) {
    ctx.addIssue({ code: 'custom', message: 'a closed line needs 3 points', path: ['points'] });
  }
  const count = g.closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const a = g.points[i];
    const b = g.points[(i + 1) % n];
    if (a === undefined || b === undefined) continue;
    const d = Math.sqrt((b[0] - a[0]) * (b[0] - a[0]) + (b[1] - a[1]) * (b[1] - a[1]));
    if (d < MIN_POINT_DISTANCE) {
      ctx.addIssue({
        code: 'custom',
        message: `points ${i} and ${(i + 1) % n} are closer than ${MIN_POINT_DISTANCE} px`,
        path: ['points', (i + 1) % n],
      });
    }
  }
  const seen = new Set<number>();
  g.corners.forEach((c, i) => {
    if (c >= n) {
      ctx.addIssue({ code: 'custom', message: `corner ${c} is not a point`, path: ['corners', i] });
    } else if (seen.has(c)) {
      ctx.addIssue({
        code: 'custom',
        message: `corner ${c} is listed twice`,
        path: ['corners', i],
      });
    }
    seen.add(c);
  });
}

/** A line's geometry without a name: the outline template's `paths` entries. */
export const lineGeometrySchema = z.strictObject(geometryShape).superRefine(checkGeometry);
export type LineGeometry = z.output<typeof lineGeometrySchema>;
export type LineGeometryInput = z.input<typeof lineGeometrySchema>;

export const lineSchema = z
  .strictObject({
    /** Stable name; recipes and the editor refer to lines by it. */
    id: z.string().regex(SLUG),
    /** What the line follows in the picture. */
    note: z.string().optional(),
    ...geometryShape,
  })
  .superRefine(checkGeometry);
export type Line = z.output<typeof lineSchema>;

export const linesFileSchema = z
  .strictObject({
    formatVersion: z.literal(LINES_FORMAT_VERSION),
    /** Asset id of the picture the lines were traced on. */
    background: z.string().regex(SLUG),
    /** Board the coordinates refer to (x right, y down, origin at the board's top left). */
    board: z.strictObject({
      width: z.number().min(400).max(4000),
      height: z.number().min(400).max(4000),
    }),
    lines: z.array(lineSchema).max(200),
  })
  .superRefine((file, ctx) => {
    const ids = new Set<string>();
    file.lines.forEach((line, i) => {
      if (ids.has(line.id)) {
        ctx.addIssue({
          code: 'custom',
          message: `duplicate line id "${line.id}"`,
          path: ['lines', i, 'id'],
        });
      }
      ids.add(line.id);
      line.points.forEach(([x, y], j) => {
        if (x < 0 || x > file.board.width || y < 0 || y > file.board.height) {
          ctx.addIssue({
            code: 'custom',
            message: `point (${x}, ${y}) is outside the board`,
            path: ['lines', i, 'points', j],
          });
        }
      });
    });
  });
export type LinesFile = z.output<typeof linesFileSchema>;

export class LinesFormatError extends Error {
  override readonly name = 'LinesFormatError';
}

/** Validates a lines file and fills in defaults. Throws LinesFormatError. */
export function parseLines(json: unknown): LinesFile {
  const result = linesFileSchema.safeParse(json);
  if (!result.success) {
    throw new LinesFormatError(`Invalid lines file:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}

/** The geometry of the named lines, in the order given; every id must exist. */
export function linePaths(file: LinesFile, ids: readonly string[]): LineGeometryInput[] {
  const byId = new Map(file.lines.map((l) => [l.id, l]));
  return ids.map((id) => {
    const line = byId.get(id);
    if (line === undefined) throw new LinesFormatError(`no line "${id}" in the lines file`);
    const out: LineGeometryInput = { mode: line.mode, closed: line.closed, points: line.points };
    if (line.corners.length > 0) out.corners = line.corners;
    if (line.spacing !== undefined) out.spacing = line.spacing;
    return out;
  });
}

// ---------------------------------------------------------------------------------------------
// Smoothing

function dist(a: Vec2, b: Vec2): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function lerp(a: Vec2, b: Vec2, ta: number, tb: number, t: number): Vec2 {
  const u = (t - ta) / (tb - ta);
  return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
}

/**
 * Samples the centripetal Catmull-Rom piece from p1 to p2 (p0 and p3 are its neighbors), p1
 * excluded, p2 included. Knots step by the square root of each chord (Barry and Goldman's
 * pyramid), which is what keeps the curve free of cusps and self-intersections.
 */
function sampleSegment(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, out: Vec2[]): void {
  const t0 = 0;
  const t1 = t0 + Math.sqrt(dist(p0, p1));
  const t2 = t1 + Math.sqrt(dist(p1, p2));
  const t3 = t2 + Math.sqrt(dist(p2, p3));
  const steps = Math.max(1, Math.ceil(dist(p1, p2) / SAMPLE_STEP));
  for (let k = 1; k < steps; k++) {
    const t = t1 + ((t2 - t1) * k) / steps;
    const a1 = lerp(p0, p1, t0, t1, t);
    const a2 = lerp(p1, p2, t1, t2, t);
    const a3 = lerp(p2, p3, t2, t3, t);
    const b1 = lerp(a1, a2, t0, t2, t);
    const b2 = lerp(a2, a3, t1, t3, t);
    out.push(lerp(b1, b2, t1, t2, t));
  }
  out.push(p2);
}

function reflect(p: Vec2, about: Vec2): Vec2 {
  return { x: 2 * about.x - p.x, y: 2 * about.y - p.y };
}

/**
 * Samples an open run of control points from its first to its last point, both included. Two
 * points give a straight segment; the ends of a longer run continue straight past the first and
 * last point (a reflected neighbor), so a run ends along its last chord's direction.
 */
function sampleRun(q: readonly Vec2[], out: Vec2[]): void {
  const m = q.length;
  const first = q[0];
  if (first === undefined) return;
  out.push(first);
  if (m === 2) {
    const last = q[1];
    if (last !== undefined) out.push(last);
    return;
  }
  for (let i = 0; i + 1 < m; i++) {
    const p1 = q[i];
    const p2 = q[i + 1];
    if (p1 === undefined || p2 === undefined) continue;
    const p0 = q[i - 1] ?? reflect(p2, p1);
    const p3 = q[i + 2] ?? reflect(p1, p2);
    sampleSegment(p0, p1, p2, p3, out);
  }
}

/**
 * The smoothed path of a line: a polyline through every control point, sampled at most
 * SAMPLE_STEP apart along each spline piece. A closed line comes back closed, without repeating
 * its start point.
 */
export function smoothLine(line: Geometry): Path {
  const pts: Vec2[] = line.points.map(([x, y]) => ({ x, y }));
  const n = pts.length;
  const corners = [...new Set(line.corners)].filter((c) => c >= 0 && c < n).sort((a, b) => a - b);
  const out: Vec2[] = [];
  if (!line.closed) {
    const breaks = [...new Set([0, ...corners, n - 1])].sort((a, b) => a - b);
    for (let b = 0; b + 1 < breaks.length; b++) {
      const run = pts.slice(breaks[b], (breaks[b + 1] ?? n - 1) + 1);
      const piece: Vec2[] = [];
      sampleRun(run, piece);
      out.push(...(b === 0 ? piece : piece.slice(1)));
    }
    return { closed: false, points: out };
  }
  if (corners.length === 0) {
    // One spline all the way round.
    const at = (i: number): Vec2 => pts[((i % n) + n) % n] ?? { x: 0, y: 0 };
    out.push(at(0));
    for (let i = 0; i < n; i++) sampleSegment(at(i - 1), at(i), at(i + 1), at(i + 2), out);
    out.pop();
    return { closed: true, points: out };
  }
  // Start at the first corner and go round to it again, breaking at every corner.
  const start = corners[0] ?? 0;
  const ring = [...pts.slice(start), ...pts.slice(0, start)];
  const first = ring[0];
  if (first !== undefined) ring.push(first);
  const breaks = [...corners.map((c) => (c - start + n) % n), n].sort((a, b) => a - b);
  for (let b = 0; b + 1 < breaks.length; b++) {
    const run = ring.slice(breaks[b], (breaks[b + 1] ?? n) + 1);
    const piece: Vec2[] = [];
    sampleRun(run, piece);
    out.push(...(b === 0 ? piece : piece.slice(1)));
  }
  out.pop();
  return { closed: true, points: out };
}
