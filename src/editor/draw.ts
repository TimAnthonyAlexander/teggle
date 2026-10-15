// Paints the editor's board: the picture, the board's real geometry and keep-out zones, the
// generated level, what did not fit, the traced lines and the check findings. Everything is in
// board coordinates under one transform; widths are divided by the zoom so strokes stay crisp.

import type { Rejected } from '../gen/builder';
import {
  CANNON_CLEARANCE,
  CANNON_X,
  CANNON_Y,
  MIN_GAP,
  BOTTOM_LIMIT,
  SIDE_LIMIT,
  TOP_LIMIT,
} from '../gen/constants';
import type { FlipperSweep } from '../gen/flippers';
import type { Line } from '../gen/lines';
import type { Path } from '../gen/paths';
import { elementShape, filePose, type Shape } from '../gen/shapes';
import type { Issue } from '../gen/validate';
import { BOARD_X, BOARD_Y, layout } from '../game/layout';
import { isScoringElement, type Level } from '../level/schema';
import {
  BARREL_LENGTH,
  BUCKET_CATCH_HEIGHT,
  BUCKET_CATCH_WIDTH,
  BUCKET_CATCH_Y,
  BUCKET_RIM_VERTICES,
  BUCKET_RIM_X,
  BUCKET_RIM_Y,
  BUCKET_TRAVEL_INSET,
  CEILING_BOTTOM,
} from '../sim/tuning';
import type { Point } from './doc';
import type { View } from './view';

/** The picture covers the playfield opening (spec 14.2), in board coordinates. */
export const PICTURE = {
  x: layout.opening.x - BOARD_X,
  y: layout.opening.y - BOARD_Y,
  w: layout.opening.w,
  h: layout.opening.h,
};

const COLORS = {
  bg: '#141517',
  board: '#2a2c31',
  wall: '#a3a6ad',
  limit: 'rgba(240, 238, 232, 0.55)',
  zone: '#d9363e',
  peg: '#2b59c3',
  pegEdge: '#0b1430',
  never: '#8d9099',
  solid: '#4d5058',
  solidEdge: '#1b1c1f',
  pegsLine: '#0f766e',
  bricksLine: '#9a3412',
  halo: 'rgba(255, 255, 255, 0.85)',
  accent: '#f0b429',
  bad: '#e5484d',
  quick: '#ffffff',
};

export interface Layers {
  picture: boolean;
  zones: boolean;
  objects: boolean;
  lines: boolean;
  findings: boolean;
}

export interface Drawing {
  readonly points: readonly Point[];
  readonly corners: readonly number[];
  readonly cursor: Point | null;
}

export interface Findings {
  readonly issues: readonly Issue[];
  /** Objects no sweep hit (they lose can-be-orange). */
  readonly neverHit: ReadonlySet<number>;
  /** Objects the stuck check gave quick disappear. */
  readonly stuckFixed: ReadonlySet<number>;
  readonly spots: readonly {
    readonly x: number;
    readonly y: number;
    readonly count: number;
    /** Touches no peg or brick, so quick disappear cannot fix it. */
    readonly bad: boolean;
    /** Found in an earlier round and fixed with quick disappear. */
    readonly fixed: boolean;
  }[];
  /** False when the findings belong to an earlier version of the level. */
  readonly current: boolean;
}

export interface Scene {
  readonly view: View;
  readonly width: number;
  readonly height: number;
  readonly dpr: number;
  readonly board: { readonly width: number; readonly height: number };
  readonly picture: CanvasImageSource | null;
  readonly pictureOpacity: number;
  readonly layers: Layers;
  readonly sweeps: readonly FlipperSweep[];
  readonly lines: readonly Line[];
  readonly smoothed: ReadonlyMap<string, Path>;
  readonly selectedLine: string | null;
  readonly selectedPoint: number | null;
  readonly hoverLine: string | null;
  readonly drawing: Drawing | null;
  readonly level: Level | null;
  readonly lineOf: ReadonlyMap<number, string | null>;
  readonly rejected: readonly Rejected[];
  readonly selectedObject: number | null;
  readonly hoverObject: number | null;
  readonly edited: ReadonlySet<number>;
  readonly findings: Findings | null;
  /** Dims everything but the objects (the objects tool). */
  readonly objectsMode: boolean;
}

type Ctx = CanvasRenderingContext2D;

function shapePath(ctx: Ctx, s: Shape): void {
  ctx.beginPath();
  if (s.kind === 'circle') {
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    return;
  }
  s.xs.forEach((x, i) => {
    const y = s.ys[i] ?? 0;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (s.closed) ctx.closePath();
}

function polyline(ctx: Ctx, pts: readonly { x: number; y: number }[], closed: boolean): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  });
  if (closed) ctx.closePath();
}

let scratch: HTMLCanvasElement | null = null;

/** Draws shapes as one area at a uniform alpha (overlaps do not darken), optionally grown. */
function area(ctx: Ctx, scene: Scene, paint: (c: Ctx) => void, color: string, alpha: number): void {
  const w = Math.max(1, Math.round(scene.width * scene.dpr));
  const h = Math.max(1, Math.round(scene.height * scene.dpr));
  scratch ??= document.createElement('canvas');
  if (scratch.width !== w) scratch.width = w;
  if (scratch.height !== h) scratch.height = h;
  const c = scratch.getContext('2d');
  if (c === null) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, w, h);
  c.save();
  c.setTransform(ctx.getTransform());
  c.fillStyle = color;
  c.strokeStyle = color;
  paint(c);
  c.restore();
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = alpha;
  ctx.drawImage(scratch, 0, 0);
  ctx.restore();
}

function drawZones(ctx: Ctx, scene: Scene): void {
  const { width: bw, height: bh } = scene.board;
  const k = scene.view.zoom;
  // Where nothing may go: the board's margins, the bucket's strip, the cannon and the flippers'
  // swing grown by the minimum gap.
  area(
    ctx,
    scene,
    (c) => {
      c.beginPath();
      c.rect(0, 0, bw, bh);
      c.clip();
      c.fillRect(0, 0, bw, TOP_LIMIT);
      c.fillRect(0, 0, SIDE_LIMIT, bh);
      c.fillRect(bw - SIDE_LIMIT, 0, SIDE_LIMIT, bh);
      c.fillRect(0, BOTTOM_LIMIT, bw, bh - BOTTOM_LIMIT);
      c.beginPath();
      c.arc(CANNON_X, CANNON_Y, CANNON_CLEARANCE, 0, Math.PI * 2);
      c.fill();
      c.lineJoin = 'round';
      c.lineWidth = 2 * MIN_GAP;
      for (const sweep of scene.sweeps) {
        for (const p of sweep.poses) {
          shapePath(c, p);
          c.fill();
          c.stroke();
        }
      }
    },
    COLORS.zone,
    0.16,
  );
  // The flippers' swept area itself.
  area(
    ctx,
    scene,
    (c) => {
      c.beginPath();
      c.rect(0, 0, bw, bh);
      c.clip();
      for (const sweep of scene.sweeps) {
        for (const p of sweep.poses) {
          shapePath(c, p);
          c.fill();
        }
      }
    },
    COLORS.zone,
    0.3,
  );
  // Rest and raised outlines.
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, bw, bh);
  ctx.clip();
  ctx.lineWidth = 1 / k;
  ctx.strokeStyle = COLORS.zone;
  for (const sweep of scene.sweeps) {
    for (const p of [sweep.poses[0], sweep.poses[sweep.poses.length - 1]]) {
      if (p === undefined) continue;
      shapePath(ctx, p);
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawGeometry(ctx: Ctx, scene: Scene): void {
  const { width: bw, height: bh } = scene.board;
  const k = scene.view.zoom;
  // Walls and ceiling.
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 2 / k;
  ctx.beginPath();
  ctx.moveTo(0, bh + 40);
  ctx.lineTo(0, CEILING_BOTTOM);
  ctx.lineTo(bw, CEILING_BOTTOM);
  ctx.lineTo(bw, bh + 40);
  ctx.stroke();
  // Placement limits.
  ctx.setLineDash([6 / k, 5 / k]);
  ctx.strokeStyle = COLORS.limit;
  ctx.lineWidth = 1 / k;
  ctx.strokeRect(SIDE_LIMIT, TOP_LIMIT, bw - 2 * SIDE_LIMIT, BOTTOM_LIMIT - TOP_LIMIT);
  ctx.beginPath();
  ctx.arc(CANNON_X, CANNON_Y, CANNON_CLEARANCE, 0, Math.PI);
  ctx.stroke();
  // The bucket's travel at the bottom.
  const y = bh - 6;
  ctx.beginPath();
  ctx.moveTo(BUCKET_TRAVEL_INSET, y);
  ctx.lineTo(bw - BUCKET_TRAVEL_INSET, y);
  ctx.stroke();
  ctx.setLineDash([]);
  // The bucket at the middle of its path: catch box and rims.
  ctx.strokeStyle = 'rgba(163, 166, 173, 0.55)';
  ctx.lineWidth = 1 / k;
  ctx.strokeRect(
    bw / 2 - BUCKET_CATCH_WIDTH / 2,
    bh + BUCKET_CATCH_Y - BUCKET_CATCH_HEIGHT / 2,
    BUCKET_CATCH_WIDTH,
    BUCKET_CATCH_HEIGHT,
  );
  ctx.fillStyle = 'rgba(163, 166, 173, 0.55)';
  for (const side of [-1, 1]) {
    // The left rim as the physics has it; the right one is its mirror image.
    ctx.beginPath();
    BUCKET_RIM_VERTICES.forEach((v, i) => {
      const x = bw / 2 + side * BUCKET_RIM_X + (side < 0 ? v.x : -v.x);
      const y = bh + BUCKET_RIM_Y + v.y;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
  }
  // The cannon: pivot and barrel, pointing down.
  ctx.strokeStyle = COLORS.wall;
  ctx.lineWidth = 6 / k;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(CANNON_X, CANNON_Y);
  ctx.lineTo(CANNON_X, CANNON_Y + BARREL_LENGTH);
  ctx.stroke();
  ctx.lineCap = 'butt';
  ctx.fillStyle = COLORS.wall;
  ctx.beginPath();
  ctx.arc(CANNON_X, CANNON_Y, 9, 0, Math.PI * 2);
  ctx.fill();
}

function drawLevel(ctx: Ctx, scene: Scene): void {
  const level = scene.level;
  if (level === null) return;
  const k = scene.view.zoom;
  const findings = scene.findings;
  for (const e of level.elements) {
    const s = elementShape(e, filePose(e));
    if (s === null) continue;
    shapePath(ctx, s);
    if (!isScoringElement(e)) {
      if (s.kind === 'poly' && !s.closed) {
        ctx.strokeStyle = COLORS.solidEdge;
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.strokeStyle = COLORS.solid;
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.lineCap = 'butt';
      } else {
        ctx.fillStyle = COLORS.solid;
        ctx.fill();
        ctx.strokeStyle = COLORS.solidEdge;
        ctx.lineWidth = 1.2 / k;
        ctx.stroke();
      }
      continue;
    }
    const never = !e.canBeOrange || (findings?.current === true && findings.neverHit.has(e.id));
    ctx.fillStyle = never ? COLORS.never : COLORS.peg;
    ctx.globalAlpha = scene.objectsMode ? 1 : 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = COLORS.pegEdge;
    ctx.lineWidth = 1.2 / k;
    ctx.stroke();
    if (e.quickDisappear) {
      ctx.setLineDash([3 / k, 2.5 / k]);
      ctx.strokeStyle = COLORS.quick;
      ctx.lineWidth = 1.6 / k;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    const line = scene.lineOf.get(e.id) ?? null;
    const highlight =
      e.id === scene.selectedObject ||
      e.id === scene.hoverObject ||
      (line !== null && line === scene.selectedLine && !scene.objectsMode);
    if (highlight || scene.edited.has(e.id)) {
      const grow = e.id === scene.selectedObject ? 3.5 : 2;
      ctx.lineWidth = (e.id === scene.selectedObject ? 2.5 : 1.5) / k;
      ctx.strokeStyle = COLORS.accent;
      if (!highlight) ctx.setLineDash([2 / k, 2 / k]);
      if (s.kind === 'circle') {
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r + grow / k, 0, Math.PI * 2);
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawRejected(ctx: Ctx, scene: Scene): void {
  const k = scene.view.zoom;
  ctx.setLineDash([4 / k, 3 / k]);
  ctx.strokeStyle = COLORS.bad;
  ctx.lineWidth = 1.3 / k;
  for (const r of scene.rejected) {
    const d = r.draft;
    if (d.kind === 'peg') {
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius ?? 10, 0, Math.PI * 2);
      ctx.stroke();
    } else if (d.kind === 'brick' || d.kind === 'curvedBrick') {
      ctx.beginPath();
      ctx.arc(d.x, d.y, 4 / k, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.setLineDash([]);
}

function drawLines(ctx: Ctx, scene: Scene): void {
  const k = scene.view.zoom;
  const ordered = [...scene.lines].sort(
    (a, b) => Number(a.id === scene.selectedLine) - Number(b.id === scene.selectedLine),
  );
  for (const line of ordered) {
    const path = scene.smoothed.get(line.id);
    const selected = line.id === scene.selectedLine;
    const hover = line.id === scene.hoverLine;
    if (path !== undefined) {
      polyline(ctx, path.points, path.closed);
      ctx.lineJoin = 'round';
      ctx.strokeStyle = selected ? 'rgba(20, 21, 23, 0.9)' : COLORS.halo;
      ctx.lineWidth = (selected ? 5.5 : hover ? 5 : 4) / k;
      ctx.globalAlpha = scene.objectsMode && !selected ? 0.35 : 1;
      ctx.stroke();
      ctx.strokeStyle = selected
        ? COLORS.accent
        : line.mode === 'bricks'
          ? COLORS.bricksLine
          : COLORS.pegsLine;
      ctx.lineWidth = (selected ? 2.5 : hover ? 2.4 : 1.8) / k;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (!selected && !hover) continue;
    // Control polygon and points.
    ctx.setLineDash([3 / k, 3 / k]);
    ctx.strokeStyle = 'rgba(20, 21, 23, 0.55)';
    ctx.lineWidth = 1 / k;
    polyline(
      ctx,
      line.points.map(([x, y]) => ({ x, y })),
      line.closed,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    line.points.forEach(([x, y], i) => {
      const corner = line.corners.includes(i);
      const r = (corner ? 5 : 4) / k;
      ctx.beginPath();
      if (corner) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      } else {
        ctx.rect(x - r, y - r, 2 * r, 2 * r);
      }
      ctx.fillStyle = selected && i === scene.selectedPoint ? COLORS.accent : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#141517';
      ctx.lineWidth = 1.2 / k;
      ctx.stroke();
    });
    const first = line.points[0];
    if (first !== undefined) {
      ctx.font = `${12 / k}px system-ui, -apple-system, sans-serif`;
      ctx.lineWidth = 3 / k;
      ctx.strokeStyle = 'rgba(20, 21, 23, 0.85)';
      ctx.fillStyle = '#ffffff';
      ctx.strokeText(line.id, first[0] + 8 / k, first[1] - 8 / k);
      ctx.fillText(line.id, first[0] + 8 / k, first[1] - 8 / k);
    }
  }
  const d = scene.drawing;
  if (d !== null) {
    const pts = [...d.points, ...(d.cursor === null ? [] : [d.cursor])];
    ctx.setLineDash([5 / k, 4 / k]);
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 2 / k;
    polyline(
      ctx,
      pts.map(([x, y]) => ({ x, y })),
      false,
    );
    ctx.stroke();
    ctx.setLineDash([]);
    d.points.forEach(([x, y], i) => {
      ctx.beginPath();
      const r = 4 / k;
      if (d.corners.includes(i)) {
        ctx.moveTo(x, y - r);
        ctx.lineTo(x + r, y);
        ctx.lineTo(x, y + r);
        ctx.lineTo(x - r, y);
        ctx.closePath();
      } else {
        ctx.rect(x - r, y - r, 2 * r, 2 * r);
      }
      ctx.fillStyle = i === 0 ? COLORS.accent : '#ffffff';
      ctx.fill();
      ctx.strokeStyle = '#141517';
      ctx.lineWidth = 1 / k;
      ctx.stroke();
    });
  }
}

function drawFindings(ctx: Ctx, scene: Scene): void {
  const f = scene.findings;
  const level = scene.level;
  if (f === null || level === null) return;
  const k = scene.view.zoom;
  const byId = new Map(level.elements.map((e) => [e.id, e]));
  ctx.globalAlpha = f.current ? 1 : 0.4;
  ctx.strokeStyle = COLORS.bad;
  ctx.fillStyle = COLORS.bad;
  for (const issue of f.issues) {
    const a = byId.get(issue.a);
    const b = issue.b === undefined ? undefined : byId.get(issue.b);
    for (const e of [a, b]) {
      if (e === undefined) continue;
      const s = elementShape(e, filePose(e));
      if (s === null) continue;
      shapePath(ctx, s);
      ctx.lineWidth = 2.5 / k;
      ctx.stroke();
    }
    if (a !== undefined && b !== undefined) {
      ctx.lineWidth = 2 / k;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      if (issue.gap !== undefined) {
        ctx.font = `bold ${11 / k}px system-ui, sans-serif`;
        const label = issue.gap < 0 ? 'overlap' : `${issue.gap.toFixed(1)} px`;
        ctx.lineWidth = 3 / k;
        ctx.strokeStyle = 'rgba(20, 21, 23, 0.85)';
        ctx.strokeText(label, (a.x + b.x) / 2 + 6 / k, (a.y + b.y) / 2);
        ctx.fillText(label, (a.x + b.x) / 2 + 6 / k, (a.y + b.y) / 2);
        ctx.strokeStyle = COLORS.bad;
      }
    }
  }
  // Objects no shot reached: a slash across them.
  ctx.lineWidth = 2 / k;
  for (const id of f.neverHit) {
    const e = byId.get(id);
    if (e === undefined) continue;
    ctx.beginPath();
    ctx.moveTo(e.x - 7, e.y + 7);
    ctx.lineTo(e.x + 7, e.y - 7);
    ctx.stroke();
  }
  // Stuck spots: a cross with how many shots came to rest there; white where quick disappear
  // already fixed it, red where one is left.
  for (const s of f.spots) {
    const r = s.bad ? 11 : s.fixed ? 5 : 8;
    const cross = (): void => {
      ctx.beginPath();
      ctx.moveTo(s.x - r, s.y - r);
      ctx.lineTo(s.x + r, s.y + r);
      ctx.moveTo(s.x + r, s.y - r);
      ctx.lineTo(s.x - r, s.y + r);
      ctx.stroke();
    };
    ctx.lineWidth = 4.5 / k;
    ctx.strokeStyle = 'rgba(20, 21, 23, 0.85)';
    cross();
    ctx.lineWidth = (s.bad ? 3 : 2) / k;
    ctx.strokeStyle = s.fixed ? '#ffffff' : COLORS.bad;
    cross();
    if (s.count > 1) {
      ctx.font = `bold ${11 / k}px system-ui, sans-serif`;
      ctx.lineWidth = 3 / k;
      ctx.strokeStyle = 'rgba(20, 21, 23, 0.85)';
      ctx.strokeText(String(s.count), s.x + r + 2 / k, s.y - r);
      ctx.fillStyle = s.fixed ? '#ffffff' : COLORS.bad;
      ctx.fillText(String(s.count), s.x + r + 2 / k, s.y - r);
    }
  }
  ctx.globalAlpha = 1;
}

export function drawScene(ctx: Ctx, scene: Scene): void {
  const { view, dpr } = scene;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const s = view.zoom * dpr;
  ctx.setTransform(s, 0, 0, s, -view.x * s, -view.y * s);
  const { width: bw, height: bh } = scene.board;
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, bw, bh);
  if (scene.layers.picture && scene.picture !== null) {
    ctx.globalAlpha = scene.pictureOpacity;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(scene.picture, PICTURE.x, PICTURE.y, PICTURE.w, PICTURE.h);
    ctx.globalAlpha = 1;
  }
  if (scene.layers.zones) drawZones(ctx, scene);
  drawGeometry(ctx, scene);
  if (scene.layers.objects) {
    drawLevel(ctx, scene);
    drawRejected(ctx, scene);
  }
  if (scene.layers.lines) drawLines(ctx, scene);
  if (scene.layers.findings) drawFindings(ctx, scene);
}
