// The cannon that hangs from the launcher housing and turns around the pivot, and the aim
// guide dots (guide 5.2, 5.3). Angles are radians from straight down, positive toward +x, the
// same convention as src/sim/aim.ts.

import { color } from '../ui/tokens';
import { darken, lighten, rgba } from '../ui/color';
import { drawLayer, layers } from './cache';
import { circlePath, linear, radial, rivet, type Ctx } from './paint';
import { drawBall } from './ball';
import { CANNON_BALL_REACH } from '../layout';

const BRONZE = '#c98d4f';

/** Polished bronze across a cylinder of half width w: dark rims, a bright streak left of center. */
function bronzeAcross(ctx: Ctx, w: number) {
  return linear(ctx, -w, 0, w, 0, [
    [0, darken(BRONZE, 0.55)],
    [0.12, darken(BRONZE, 0.15)],
    [0.28, lighten(BRONZE, 0.55)],
    [0.36, '#fff4dc'],
    [0.46, lighten(BRONZE, 0.35)],
    [0.7, BRONZE],
    [0.9, darken(BRONZE, 0.4)],
    [1, darken(BRONZE, 0.65)],
  ]);
}

function paintCannon(ctx: Ctx): void {
  // Local frame: pivot at the origin, barrel along +y. The collar sits on the housing ring
  // (about 50 below the pivot) and the muzzle ends at the barrel length, 86.
  const bodyTop = 56;
  const muzzle = 86;
  // Barrel: a fat tapered cylinder.
  ctx.beginPath();
  ctx.moveTo(-12, bodyTop);
  ctx.lineTo(12, bodyTop);
  ctx.lineTo(8.6, muzzle - 7);
  ctx.lineTo(-8.6, muzzle - 7);
  ctx.closePath();
  ctx.fillStyle = bronzeAcross(ctx, 12);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  // Muzzle flare.
  ctx.beginPath();
  ctx.moveTo(-8.6, muzzle - 7.5);
  ctx.lineTo(8.6, muzzle - 7.5);
  ctx.quadraticCurveTo(9.2, muzzle - 3, 12, muzzle);
  ctx.lineTo(-12, muzzle);
  ctx.quadraticCurveTo(-9.2, muzzle - 3, -8.6, muzzle - 7.5);
  ctx.closePath();
  ctx.fillStyle = bronzeAcross(ctx, 12);
  ctx.fill();
  ctx.stroke();
  // Teal band where the barrel leaves the collar.
  ctx.beginPath();
  ctx.ellipse(0, bodyTop + 3, 12.6, 3.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, -12, 0, 12, 0, [
    [0, color.tealDeep],
    [0.3, '#8fd3dd'],
    [0.6, color.tealLipDark],
    [1, '#0d2c31'],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#0b2226';
  ctx.stroke();
  // Teal muzzle ring and the dark bore.
  ctx.beginPath();
  ctx.ellipse(0, muzzle, 12, 3.2, 0, 0, Math.PI * 2);
  ctx.fillStyle = linear(ctx, 0, muzzle - 3, 0, muzzle + 3, [
    [0, color.tealLip],
    [0.5, color.tealLipDark],
    [1, color.tealDeep],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = '#0b2226';
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, muzzle + 0.3, 8, 1.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#05090a';
  ctx.fill();
  // Collar: a dome cap riding on the housing ring, teal band along its edge.
  ctx.beginPath();
  ctx.moveTo(-24, 60);
  ctx.bezierCurveTo(-24, 51, -13, 46.5, 0, 46.5);
  ctx.bezierCurveTo(13, 46.5, 24, 51, 24, 60);
  ctx.quadraticCurveTo(0, 56, -24, 60);
  ctx.closePath();
  ctx.fillStyle = linear(ctx, -24, 46, 18, 60, [
    [0, lighten(BRONZE, 0.6)],
    [0.4, BRONZE],
    [1, darken(BRONZE, 0.5)],
  ]);
  ctx.fill();
  ctx.lineWidth = 0.9;
  ctx.strokeStyle = color.brassOutline;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-21.5, 58.5);
  ctx.bezierCurveTo(-21, 52, -12, 49, 0, 49);
  ctx.bezierCurveTo(12, 49, 21, 52, 21.5, 58.5);
  ctx.lineCap = 'round';
  ctx.lineWidth = 3.6;
  ctx.strokeStyle = color.tealDeep;
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color.tealLipDark;
  ctx.stroke();
  ctx.lineWidth = 0.8;
  ctx.strokeStyle = rgba(lighten(color.tealLip, 0.5), 0.9);
  ctx.save();
  ctx.translate(-0.4, -0.6);
  ctx.stroke();
  ctx.restore();
  // Highlight across the dome.
  ctx.beginPath();
  ctx.ellipse(-7, 52.5, 7, 1.8, -0.15, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,248,230,0.6)';
  ctx.fill();
  rivet(ctx, -26.5, 53, 2);
  rivet(ctx, 26.5, 53, 2);
}

/**
 * Draws the cannon turned to `angle` around the pivot, with the loaded ball when `loaded`.
 * The pivot is the physics pivot (layout.CANNON_PIVOT).
 */
export function drawCannon(
  ctx: Ctx,
  k: number,
  pivotX: number,
  pivotY: number,
  angle: number,
  loaded: boolean,
): void {
  const layer = layers.get('cannon', k, -31, 40, 62, 50, paintCannon);
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(-angle);
  drawLayer(ctx, layer);
  if (loaded) drawBall(ctx, k, 0, CANNON_BALL_REACH);
  ctx.restore();
}

// ---------------------------------------------------------------------------------------------
// Aim guide

function paintGuideDot(ctx: Ctx, tint: string, core: string): void {
  // Soft square: alpha 0, 59, 145, 207, 248, 255 from the edge of a 15-unit sprite (5.3).
  const steps: [number, number][] = [
    [0.5, 0.23],
    [1.5, 0.57],
    [2.5, 0.81],
    [3.5, 0.97],
  ];
  let covered = 0;
  for (const [inset, a] of steps) {
    // Each layer adds just enough opacity to reach the target alpha at its inset.
    const add = (a - covered) / (1 - covered);
    covered = a;
    ctx.beginPath();
    ctx.roundRect(-7.5 + inset, -7.5 + inset, 15 - 2 * inset, 15 - 2 * inset, 3 - inset * 0.5);
    ctx.fillStyle = rgba(tint, add);
    ctx.fill();
  }
  ctx.beginPath();
  ctx.roundRect(-3, -3, 6, 6, 1.5);
  ctx.fillStyle = rgba(core, 0.55);
  ctx.fill();
}

/**
 * Draws the aim guide: soft aqua squares at the given path points (equal time steps from the
 * muzzle), growing from 10 to 14 units along the path, then an arrowhead. The first two dots
 * are paler. `points` holds x0, y0, x1, y1, ...
 */
export function drawAimGuide(ctx: Ctx, k: number, points: ArrayLike<number>, count: number): void {
  if (count < 1) return;
  const dot = layers.get('guide-dot', k, -7.5, -7.5, 15, 15, (c) => {
    paintGuideDot(c, '#62d6c4', color.guideDotHot);
  });
  for (let i = 0; i < count; i++) {
    const x = points[2 * i] ?? 0;
    const y = points[2 * i + 1] ?? 0;
    const f = count > 1 ? i / (count - 1) : 1;
    const s = (10 + 4 * f) / 12;
    ctx.save();
    ctx.globalAlpha *= i === 0 ? 0.4 : i === 1 ? 0.65 : 0.95;
    ctx.drawImage(dot.canvas, x - 7.5 * s, y - 7.5 * s, 15 * s, 15 * s);
    ctx.restore();
  }
  if (count >= 2) {
    const x1 = points[2 * (count - 1)] ?? 0;
    const y1 = points[2 * (count - 1) + 1] ?? 0;
    const x0 = points[2 * (count - 2)] ?? 0;
    const y0 = points[2 * (count - 2) + 1] ?? 0;
    const a = Math.atan2(y1 - y0, x1 - x0);
    const d = Math.hypot(x1 - x0, y1 - y0);
    drawGuideArrow(ctx, x1 + Math.cos(a) * d * 0.95, y1 + Math.sin(a) * d * 0.95, a);
  }
}

function drawGuideArrow(ctx: Ctx, x: number, y: number, angle: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-4, -7.5);
  ctx.lineTo(-1, 0);
  ctx.lineTo(-4, 7.5);
  ctx.closePath();
  ctx.lineJoin = 'round';
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = rgba('#62d6c4', 0.45);
  ctx.stroke();
  ctx.fillStyle = rgba('#7fe8d6', 0.95);
  ctx.fill();
  ctx.restore();
}

/** Bounce marker of the Guide power: a yellow arrow with a black outline (5.3). */
export function drawGuideHit(ctx: Ctx, x: number, y: number, angle: number, tMs: number): void {
  const pulse = 1 + 0.12 * Math.sin(tMs / 90);
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = radial(ctx, 0, 0, 0, 0, 0, 11, [
    [0, 'rgba(255,250,120,0.7)'],
    [1, 'rgba(255,200,0,0)'],
  ]);
  circlePath(ctx, 0, 0, 11 * pulse);
  ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
  ctx.rotate(angle);
  ctx.scale(pulse, pulse);
  ctx.beginPath();
  ctx.moveTo(6.5, 0);
  ctx.lineTo(-5, -6.5);
  ctx.lineTo(-5, 6.5);
  ctx.closePath();
  ctx.fillStyle = color.guideHit;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#000000';
  ctx.stroke();
  ctx.restore();
}
