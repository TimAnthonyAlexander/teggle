// The ball (guide 5.1): polished steel that mirrors a blue sky above a warm horizon, a white
// specular spot right of center, and a dark copper rim. The Fireball variant is a burning ball
// with a flickering flame tail.

import { color } from '../ui/tokens';
import { rgba } from '../ui/color';
import { layers, drawLayer } from './cache';
import { circlePath, linear, radial, type Ctx } from './paint';

function paintBall(ctx: Ctx, r: number): void {
  circlePath(ctx, 0, 0, r);
  ctx.fillStyle = color.ballRim;
  ctx.fill();
  const ri = r * 0.9;
  ctx.save();
  circlePath(ctx, 0, 0, ri);
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0, -ri, 0, ri, [
    [0, '#4d7488'],
    [0.14, color.ballSkyDeep],
    [0.32, color.ballSky],
    [0.46, '#c3dde8'],
    [0.5, '#9a6a2a'],
    [0.54, color.ballHorizon],
    [0.64, '#a8700f'],
    [0.82, '#c49a3a'],
    [1, '#b8a058'],
  ]);
  ctx.fillRect(-ri, -ri, 2 * ri, 2 * ri);
  // Warm light reflected low on the left.
  const gx = -ri * 0.38;
  const gy = ri * 0.55;
  ctx.fillStyle = radial(ctx, gx, gy, 0, gx, gy, ri * 0.55, [
    [0, rgba(color.ballGoldLight, 0.9)],
    [1, rgba(color.ballGoldLight, 0)],
  ]);
  ctx.fillRect(-ri, -ri, 2 * ri, 2 * ri);
  // Edge falloff.
  ctx.fillStyle = radial(ctx, 0, 0, ri * 0.55, 0, 0, ri, [
    [0, 'rgba(0,0,0,0)'],
    [1, 'rgba(30,15,0,0.45)'],
  ]);
  ctx.fillRect(-ri, -ri, 2 * ri, 2 * ri);
  ctx.restore();
  // Specular spot right of center, high.
  const sx = r * 0.28;
  const sy = -r * 0.38;
  ctx.fillStyle = radial(ctx, sx, sy, 0, sx, sy, r * 0.42, [
    [0, 'rgba(255,255,255,1)'],
    [0.35, 'rgba(255,255,255,0.85)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  circlePath(ctx, sx, sy, r * 0.42);
  ctx.fill();
}

/** Steel ball, cached per radius and resolution. */
export function drawBall(ctx: Ctx, k: number, x: number, y: number, r = 6): void {
  const layer = layers.get(`ball:${r}`, k, -r - 0.5, -r - 0.5, 2 * r + 1, 2 * r + 1, (c) => {
    paintBall(c, r);
  });
  drawLayer(ctx, layer, x, y);
}

/** Ball shadow: a disc offset like the object shadows. */
export function drawBallShadow(ctx: Ctx, x: number, y: number, r = 6): void {
  circlePath(ctx, x - 4, y + 3, r);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();
}

/**
 * Fireball (spec 7, Wyvern): a burning ball of radius 10 with flames trailing opposite to its
 * motion. `vx, vy` give the direction of travel; `tMs` drives the flicker.
 */
export function drawFireball(
  ctx: Ctx,
  x: number,
  y: number,
  vx: number,
  vy: number,
  tMs: number,
  r = 10,
): void {
  const len = Math.hypot(vx, vy);
  const dx = len > 1e-6 ? -vx / len : 0;
  const dy = len > 1e-6 ? -vy / len : -1;
  const ang = Math.atan2(dy, dx);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Outer heat glow.
  ctx.fillStyle = radial(ctx, x, y, r * 0.5, x, y, r * 2.6, [
    [0, 'rgba(255,170,40,0.55)'],
    [1, 'rgba(255,60,0,0)'],
  ]);
  circlePath(ctx, x, y, r * 2.6);
  ctx.fill();
  // Flame tongues trailing behind.
  ctx.translate(x, y);
  ctx.rotate(ang);
  for (let i = 0; i < 5; i++) {
    const phase = tMs / 70 + i * 1.7;
    const tongue = r * (1.9 + 0.55 * Math.sin(phase) + (i % 2) * 0.5);
    const spread = (i - 2) * 0.32 + 0.12 * Math.sin(phase * 1.3);
    ctx.save();
    ctx.rotate(spread);
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.7);
    ctx.quadraticCurveTo(tongue * 0.6, -r * 0.55, tongue, 0);
    ctx.quadraticCurveTo(tongue * 0.6, r * 0.55, 0, r * 0.7);
    ctx.closePath();
    ctx.fillStyle = linear(ctx, 0, 0, tongue, 0, [
      [0, 'rgba(255,230,120,0.75)'],
      [0.45, 'rgba(255,120,20,0.55)'],
      [1, 'rgba(200,20,0,0)'],
    ]);
    ctx.fill();
    ctx.restore();
  }
  ctx.restore();
  // Burning core.
  circlePath(ctx, x, y, r);
  ctx.fillStyle = radial(ctx, x - r * 0.2, y - r * 0.25, 0, x, y, r, [
    [0, '#fffbe0'],
    [0.35, '#ffe170'],
    [0.7, '#ff9a1c'],
    [1, '#d23a06'],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = 'rgba(120,20,0,0.8)';
  ctx.stroke();
  // Surface flicker.
  ctx.save();
  circlePath(ctx, x, y, r);
  ctx.clip();
  for (let i = 0; i < 3; i++) {
    const a = tMs / 160 + i * 2.1;
    const fx = x + Math.cos(a) * r * 0.45;
    const fy = y + Math.sin(a * 1.3) * r * 0.45;
    ctx.fillStyle = radial(ctx, fx, fy, 0, fx, fy, r * 0.45, [
      [0, 'rgba(255,255,220,0.55)'],
      [1, 'rgba(255,200,80,0)'],
    ]);
    circlePath(ctx, fx, fy, r * 0.45);
    ctx.fill();
  }
  ctx.restore();
}
