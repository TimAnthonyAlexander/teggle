// Draws the playfield of a level from the world's bodies and the presenter's state: object
// shadows, pegs and bricks (unlit, lit with their halo and hit flash, popping), solids, the
// ball, the bucket and the aim guide. Static unlit objects are drawn once into a cached layer
// that is rebuilt only when one leaves the board or changes color; lit and moving objects are
// drawn each frame from sprites held here, so the per-frame path does no allocation. Positions
// are interpolated between the last two ticks with the loop's alpha.

import type { LevelElement } from '../../level/schema';
import type { CompiledLevel } from '../../sim/compile';
import type { World } from '../../sim/world';
import { WORLD_H, WORLD_W } from '../layout';
import { ballSprite } from '../render/ball';
import { createCanvas, context2d, drawLayer, type Layer } from '../render/cache';
import { drawGuideArrow, guideDotSprite } from '../render/cannon';
import { circlePath, linear, radial, type Ctx } from '../render/paint';
import {
  brickGlowSprite,
  brickLocalVertices,
  brickSprite,
  HIT_FLASH_MS,
  pegGlowSprite,
  pegSprite,
  popDurationMs,
  whiteGlowSprite,
  type BrickShape,
} from '../render/pegs';
import { lighten } from '../ui/color';
import { PEG_VALUE_MS, pegValueFrame } from '../ui/motion';
import { textStyle } from '../ui/text';
import { pegGlow, shape as shapeTokens, type PegColor } from '../ui/tokens';
import { GONE, LIT, ON_BOARD, PEG_COLOR_LIST, PURPLE_MOVE_MS, type Presenter } from './presenter';
import { drawTextSprite, type TextSprites } from './text-sprites';

const SHADOW = shapeTokens.shadowObject;
const SHADOW_FILL = `rgba(0,0,0,${SHADOW.alpha})`;
const MAX_BALLS = 32;

/** Precomputed ring colors of the removal pop, per peg color. */
const POP_RING = PEG_COLOR_LIST.map((c) => lighten(pegGlow[c], 0.35));
const POP_FILL = PEG_COLOR_LIST.map((c) => (c === 'orange' ? '#ff3a10' : pegGlow[c]));
const ORANGE_RING = ['#ffe36a', '#ff9a3a', '#ff5a3a'];

type ScoringElement = Extract<LevelElement, { kind: 'peg' | 'brick' | 'curvedBrick' }>;

function isScoring(e: LevelElement | null): e is ScoringElement {
  return e !== null && (e.kind === 'peg' || e.kind === 'brick' || e.kind === 'curvedBrick');
}

export class BoardRenderer {
  readonly offX: number;
  readonly offY: number;
  private readonly scoring: readonly number[];
  private readonly solids: number[] = [];
  private readonly moving: Uint8Array;
  private readonly radius: Float32Array;
  /** Brick shape per body: in world position for static bricks, at the origin for moving ones. */
  private readonly bricks: (BrickShape | null)[];
  /** Brick outline per body: world vertices for static bricks, local for moving ones. */
  private readonly outline: (Float32Array | null)[];
  /** Brick centroid offset from its position (local, rotation 0). */
  private readonly centroid: Float32Array;
  private readonly sprites: (Layer | null)[];
  private readonly glows: (Layer | null)[];
  private spriteK = 0;
  private ball: Layer | null = null;
  private dot: Layer | null = null;
  private flash: Layer | null = null;
  private staticCanvas: HTMLCanvasElement | null = null;
  private staticK = 0;
  /** World box (x0, y0, x1, y1) of each static object, shadow included. */
  private readonly box: Float32Array;

  // Interpolation: poses before the last tick.
  private readonly prevX: Float64Array;
  private readonly prevY: Float64Array;
  private readonly prevRot: Float64Array;
  private readonly ballPrev = new Float64Array(MAX_BALLS * 2);
  private readonly ballPrevOk = new Uint8Array(MAX_BALLS);
  private prevBucket = 0;

  constructor(readonly level: CompiledLevel) {
    this.offX = WORLD_W / 2 - level.width / 2;
    this.offY = WORLD_H - level.height;
    const n = level.bodies.length;
    this.scoring = level.scoringBodies;
    this.moving = new Uint8Array(n);
    this.radius = new Float32Array(n);
    this.bricks = new Array<BrickShape | null>(n).fill(null);
    this.outline = new Array<Float32Array | null>(n).fill(null);
    this.centroid = new Float32Array(2 * n);
    this.sprites = new Array<Layer | null>(n * 8).fill(null);
    this.glows = new Array<Layer | null>(n * 4).fill(null);
    this.prevX = new Float64Array(n);
    this.prevY = new Float64Array(n);
    this.prevRot = new Float64Array(n);
    this.box = new Float32Array(4 * n);
    for (const def of level.bodies) {
      const i = def.index;
      const e = def.element;
      if (def.motion === 'element') this.moving[i] = 1;
      const pose = level.initialPoses[i];
      this.prevX[i] = pose?.x ?? def.baseX;
      this.prevY[i] = pose?.y ?? def.baseY;
      this.prevRot[i] = pose?.rotation ?? def.baseRotation;
      if (e === null) continue;
      const px = (pose?.x ?? e.x) + this.offX;
      const py = (pose?.y ?? e.y) + this.offY;
      if (!isScoring(e)) {
        if (e.visible) this.solids.push(i);
        this.setBox(i, px, py, solidReach(e));
        continue;
      }
      if (e.kind === 'peg') {
        this.radius[i] = e.radius;
        this.setBox(i, px, py, e.radius);
        continue;
      }
      const moving = this.moving[i] === 1;
      const x = moving ? 0 : (pose?.x ?? e.x) + this.offX;
      const y = moving ? 0 : (pose?.y ?? e.y) + this.offY;
      const rotation = moving ? 0 : (pose?.rotation ?? e.rotation);
      const b: BrickShape =
        e.kind === 'brick'
          ? { kind: 'brick', x, y, rotation, length: e.length, width: e.width }
          : {
              kind: 'curvedBrick',
              x,
              y,
              rotation,
              innerRadius: e.innerRadius,
              width: e.width,
              sector: e.sector,
              points: e.points,
            };
      this.bricks[i] = b;
      const local = brickLocalVertices(b);
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      const out = new Float32Array(local.length * 2);
      let cx = 0;
      let cy = 0;
      local.forEach((v, k) => {
        out[2 * k] = x + v.x * c + v.y * s;
        out[2 * k + 1] = y - v.x * s + v.y * c;
        cx += v.x / local.length;
        cy += v.y / local.length;
      });
      this.outline[i] = out;
      this.centroid[2 * i] = cx;
      this.centroid[2 * i + 1] = cy;
      let reach = 0;
      for (const v of local) reach = Math.max(reach, Math.hypot(v.x, v.y));
      this.setBox(i, px, py, reach);
    }
  }

  /** Box around a static object at (x, y) reaching `reach` from it, with its shadow and a margin. */
  private setBox(i: number, x: number, y: number, reach: number): void {
    const m = 2;
    this.box[4 * i] = x - reach + SHADOW.dx - m;
    this.box[4 * i + 1] = y - reach - m;
    this.box[4 * i + 2] = x + reach + m;
    this.box[4 * i + 3] = y + reach + SHADOW.dy + m;
  }

  private overlaps(i: number, j: number): boolean {
    const b = this.box;
    return (
      (b[4 * i] ?? 0) < (b[4 * j + 2] ?? 0) &&
      (b[4 * j] ?? 0) < (b[4 * i + 2] ?? 0) &&
      (b[4 * i + 1] ?? 0) < (b[4 * j + 3] ?? 0) &&
      (b[4 * j + 1] ?? 0) < (b[4 * i + 3] ?? 0)
    );
  }

  /** Records poses before a tick, for interpolation. Call right before stepping. */
  capture(world: World): void {
    const bodies = world.bodies;
    for (const i of this.level.elementMotionOrder) {
      const b = bodies[i];
      if (b === undefined) continue;
      this.prevX[i] = b.x;
      this.prevY[i] = b.y;
      this.prevRot[i] = b.rotation;
    }
    this.ballPrevOk.fill(0);
    for (const b of world.balls) {
      if (b.id >= MAX_BALLS) continue;
      this.ballPrev[2 * b.id] = b.x;
      this.ballPrev[2 * b.id + 1] = b.y;
      this.ballPrevOk[b.id] = 1;
    }
    this.prevBucket = world.bucketX;
  }

  /** The bucket's center in world units, interpolated. */
  bucketX(world: World, alpha: number): number {
    const x = world.bucketX;
    const d = x - this.prevBucket;
    return this.offX + (Math.abs(d) > 20 ? x : this.prevBucket + d * alpha);
  }

  private ensureSprites(k: number): void {
    if (k === this.spriteK) return;
    this.spriteK = k;
    this.sprites.fill(null);
    this.glows.fill(null);
    this.ball = ballSprite(k);
    this.dot = guideDotSprite(k);
    this.flash = whiteGlowSprite(k, 20);
    this.staticCanvas = null;
  }

  private sprite(k: number, i: number, color: number, lit: boolean): Layer | null {
    const slot = i * 8 + color * 2 + (lit ? 1 : 0);
    let s = this.sprites[slot];
    if (s === null || s === undefined) {
      const c: PegColor = PEG_COLOR_LIST[color] ?? 'blue';
      const b = this.bricks[i];
      s =
        b === null || b === undefined
          ? pegSprite(k, c, lit, this.radius[i])
          : brickSprite(k, b, c, lit);
      this.sprites[slot] = s;
    }
    return s;
  }

  private glow(k: number, i: number, color: number): Layer | null {
    const slot = i * 4 + color;
    let s = this.glows[slot];
    if (s === null || s === undefined) {
      const c: PegColor = PEG_COLOR_LIST[color] ?? 'blue';
      const b = this.bricks[i];
      s = b === null || b === undefined ? pegGlowSprite(k, c) : brickGlowSprite(k, b, c);
      this.glows[slot] = s;
    }
    return s;
  }

  // -------------------------------------------------------------------------------------------
  // Static layer

  /**
   * Draws the static picture: whatever `under` paints (the backdrop and the frame's inner
   * shadow), then the static objects with their shadows. One full-screen image per frame; it is
   * rebuilt only when an object leaves the board or changes color.
   */
  drawStatic(
    ctx: Ctx,
    k: number,
    world: World,
    pres: Presenter,
    under: (ctx: Ctx, k: number) => void,
  ): void {
    this.ensureSprites(k);
    if (this.staticCanvas === null || this.staticK !== k || pres.staticDirty) {
      this.rebuildStatic(k, world, pres, under);
      pres.staticDirty = false;
      pres.dirtyCount = 0;
    } else if (pres.dirtyCount > 0) {
      for (let d = 0; d < pres.dirtyCount; d++) {
        const i = pres.dirty[d] ?? -1;
        if (i >= 0 && this.moving[i] === 0) this.patchStatic(k, world, pres, under, i);
      }
      pres.dirtyCount = 0;
    }
    if (this.staticCanvas !== null) ctx.drawImage(this.staticCanvas, 0, 0, WORLD_W, WORLD_H);
  }

  /** Redraws the static picture inside one object's box: a pop or a color change. */
  private patchStatic(
    k: number,
    world: World,
    pres: Presenter,
    under: (ctx: Ctx, k: number) => void,
    i: number,
  ): void {
    const canvas = this.staticCanvas;
    if (canvas === null) return;
    const c = context2d(canvas);
    const b = this.box;
    const sx = canvas.width / WORLD_W;
    const sy = canvas.height / WORLD_H;
    // Clip to whole device pixels: with a soft clip edge every layer drawn below would blend in
    // separately and leave a faint seam.
    const x0 = Math.floor((b[4 * i] ?? 0) * sx);
    const y0 = Math.floor((b[4 * i + 1] ?? 0) * sy);
    const x1 = Math.ceil((b[4 * i + 2] ?? 0) * sx);
    const y1 = Math.ceil((b[4 * i + 3] ?? 0) * sy);
    c.save();
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.beginPath();
    c.rect(x0, y0, x1 - x0, y1 - y0);
    c.clip();
    c.setTransform(sx, 0, 0, sy, 0, 0);
    under(c, k);
    this.paintStatic(c, k, world, pres, i);
    c.restore();
  }

  private rebuildStatic(
    k: number,
    world: World,
    pres: Presenter,
    under: (ctx: Ctx, k: number) => void,
  ): void {
    const w = Math.ceil(WORLD_W * k);
    const h = Math.ceil(WORLD_H * k);
    if (
      this.staticCanvas === null ||
      this.staticCanvas.width !== w ||
      this.staticCanvas.height !== h
    ) {
      this.staticCanvas = createCanvas(w, h);
    }
    this.staticK = k;
    const c = context2d(this.staticCanvas);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(w / WORLD_W, 0, 0, h / WORLD_H, 0, 0);
    under(c, k);
    this.paintStatic(c, k, world, pres, -1);
  }

  /** Static objects with their shadows; only those overlapping body `near`'s box unless -1. */
  private paintStatic(c: Ctx, k: number, world: World, pres: Presenter, near: number): void {
    const bodies = world.bodies;
    const all = near < 0;
    // Shadows first, then the objects, so no shadow falls on a neighbor.
    c.fillStyle = SHADOW_FILL;
    for (const i of this.solids) {
      if (this.moving[i] === 1 || !(all || this.overlaps(i, near))) continue;
      this.solidShadow(c, i, bodies[i]?.x ?? 0, bodies[i]?.y ?? 0, bodies[i]?.rotation ?? 0);
    }
    for (const i of this.scoring) {
      if (this.moving[i] === 1 || pres.state[i] === GONE) continue;
      if (!(all || this.overlaps(i, near))) continue;
      this.shadow(c, i, bodies[i]?.x ?? 0, bodies[i]?.y ?? 0, 0);
    }
    for (const i of this.solids) {
      const b = bodies[i];
      if (this.moving[i] === 1 || b === undefined || !(all || this.overlaps(i, near))) continue;
      this.solid(c, i, b.x, b.y, b.rotation, 0);
    }
    for (const i of this.scoring) {
      if (this.moving[i] === 1 || pres.state[i] === GONE) continue;
      if (!(all || this.overlaps(i, near))) continue;
      const body = bodies[i];
      if (body === undefined) continue;
      this.drawObject(c, this.sprite(k, i, pres.color[i] ?? 0, false), i, body.x, body.y, 0);
    }
  }

  private shadow(ctx: Ctx, i: number, x: number, y: number, rotation: number): void {
    const o = this.outline[i];
    if (o === null || o === undefined) {
      circlePath(ctx, x + this.offX + SHADOW.dx, y + this.offY + SHADOW.dy, this.radius[i] ?? 10);
      ctx.fill();
      return;
    }
    const moving = this.moving[i] === 1;
    ctx.beginPath();
    if (moving) {
      const c = Math.cos(rotation);
      const s = Math.sin(rotation);
      const bx = x + this.offX + SHADOW.dx;
      const by = y + this.offY + SHADOW.dy;
      for (let v = 0; v < o.length; v += 2) {
        const lx = o[v] ?? 0;
        const ly = o[v + 1] ?? 0;
        const px = bx + lx * c + ly * s;
        const py = by - lx * s + ly * c;
        if (v === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    } else {
      for (let v = 0; v < o.length; v += 2) {
        const px = (o[v] ?? 0) + SHADOW.dx;
        const py = (o[v + 1] ?? 0) + SHADOW.dy;
        if (v === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
    }
    ctx.closePath();
    ctx.fill();
  }

  // -------------------------------------------------------------------------------------------
  // Solids (circles, polygons, rods, teleports): Teggle's own machine parts

  private solidShadow(ctx: Ctx, i: number, x: number, y: number, rotation: number): void {
    const e = this.level.bodies[i]?.element;
    if (e === null || e === undefined || e.kind === 'teleport') return;
    ctx.save();
    ctx.translate(x + this.offX + SHADOW.dx, y + this.offY + SHADOW.dy);
    this.solidPath(ctx, e, rotation);
    if (e.kind === 'rod') {
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      ctx.strokeStyle = SHADOW_FILL;
      ctx.stroke();
    } else {
      ctx.fill();
    }
    ctx.restore();
  }

  private solidPath(ctx: Ctx, e: LevelElement, rotation: number): void {
    ctx.beginPath();
    if (e.kind === 'circle') {
      ctx.arc(0, 0, e.radius, 0, Math.PI * 2);
      return;
    }
    ctx.rotate(-rotation);
    if (e.kind === 'polygon') {
      const vs = e.vertices;
      for (let n = 0; n < vs.length; n++) {
        const v = vs[n];
        if (v === undefined) continue;
        if (n === 0) ctx.moveTo(v.x, v.y);
        else ctx.lineTo(v.x, v.y);
      }
      ctx.closePath();
    } else if (e.kind === 'rod') {
      ctx.moveTo(e.a.x, e.a.y);
      ctx.lineTo(e.b.x, e.b.y);
    }
  }

  private solid(ctx: Ctx, i: number, x: number, y: number, rotation: number, timeMs: number): void {
    const e = this.level.bodies[i]?.element;
    if (e === null || e === undefined) return;
    const wx = x + this.offX;
    const wy = y + this.offY;
    ctx.save();
    ctx.translate(wx, wy);
    if (e.kind === 'circle') {
      const r = e.radius;
      circlePath(ctx, 0, 0, r);
      ctx.fillStyle = radial(ctx, -r * 0.35, -r * 0.45, r * 0.05, 0, 0, r, [
        [0, '#f6fbff'],
        [0.25, '#a9c3cf'],
        [0.7, '#4f7280'],
        [1, '#1d343d'],
      ]);
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#0b1a20';
      ctx.stroke();
      circlePath(ctx, 0, 0, r * 0.62);
      ctx.lineWidth = Math.max(1.2, r * 0.12);
      ctx.strokeStyle = 'rgba(116,164,174,0.85)';
      ctx.stroke();
    } else if (e.kind === 'polygon') {
      this.solidPath(ctx, e, rotation);
      ctx.fillStyle = linear(ctx, 0, -30, 0, 30, [
        [0, '#5f8f9a'],
        [0.5, '#2c5560'],
        [1, '#122d35'],
      ]);
      ctx.fill();
      ctx.lineJoin = 'round';
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#06161b';
      ctx.stroke();
    } else if (e.kind === 'rod') {
      this.solidPath(ctx, e, rotation);
      ctx.lineCap = 'round';
      ctx.lineWidth = 5;
      ctx.strokeStyle = '#0b1a20';
      ctx.stroke();
      ctx.lineWidth = 3;
      ctx.strokeStyle = '#a9c3cf';
      ctx.stroke();
    } else if (e.kind === 'teleport') {
      const t = timeMs / 900;
      ctx.scale(e.width / 2, e.height / 2);
      for (let r = 0; r < 3; r++) {
        ctx.beginPath();
        ctx.arc(0, 0, 1 - r * 0.22, t + r * 2.1, t + r * 2.1 + 4.2);
        ctx.lineWidth = 0.12;
        ctx.strokeStyle = r === 0 ? '#c27dff' : r === 1 ? '#6d8cff' : '#e3c6ff';
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  // -------------------------------------------------------------------------------------------
  // Per frame

  /** Moving objects (their shadows first), unlit; lit objects are drawn by drawLit. */
  drawMoving(
    ctx: Ctx,
    k: number,
    world: World,
    pres: Presenter,
    alpha: number,
    timeMs: number,
  ): void {
    const bodies = world.bodies;
    ctx.fillStyle = SHADOW_FILL;
    for (const i of this.level.elementMotionOrder) {
      const b = bodies[i];
      if (b === undefined) continue;
      const x = this.lerpX(i, b.x, alpha);
      const y = this.lerpY(i, b.y, alpha);
      const r = this.lerpRot(i, b.rotation, alpha);
      if (b.def.scoring) {
        if (pres.state[i] === ON_BOARD) this.shadow(ctx, i, x, y, r);
      } else if (b.def.element?.visible === true) {
        this.solidShadow(ctx, i, x, y, r);
      }
    }
    for (const i of this.level.elementMotionOrder) {
      const b = bodies[i];
      if (b === undefined) continue;
      const x = this.lerpX(i, b.x, alpha);
      const y = this.lerpY(i, b.y, alpha);
      const r = this.lerpRot(i, b.rotation, alpha);
      if (b.def.scoring) {
        if (pres.state[i] !== ON_BOARD) continue;
        this.drawObject(ctx, this.sprite(k, i, pres.color[i] ?? 0, false), i, x, y, r);
      } else if (b.def.element?.visible === true) {
        this.solid(ctx, i, x, y, r, timeMs);
      }
    }
    // Teleports animate, so static ones are drawn here too.
    for (const i of this.solids) {
      const b = bodies[i];
      if (b !== undefined && this.moving[i] === 0 && b.def.element?.kind === 'teleport') {
        this.solid(ctx, i, b.x, b.y, b.rotation, timeMs);
      }
    }
  }

  private drawObject(
    ctx: Ctx,
    s: Layer | null,
    i: number,
    x: number,
    y: number,
    rotation: number,
  ): void {
    if (s === null) return;
    const brick = this.bricks[i];
    if (brick === null || brick === undefined) {
      drawLayer(ctx, s, x + this.offX, y + this.offY);
    } else if (this.moving[i] === 1) {
      ctx.save();
      ctx.translate(x + this.offX, y + this.offY);
      ctx.rotate(-rotation);
      drawLayer(ctx, s);
      ctx.restore();
    } else {
      // Static bricks have their rotation and position baked in at construction.
      drawLayer(ctx, s, brick.x, brick.y);
    }
  }

  /** Lit objects: additive halo, the lit sprite, and the white hit flash. */
  drawLit(ctx: Ctx, k: number, world: World, pres: Presenter, alpha: number): void {
    const bodies = world.bodies;
    const now = pres.gameMs;
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    for (const i of this.scoring) {
      if (pres.state[i] !== LIT) continue;
      const b = bodies[i];
      if (b === undefined) continue;
      const x = this.lerpX(i, b.x, alpha);
      const y = this.lerpY(i, b.y, alpha);
      const r = this.lerpRot(i, b.rotation, alpha);
      const color = pres.color[i] ?? 0;
      ctx.globalCompositeOperation = 'lighter';
      this.drawObject(ctx, this.glow(k, i, color), i, x, y, r);
      ctx.globalCompositeOperation = prevOp;
      this.drawObject(ctx, this.sprite(k, i, color, true), i, x, y, r);
      const t = now - (pres.litMs[i] ?? -Infinity);
      if (t >= 0 && t < HIT_FLASH_MS) {
        const f = t / HIT_FLASH_MS;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = prevAlpha * (1 - f);
        const flash = this.flash;
        if (this.bricks[i] === null && flash !== null) {
          const s = (0.7 + 0.7 * f) * (this.radius[i] ?? 10) * 2;
          ctx.drawImage(flash.canvas, x + this.offX - s, y + this.offY - s, 2 * s, 2 * s);
        } else {
          this.drawObject(ctx, this.sprite(k, i, color, true), i, x, y, r);
          this.drawObject(ctx, this.glow(k, i, color), i, x, y, r);
        }
        ctx.globalAlpha = prevAlpha;
        ctx.globalCompositeOperation = prevOp;
      }
    }
  }

  /** Expanding rings where lit pegs just popped (guide 4.4), and the purple peg's arrival. */
  drawPops(ctx: Ctx, world: World, pres: Presenter, alpha: number): void {
    const bodies = world.bodies;
    const now = pres.gameMs;
    const prevAlpha = ctx.globalAlpha;
    const prevOp = ctx.globalCompositeOperation;
    ctx.globalCompositeOperation = 'lighter';
    for (const i of this.scoring) {
      if (pres.state[i] !== GONE) continue;
      const color = pres.color[i] ?? 0;
      const t = now - (pres.popMs[i] ?? -Infinity);
      const total = popDurationMs(PEG_COLOR_LIST[color] ?? 'blue');
      if (t < 0 || t >= total) continue;
      const b = bodies[i];
      if (b === undefined) continue;
      let x = this.lerpX(i, b.x, alpha) + this.offX;
      let y = this.lerpY(i, b.y, alpha) + this.offY;
      const isBrick = this.bricks[i] !== null;
      if (isBrick) {
        const rot = this.moving[i] === 1 ? this.lerpRot(i, b.rotation, alpha) : 0;
        const cx = this.centroid[2 * i] ?? 0;
        const cy = this.centroid[2 * i + 1] ?? 0;
        const c = Math.cos(rot);
        const s = Math.sin(rot);
        const shape = this.bricks[i];
        if (this.moving[i] === 0 && shape !== null && shape !== undefined) {
          const rc = Math.cos(shape.rotation);
          const rs = Math.sin(shape.rotation);
          x = shape.x + cx * rc + cy * rs;
          y = shape.y - cx * rs + cy * rc;
        } else {
          x += cx * c + cy * s;
          y += -cx * s + cy * c;
        }
      }
      popRing(ctx, x, y, color, t / total, isBrick ? 14 : (this.radius[i] ?? 10), prevAlpha);
    }
    // The purple peg's arrival: a pink ring closing in.
    const pt = now - pres.purpleMs;
    const pi = pres.purpleTo;
    if (pi >= 0 && pt >= 0 && pt < PURPLE_MOVE_MS) {
      const b = bodies[pi];
      if (b !== undefined && pres.state[pi] !== GONE) {
        const f = pt / PURPLE_MOVE_MS;
        ctx.globalAlpha = prevAlpha * (1 - f);
        ctx.beginPath();
        ctx.arc(
          this.lerpX(pi, b.x, alpha) + this.offX,
          this.lerpY(pi, b.y, alpha) + this.offY,
          10 + 26 * (1 - f),
          0,
          Math.PI * 2,
        );
        ctx.lineWidth = 3;
        ctx.strokeStyle = '#ff7cf0';
        ctx.stroke();
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevOp;
  }

  /** Peg value popups at each lit peg (guide 9.1). */
  drawValues(
    ctx: Ctx,
    k: number,
    world: World,
    pres: Presenter,
    sprites: TextSprites,
    alpha: number,
  ): void {
    const bodies = world.bodies;
    const now = pres.gameMs;
    for (const i of this.scoring) {
      const t = now - (pres.litMs[i] ?? -Infinity);
      if (t < 0 || t >= PEG_VALUE_MS) continue;
      const text = pres.valueText[i];
      const b = bodies[i];
      if (text === null || text === undefined || b === undefined) continue;
      const f = pegValueFrame(t);
      const sprite = sprites.get(k, 'pegValue', PEG_VALUE_STYLE, text);
      const x = this.lerpX(i, b.x, alpha) + this.offX;
      const y = this.lerpY(i, b.y, alpha) + this.offY - 15 - f.rise;
      drawTextSprite(ctx, sprite, x, y, 1, f.alpha);
    }
  }

  /** Balls in play with their shadows, interpolated. */
  drawBalls(ctx: Ctx, world: World, alpha: number): void {
    const sprite = this.ball;
    if (sprite === null) return;
    for (const b of world.balls) {
      if (b.hiddenTicks > 0) continue;
      const x = this.ballX(b.id, b.x, alpha);
      const y = this.ballY(b.id, b.y, alpha);
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      circlePath(ctx, x + this.offX - 4, y + this.offY + 3, b.radius);
      ctx.fill();
      if (b.radius === 6) {
        drawLayer(ctx, sprite, x + this.offX, y + this.offY);
      } else {
        const s = b.radius / 6;
        ctx.drawImage(
          sprite.canvas,
          x + this.offX - (sprite.w * s) / 2,
          y + this.offY - (sprite.h * s) / 2,
          sprite.w * s,
          sprite.h * s,
        );
      }
    }
  }

  ballX(id: number, x: number, alpha: number): number {
    if (id >= MAX_BALLS || this.ballPrevOk[id] !== 1) return x;
    const px = this.ballPrev[2 * id] ?? x;
    return Math.abs(x - px) > 40 ? x : px + (x - px) * alpha;
  }

  ballY(id: number, y: number, alpha: number): number {
    if (id >= MAX_BALLS || this.ballPrevOk[id] !== 1) return y;
    const py = this.ballPrev[2 * id + 1] ?? y;
    return Math.abs(y - py) > 40 ? y : py + (y - py) * alpha;
  }

  /**
   * The aim guide (guide 5.3): 8 dots at equal time steps from the launch point, growing from 10
   * to 14 units, the first two paler, then the arrowhead. `points` are board coordinates of the
   * ball after each tick; every `step`-th one gets a dot.
   */
  drawGuide(ctx: Ctx, points: Float64Array, count: number, step: number): void {
    const dot = this.dot;
    if (dot === null || count < 2) return;
    const dots = Math.min(8, Math.floor((count - 1) / step) + 1);
    const prevAlpha = ctx.globalAlpha;
    for (let n = 0; n < dots; n++) {
      const j = n * step;
      const x = (points[2 * j] ?? 0) + this.offX;
      const y = (points[2 * j + 1] ?? 0) + this.offY;
      const f = dots > 1 ? n / (dots - 1) : 1;
      const s = (10 + 4 * f) / 12;
      ctx.globalAlpha = prevAlpha * (n === 0 ? 0.4 : n === 1 ? 0.65 : 0.95);
      ctx.drawImage(dot.canvas, x - 7.5 * s, y - 7.5 * s, 15 * s, 15 * s);
    }
    ctx.globalAlpha = prevAlpha;
    const last = (dots - 1) * step;
    const next = Math.min(count - 1, last + step);
    if (next > last) {
      const x0 = (points[2 * last] ?? 0) + this.offX;
      const y0 = (points[2 * last + 1] ?? 0) + this.offY;
      const x1 = (points[2 * next] ?? 0) + this.offX;
      const y1 = (points[2 * next + 1] ?? 0) + this.offY;
      drawGuideArrow(ctx, x1, y1, Math.atan2(y1 - y0, x1 - x0));
    }
  }

  private lerpX(i: number, x: number, alpha: number): number {
    if (this.moving[i] === 0) return x;
    const p = this.prevX[i] ?? x;
    return p + (x - p) * alpha;
  }

  private lerpY(i: number, y: number, alpha: number): number {
    if (this.moving[i] === 0) return y;
    const p = this.prevY[i] ?? y;
    return p + (y - p) * alpha;
  }

  private lerpRot(i: number, r: number, alpha: number): number {
    if (this.moving[i] === 0) return r;
    const p = this.prevRot[i] ?? r;
    let d = r - p;
    if (d > Math.PI) d -= 2 * Math.PI;
    else if (d < -Math.PI) d += 2 * Math.PI;
    return p + d * alpha;
  }
}

export const PEG_VALUE_STYLE = textStyle.pegValue();

/** How far a solid reaches from its position in any rotation. */
function solidReach(e: LevelElement): number {
  switch (e.kind) {
    case 'circle':
      return e.radius;
    case 'polygon': {
      let r = 0;
      for (const v of e.vertices) r = Math.max(r, Math.hypot(v.x, v.y));
      return r;
    }
    case 'rod':
      return Math.max(Math.hypot(e.a.x, e.a.y), Math.hypot(e.b.x, e.b.y)) + 3;
    case 'teleport':
      return Math.hypot(e.width, e.height) / 2;
    default:
      return 12;
  }
}

/** One removal pop: a dim disc and a bright ring growing from the peg's edge (guide 4.4). */
function popRing(
  ctx: Ctx,
  x: number,
  y: number,
  color: number,
  t: number,
  r: number,
  baseAlpha: number,
): void {
  const goal = color === 1;
  const grow = goal ? 1.6 : 0.9;
  const rr = r * (1 + grow * (1 - (1 - t) * (1 - t)));
  const fade = t < 0.45 ? 1 : 1 - (t - 0.45) / 0.55;
  ctx.globalAlpha = baseAlpha * fade * 0.35;
  circlePath(ctx, x, y, rr);
  ctx.fillStyle = POP_FILL[color] ?? '#3f9bff';
  ctx.fill();
  ctx.globalAlpha = baseAlpha * fade * 0.25;
  ctx.lineWidth = r * 0.9;
  ctx.strokeStyle = POP_FILL[color] ?? '#3f9bff';
  ctx.stroke();
  ctx.globalAlpha = baseAlpha * fade * 0.95;
  ctx.lineWidth = r * (goal ? 0.42 : 0.3) * (1 - 0.4 * t);
  ctx.strokeStyle = goal
    ? (ORANGE_RING[t < 0.3 ? 0 : t < 0.6 ? 1 : 2] ?? '#ff5a3a')
    : (POP_RING[color] ?? '#ffffff');
  ctx.stroke();
  if (goal && t > 0.35) {
    ctx.globalAlpha = baseAlpha * fade * 0.9;
    ctx.fillStyle = '#ff6a4a';
    for (let n = 0; n < 14; n++) {
      const a = n * 2.39996;
      const d = rr * (0.25 + ((n * 37) % 70) / 100);
      circlePath(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, 0.9);
      ctx.fill();
    }
  }
}
