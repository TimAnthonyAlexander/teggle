// Sparks and stars for the Fever hit, the bucket fireworks and other bursts (guide 12.5). A fixed
// pool of typed arrays: spawning reuses dead slots and stepping and drawing allocate nothing.
// Particles live in screen world units and move per simulation tick, so slow motion slows them.

import { drawLayer, layers, type Layer } from '../render/cache';
import { circlePath, radial, type Ctx } from '../render/paint';
import { lighten, rgba } from '../ui/color';
import { color as tokens } from '../ui/tokens';

/** Particle colors: the rainbow (0 to 6), then white, gold, green, blue, pink. */
export const PARTICLE_COLORS: readonly string[] = [
  ...tokens.rainbow,
  '#ffffff',
  '#ffd84a',
  '#7cff5a',
  '#4fb8ff',
  '#ff6ae6',
];
export const WHITE = 7;
export const GOLD = 8;
export const GREEN = 9;
export const BLUE = 10;
export const PINK = 11;

export const SPARK = 0;
export const STAR = 1;

const MAX = 900;
/** Downward pull per tick squared, in world units (sparks fall a little slower than the ball). */
const GRAVITY = 0.035;

function paintStar(ctx: Ctx, tint: string): void {
  ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, 12, [
    [0, rgba(tint, 0.55)],
    [1, rgba(tint, 0)],
  ]);
  circlePath(ctx, 0, 0, 12);
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 6.5 : 2.8;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    if (i === 0) ctx.moveTo(r * Math.cos(a), r * Math.sin(a));
    else ctx.lineTo(r * Math.cos(a), r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fillStyle = lighten(tint, 0.55);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = tint;
  ctx.stroke();
}

function paintSpark(ctx: Ctx, tint: string): void {
  ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, 6, [
    [0, '#ffffff'],
    [0.25, rgba(lighten(tint, 0.4), 0.95)],
    [1, rgba(tint, 0)],
  ]);
  circlePath(ctx, 0, 0, 6);
  ctx.fill();
}

export class Particles {
  private readonly x = new Float32Array(MAX);
  private readonly y = new Float32Array(MAX);
  private readonly vx = new Float32Array(MAX);
  private readonly vy = new Float32Array(MAX);
  private readonly life = new Float32Array(MAX);
  private readonly age = new Float32Array(MAX);
  private readonly size = new Float32Array(MAX);
  private readonly spin = new Float32Array(MAX);
  private readonly kind = new Uint8Array(MAX);
  private readonly tint = new Uint8Array(MAX);
  private readonly drag = new Float32Array(MAX);
  private live = 0;
  private cursor = 0;
  private spriteK = 0;
  private readonly stars: Layer[] = [];
  private readonly sparks: Layer[] = [];

  get count(): number {
    return this.live;
  }

  clear(): void {
    this.life.fill(0);
    this.live = 0;
  }

  /** Adds one particle; `life` in ticks. Overwrites the oldest slot when the pool is full. */
  spawn(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    kind: number,
    tint: number,
    size = 1,
    drag = 0.985,
  ): void {
    let i = -1;
    for (let n = 0; n < MAX; n++) {
      const j = (this.cursor + n) % MAX;
      if ((this.life[j] ?? 0) <= 0) {
        i = j;
        break;
      }
    }
    if (i < 0) i = this.cursor;
    else this.live++;
    this.cursor = (i + 1) % MAX;
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.life[i] = life;
    this.age[i] = 0;
    this.size[i] = size;
    this.spin[i] = (x * 7.3 + y * 3.1) % 6.283;
    this.kind[i] = kind;
    this.tint[i] = tint;
    this.drag[i] = drag;
  }

  /** A ring of sparks flying out from (x, y). `rand` returns [0, 1). */
  burst(
    x: number,
    y: number,
    n: number,
    speed: number,
    tints: readonly number[],
    rand: () => number,
    kind = SPARK,
  ): void {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + rand() * 0.4;
      const s = speed * (0.45 + 0.75 * rand());
      const tint = tints[i % tints.length] ?? WHITE;
      this.spawn(
        x,
        y,
        Math.cos(a) * s,
        Math.sin(a) * s,
        40 + rand() * 45,
        kind,
        tint,
        0.7 + 0.6 * rand(),
      );
    }
  }

  /** One tick of motion: drag, gravity, aging. */
  tick(): void {
    let live = 0;
    for (let i = 0; i < MAX; i++) {
      const life = this.life[i] ?? 0;
      if (life <= 0) continue;
      const age = (this.age[i] ?? 0) + 1;
      this.age[i] = age;
      if (age >= life) {
        this.life[i] = 0;
        continue;
      }
      live++;
      const d = this.drag[i] ?? 1;
      const vx = (this.vx[i] ?? 0) * d;
      const vy = (this.vy[i] ?? 0) * d + GRAVITY;
      this.vx[i] = vx;
      this.vy[i] = vy;
      this.x[i] = (this.x[i] ?? 0) + vx;
      this.y[i] = (this.y[i] ?? 0) + vy;
    }
    this.live = live;
  }

  private sprites(k: number): void {
    if (k === this.spriteK && this.stars.length > 0) return;
    this.spriteK = k;
    this.stars.length = 0;
    this.sparks.length = 0;
    PARTICLE_COLORS.forEach((c, i) => {
      this.stars.push(
        layers.get(`fx:star:${i}`, k, -12, -12, 24, 24, (ctx) => {
          paintStar(ctx, c);
        }),
      );
      this.sparks.push(
        layers.get(`fx:spark:${i}`, k, -6, -6, 12, 12, (ctx) => {
          paintSpark(ctx, c);
        }),
      );
    });
  }

  /** Draws every live particle additively; `alpha` in [0, 1] interpolates within the tick. */
  draw(ctx: Ctx, k: number, alpha: number): void {
    if (this.live === 0) return;
    this.sprites(k);
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < MAX; i++) {
      const life = this.life[i] ?? 0;
      if (life <= 0) continue;
      const t = (this.age[i] ?? 0) / life;
      const fade = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
      const x = (this.x[i] ?? 0) + (this.vx[i] ?? 0) * alpha;
      const y = (this.y[i] ?? 0) + (this.vy[i] ?? 0) * alpha;
      const s = this.size[i] ?? 1;
      ctx.globalAlpha = prevAlpha * fade;
      if (this.kind[i] === STAR) {
        const layer = this.stars[this.tint[i] ?? 0];
        if (layer === undefined) continue;
        const a = (this.spin[i] ?? 0) + (this.age[i] ?? 0) * 0.06;
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a);
        ctx.scale(s, s);
        drawLayer(ctx, layer);
        ctx.restore();
      } else {
        const layer = this.sparks[this.tint[i] ?? 0];
        if (layer === undefined) continue;
        const w = 12 * s;
        ctx.drawImage(layer.canvas, x - w / 2, y - w / 2, w, w);
      }
    }
    ctx.globalCompositeOperation = prevOp;
    ctx.globalAlpha = prevAlpha;
  }
}
