// The free ball bucket with its Pyramid and Fireball variants, the catch light, the five Fever
// buckets with their separator discs and value hoods, and the flippers (guide 6, spec 4, 6, 7).
// Shapes that the ball can touch use the physics constants from src/sim/tuning.ts.

import { curvedBrickVertices, type Vec2 } from '../../level/geometry';
import {
  COVER_INNER_RADIUS,
  COVER_POINTS,
  COVER_ROTATION,
  COVER_SECTOR,
  COVER_WIDTH,
  COVER_Y,
  FEVER_DIVIDER_RADIUS,
  FEVER_DIVIDER_X,
  FEVER_HOLE_WIDTH,
  FEVER_HOLE_X,
  FLIPPER_LEFT_PIVOT,
  FLIPPER_LEFT_VERTICES,
  FLIPPER_RIGHT_PIVOT,
  FLIPPER_RIGHT_VERTICES,
  ORIGINAL_BOARD_WIDTH,
  PYRAMID_VERTICES,
  PYRAMID_X,
  PYRAMID_Y,
} from '../../sim/tuning';
import { BOARD_H, BOARD_W, BOARD_X, BOARD_Y, layout } from '../layout';
import { darken, rgba } from '../ui/color';
import { drawTextOnArc, formatNumber } from '../ui/text';
import { color } from '../ui/tokens';
import { drawLayer, layers, type Layer } from './cache';
import { circlePath, linear, radial, rivet, type Ctx, type PathFn } from './paint';

const BOARD_BOTTOM = BOARD_Y + BOARD_H;
const COPPER_HI = '#f2d7a8';
const COPPER = '#c98e55';
const COPPER_LO = '#7d4a22';
const TEAL = '#3d8a96';

function polygon(ctx: Ctx, pts: readonly Vec2[], ox: number, oy: number, mirror = false): void {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const x = ox + (mirror ? -p.x : p.x);
    const y = oy + p.y;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function paintBucket(ctx: Ctx): void {
  // Local frame: (0, 0) = bucket art center (world y 580).
  // Copper skirt, wider at the bottom, sliding under the bottom rim.
  const skirt: PathFn = (c) => {
    c.beginPath();
    c.moveTo(-86, 16);
    c.quadraticCurveTo(-78, 4, -58, 1);
    c.lineTo(58, 1);
    c.quadraticCurveTo(78, 4, 86, 16);
    c.closePath();
  };
  skirt(ctx);
  ctx.fillStyle = linear(ctx, -86, 0, 86, 0, [
    [0, COPPER_LO],
    [0.18, COPPER],
    [0.36, COPPER_HI],
    [0.6, COPPER],
    [1, COPPER_LO],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#3d2410';
  ctx.stroke();
  // Teal struts from the rim down to the skirt.
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * 55, 2);
    ctx.quadraticCurveTo(s * 60, 9, s * 70, 13);
    ctx.lineCap = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = '#123c44';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = TEAL;
    ctx.stroke();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = 'rgba(190,240,245,0.7)';
    ctx.stroke();
  }
  // Rim and opening.
  ctx.beginPath();
  ctx.ellipse(0, -1, 62, 8.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, 0, -9.5, 0, 7.5, [
    [0, '#8fd0da'],
    [0.35, TEAL],
    [0.75, '#1f5a64'],
    [1, '#0d3038'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#082228';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, -1.5, 54, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = radial(ctx, 0, 0, 2, 0, -1.5, 54, [
    [0, '#000000'],
    [0.85, '#050708'],
    [1, '#1b2a2e'],
  ]);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(-6, -7, 40, 1.5, 0, Math.PI * 1.05, Math.PI * 1.95);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = 'rgba(220,255,255,0.75)';
  ctx.stroke();
}

// The Pyramid power: a wide, solid pyramid of sandstone courses with the bucket set into its top,
// as in the 2007 look (guide 6.1). Its sloped top is the physics outline's top edge (from the
// slope's inner high corner out to its tip, vertices 1 and 2), and it is solid down to the
// board's bottom edge. Local frame: x from the bucket center, y from the board's bottom edge.
const PYRAMID_INNER = PYRAMID_VERTICES[1] ?? { x: 45.33334, y: -14 };
const PYRAMID_TIP = PYRAMID_VERTICES[2] ?? { x: -72.99998, y: 1.66669 };
/** Where the slope meets the flat top under the bucket, and where it ends, left side. */
const PYR_TOP = { x: -PYRAMID_X + PYRAMID_INNER.x, y: PYRAMID_Y + PYRAMID_INNER.y };
const PYR_TIP = { x: -PYRAMID_X + PYRAMID_TIP.x, y: PYRAMID_Y + PYRAMID_TIP.y };
/** Depth of one course of stones, and the stagger of their joints. */
const COURSE = 5.2;
const STONE = 23;

/** The pyramid's top at local x: the flat top under the bucket, the slopes either side. */
function pyramidTop(x: number): number {
  const ax = Math.abs(x);
  if (ax <= -PYR_TOP.x) return PYR_TOP.y;
  const f = (ax + PYR_TOP.x) / (PYR_TOP.x - PYR_TIP.x);
  return PYR_TOP.y + (PYR_TIP.y - PYR_TOP.y) * f;
}

function pyramidPath(ctx: Ctx): void {
  ctx.beginPath();
  ctx.moveTo(PYR_TIP.x, 0.5);
  ctx.lineTo(PYR_TIP.x, PYR_TIP.y);
  ctx.lineTo(PYR_TOP.x, PYR_TOP.y);
  ctx.lineTo(-PYR_TOP.x, PYR_TOP.y);
  ctx.lineTo(-PYR_TIP.x, PYR_TIP.y);
  ctx.lineTo(-PYR_TIP.x, 0.5);
  ctx.closePath();
}

function paintPyramid(ctx: Ctx): void {
  // Sandstone, sunlit at the top and in shade toward the floor.
  pyramidPath(ctx);
  ctx.fillStyle = linear(ctx, 0, PYR_TOP.y, 0, 0, [
    [0, '#fff0b4'],
    [0.22, '#f2c65a'],
    [0.6, '#d29634'],
    [1, '#8a5216'],
  ]);
  ctx.fill();
  ctx.save();
  pyramidPath(ctx);
  ctx.clip();
  // Courses of stones following the slopes, every other one a shade lighter.
  const x0 = PYR_TIP.x;
  const x1 = -PYR_TIP.x;
  for (let c = 0; c * COURSE < -PYR_TOP.y; c++) {
    const top = c * COURSE;
    if (c % 2 === 1) {
      ctx.beginPath();
      courseLine(ctx, x0, x1, top, false);
      courseLine(ctx, x0, x1, top + COURSE, true);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,240,190,0.16)';
      ctx.fill();
    }
    // Mortar under the course, with a lit lip below it.
    ctx.beginPath();
    courseLine(ctx, x0, x1, top + COURSE, false);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = 'rgba(96,52,10,0.62)';
    ctx.stroke();
    ctx.beginPath();
    courseLine(ctx, x0, x1, top + COURSE + 0.9, false);
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = 'rgba(255,236,170,0.35)';
    ctx.stroke();
    // Joints between the stones, staggered course to course.
    ctx.beginPath();
    for (let x = x0 + (c % 2 === 0 ? 0 : STONE / 2); x < x1; x += STONE) {
      const y = pyramidTop(x) + top;
      ctx.moveTo(x, y + 0.6);
      ctx.lineTo(x, y + COURSE);
    }
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(96,52,10,0.5)';
    ctx.stroke();
  }
  ctx.restore();
  // Sunlit edge along the top, and the outline.
  ctx.beginPath();
  ctx.moveTo(PYR_TIP.x + 1, PYR_TIP.y + 1);
  ctx.lineTo(PYR_TOP.x, PYR_TOP.y + 1);
  ctx.lineTo(-PYR_TOP.x, PYR_TOP.y + 1);
  ctx.lineTo(-PYR_TIP.x - 1, PYR_TIP.y + 1);
  ctx.lineWidth = 1.8;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255,252,222,0.95)';
  ctx.stroke();
  pyramidPath(ctx);
  ctx.lineWidth = 1.1;
  ctx.strokeStyle = '#3d2006';
  ctx.stroke();
}

/** A course line `depth` below the pyramid's top, across [x0, x1] or back when `reverse`. */
function courseLine(ctx: Ctx, x0: number, x1: number, depth: number, reverse: boolean): void {
  const xs = [x0, PYR_TOP.x, -PYR_TOP.x, x1];
  if (reverse) xs.reverse();
  xs.forEach((x, i) => {
    const y = pyramidTop(x) + depth;
    if (i === 0 && !reverse) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
}

const PYRAMID_BOX = {
  x: PYR_TIP.x - 3,
  y: PYR_TOP.y - 3,
  w: 2 * -PYR_TIP.x + 6,
  h: -PYR_TOP.y + 4,
};

function pyramidLayer(k: number): Layer {
  const b = PYRAMID_BOX;
  return layers.get('bucket:pyramid', k, b.x, b.y, b.w, b.h, paintPyramid);
}

function paintCover(ctx: Ctx): void {
  // Fireball dome: the physics cover is a curved brick; draw its outline as a tan metal dome.
  const pts = curvedBrickVertices(COVER_INNER_RADIUS, COVER_WIDTH, COVER_SECTOR, COVER_POINTS);
  const c = Math.cos(COVER_ROTATION);
  const s = Math.sin(COVER_ROTATION);
  const world = pts.map((p) => ({ x: p.x * c + p.y * s, y: -p.x * s + p.y * c }));
  polygon(ctx, world, 0, 0);
  ctx.fillStyle = linear(ctx, 0, -8, 0, 8, [
    [0, '#fff3d6'],
    [0.4, '#e8c89a'],
    [1, '#9a6f3c'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#4a2f12';
  ctx.stroke();
  rivet(ctx, -40, 0.5, 1.8);
  rivet(ctx, 40, 0.5, 1.8);
}

export interface BucketState {
  /** Bucket center x in world units. */
  readonly x: number;
  readonly pyramid?: boolean;
  readonly covered?: boolean;
}

export function drawBucket(ctx: Ctx, k: number, s: BucketState): void {
  if (s.pyramid === true) drawLayer(ctx, pyramidLayer(k), s.x, BOARD_BOTTOM);
  drawLayer(ctx, bucketLayer(k), s.x, layout.bucketY);
  if (s.covered === true) drawLayer(ctx, coverLayer(k), s.x, BOARD_BOTTOM + COVER_Y);
}

function bucketLayer(k: number): Layer {
  return layers.get('bucket', k, -90, -12, 180, 32, paintBucket);
}

function coverLayer(k: number): Layer {
  return layers.get('bucket:cover', k, -66, -12, 132, 24, paintCover);
}

/**
 * Builds the bucket's layers (with the Pyramid and the dome) and the flippers' at resolution
 * `k`, so a power that brings them out does not wait for them on its first frame.
 */
export function prebuildBucketLayers(k: number): void {
  bucketLayer(k);
  pyramidLayer(k);
  coverLayer(k);
  flipperLayers(k);
}

export const CATCH_GLOW_MS = 700;

/** White light cone rising from the bucket on a catch (6.1). */
export function drawCatchGlow(ctx: Ctx, x: number, tMs: number): void {
  if (tMs < 0 || tMs >= CATCH_GLOW_MS) return;
  const t = tMs / CATCH_GLOW_MS;
  const a = t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85;
  const y = layout.bucketY - 2;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.moveTo(x - 54, y);
  ctx.lineTo(x - 80, y - 86);
  ctx.lineTo(x + 80, y - 86);
  ctx.lineTo(x + 54, y);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, y, 0, y - 86, [
    [0, `rgba(255,255,255,${0.8 * a})`],
    [0.5, `rgba(220,250,255,${0.3 * a})`],
    [1, 'rgba(200,240,255,0)'],
  ]);
  ctx.fill();
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Fever buckets (6.2)

export interface FeverBucketLayout {
  readonly dividers: readonly number[];
  readonly dividerRadius: number;
  readonly holes: readonly { readonly x: number; readonly w: number }[];
}

/** Fever bucket tops sit where the original's do: 31 units above the screen bottom (6.2). */
const FEVER_DIVIDER_TOP = 569;

/** The physics layout: the original's x positions and sizes scaled to the board width. */
export function feverBucketLayout(): FeverBucketLayout {
  const s = BOARD_W / ORIGINAL_BOARD_WIDTH;
  return {
    dividers: FEVER_DIVIDER_X.map((x) => BOARD_X + x * s),
    dividerRadius: FEVER_DIVIDER_RADIUS * s,
    holes: FEVER_HOLE_X.map((x) => ({ x: BOARD_X + x * s, w: FEVER_HOLE_WIDTH * s })),
  };
}

export const FEVER_VALUES = [10_000, 50_000, 100_000, 50_000, 10_000] as const;
export const FEVER_VALUES_FULL_CLEAR = [100_000, 100_000, 100_000, 100_000, 100_000] as const;

function paintDivider(ctx: Ctx, r: number): void {
  // Polished gold disc, half above the floor, with a teal hub.
  ctx.save();
  ctx.beginPath();
  ctx.rect(-r - 2, -r - 2, 2 * r + 4, r + 2);
  ctx.clip();
  circlePath(ctx, 0, 0, r);
  ctx.fillStyle = radial(ctx, -r * 0.25, -r * 0.55, 2, 0, 0, r, [
    [0, '#fff6dc'],
    [0.3, '#f0cf8a'],
    [0.65, '#c9933f'],
    [0.9, '#8f5a22'],
    [1, '#5a3410'],
  ]);
  ctx.fill();
  // Spun-metal sheen.
  for (const a of [-2.2, -1.2]) {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, r, a, a + 0.28);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,240,0.28)';
    ctx.fill();
  }
  circlePath(ctx, 0, 0, r);
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#3d2208';
  ctx.stroke();
  circlePath(ctx, 0, 0, r * 0.3);
  ctx.fillStyle = radial(ctx, -3, -4, 0, 0, 0, r * 0.3, [
    [0, '#9fe0e8'],
    [0.5, TEAL],
    [1, '#0d3038'],
  ]);
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function paintHole(ctx: Ctx, w: number, value: number, lit: boolean): void {
  // Teal hood arching over a dark hole, the value lettered along the arch.
  const hw = w / 2;
  const hoodR = hw + 4;
  ctx.beginPath();
  ctx.ellipse(0, 6, hoodR, 34, 0, Math.PI, Math.PI * 2);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, 0, -28, 0, 6, [
    [0, lit ? '#7fe3ef' : '#4fa5b1'],
    [0.5, lit ? '#2f9fb0' : '#22707c'],
    [1, '#0f3940'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#d9b77a';
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#2a1606';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 6, hw * 0.92, 5, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#020304';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = TEAL;
  ctx.stroke();
  const text = formatNumber(value);
  const style = lit
    ? {
        cap: 12,
        fill: [
          [0, '#fffbd0'],
          [0.5, '#ffd84a'],
          [1, '#ff8a10'],
        ] as const,
        outline: { color: '#4a1400', width: 1.6 },
        glow: { color: 'rgba(255,150,30,0.9)', blur: 6 },
      }
    : {
        cap: 12,
        fill: [
          [0, '#3a2412'],
          [1, '#120a04'],
        ] as const,
        outline: { color: 'rgba(240,215,170,0.85)', width: 1.1 },
      };
  drawTextOnArc(ctx, text, 0, 48, 57, 0, style, { maxAngle: Math.min(1.4, (w * 0.85) / 57) });
}

export interface FeverBucketsState {
  readonly fullClear?: boolean;
  /** Index of the bucket the ball landed in, lit. */
  readonly litIndex?: number;
  /** How far the buckets have risen, 0 (hidden below) to 1 (in place). */
  readonly rise?: number;
}

export function drawFeverBuckets(ctx: Ctx, k: number, s: FeverBucketsState): void {
  const lay = feverBucketLayout();
  const values = s.fullClear === true ? FEVER_VALUES_FULL_CLEAR : FEVER_VALUES;
  const drop = (1 - Math.max(0, Math.min(1, s.rise ?? 1))) * 40;
  lay.holes.forEach((h, i) => {
    const lit = s.litIndex === i;
    const v = values[i] ?? 0;
    const layer = layers.get(
      `fever:hole:${Math.round(h.w)}:${v}:${lit ? 1 : 0}`,
      k,
      -h.w / 2 - 8,
      -36,
      h.w + 16,
      50,
      (c) => {
        paintHole(c, h.w, v, lit);
      },
    );
    drawLayer(ctx, layer, h.x, 580 + drop);
  });
  const r = lay.dividerRadius;
  const d = layers.get(
    `fever:divider:${r.toFixed(2)}`,
    k,
    -r - 2,
    -r - 2,
    2 * r + 4,
    r + 4,
    (c) => {
      paintDivider(c, r);
    },
  );
  for (const x of lay.dividers) drawLayer(ctx, d, x, FEVER_DIVIDER_TOP + r + drop);
}

/** Orange-yellow light rising from the Fever bucket the ball landed in. */
export function drawFeverLandingGlow(ctx: Ctx, index: number, tMs: number): void {
  const h = feverBucketLayout().holes[index];
  if (h === undefined || tMs < 0 || tMs > 1600) return;
  const a = tMs < 200 ? tMs / 200 : 1 - (tMs - 200) / 1400;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, h.x, 586, 4, h.x, 560, 70, [
    [0, rgba('#fff2b0', 0.9 * a)],
    [0.4, rgba('#ffb030', 0.5 * a)],
    [1, rgba('#ff6000', 0)],
  ]);
  ctx.fillRect(h.x - 80, 480, 160, 120);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Flippers (spec 7, Lobster)

function paintFlipper(ctx: Ctx, verts: readonly Vec2[]): void {
  polygon(ctx, verts, 0, 0);
  ctx.fillStyle = linear(ctx, 0, -24, 0, 30, [
    [0, '#ffb39a'],
    [0.3, '#ef5a3a'],
    [0.7, '#b8261a'],
    [1, '#6a0f0a'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#3a0604';
  ctx.stroke();
  // Gloss along the top edge.
  ctx.save();
  polygon(ctx, verts, 0, 0);
  ctx.clip();
  ctx.translate(2, 4);
  polygon(ctx, verts, 0, 0);
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(255,230,210,0.35)';
  ctx.stroke();
  ctx.restore();
  // Brass pivot cap.
  circlePath(ctx, 0, 0, 7);
  ctx.fillStyle = radial(ctx, -2, -2.5, 0, 0, 0, 7, [
    [0, color.brassHi],
    [0.5, color.brassMid],
    [1, color.brassLo],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  circlePath(ctx, 0, 0, 2.2);
  ctx.fillStyle = darken(color.brassLo, 0.3);
  ctx.fill();
}

/**
 * Draws both flippers. `left` and `right` are the flipper bodies' rotations in radians,
 * counterclockwise on screen, as the physics has them: 0 is the outline as given, which is the
 * original's rest pose (its mover rests at 0.003 rad and swings up to 1.04).
 */
export function drawFlippers(ctx: Ctx, k: number, left: number, right: number): void {
  const lp = { x: BOARD_X + FLIPPER_LEFT_PIVOT.x, y: BOARD_BOTTOM + FLIPPER_LEFT_PIVOT.y };
  const rp = {
    x: BOARD_X + BOARD_W - FLIPPER_RIGHT_PIVOT.x,
    y: BOARD_BOTTOM + FLIPPER_RIGHT_PIVOT.y,
  };
  const { left: ll, right: rl } = flipperLayers(k);
  for (const [p, layer, a] of [
    [lp, ll, left],
    [rp, rl, right],
  ] as const) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(-a);
    drawLayer(ctx, layer);
    ctx.restore();
  }
}

function flipperLayers(k: number): { left: Layer; right: Layer } {
  return {
    left: layers.get('flipper:left', k, -24, -26, 116, 60, (c) => {
      paintFlipper(c, FLIPPER_LEFT_VERTICES);
    }),
    right: layers.get('flipper:right', k, -90, -28, 116, 62, (c) => {
      paintFlipper(c, FLIPPER_RIGHT_VERTICES);
    }),
  };
}
