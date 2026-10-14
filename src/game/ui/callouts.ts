// Text events over the playfield (guide 4.4, 7.5, 9): peg value popups, power and bonus labels,
// the shot total tally, style shot callouts with the overshoot pop, and the low-ball warnings.

import { layout } from '../layout';
import type { Ctx } from '../render/paint';
import { pegValueFrame, popIn, warningIn } from './motion';
import { drawText, formatNumber, textStyle } from './text';
import { type } from './tokens';

/** Small yellow value next to a hit peg, rising slightly as it fades. */
export function drawPegValue(ctx: Ctx, x: number, y: number, value: number, tMs: number): boolean {
  const f = pegValueFrame(tMs);
  if (f.done) return false;
  drawText(ctx, formatNumber(value), x, y - 13 - f.rise, textStyle.pegValue(), { alpha: f.alpha });
  return true;
}

/** Green power label at a green peg: the power name and its duration (9.4). */
export function drawPowerLabel(
  ctx: Ctx,
  x: number,
  y: number,
  power: string,
  duration: string,
  tMs: number,
): boolean {
  const f = popIn(tMs, 900);
  if (f.done) return false;
  const s = 1 + (f.scale - 1) * 0.5;
  drawText(ctx, power.toUpperCase(), x, y - 22, textStyle.powerLabel(), {
    scale: s,
    alpha: f.alpha,
  });
  if (duration.length > 0) {
    drawText(ctx, duration.toUpperCase(), x, y - 11, textStyle.powerLabel(), {
      scale: s * 0.85,
      alpha: f.alpha,
    });
  }
  return true;
}

/** Pink bonus label at the purple peg (9.4). */
export function drawBonusLabel(ctx: Ctx, x: number, y: number, text: string, tMs: number): boolean {
  const f = popIn(tMs, 700);
  if (f.done) return false;
  drawText(ctx, text.toUpperCase(), x, y - 22, textStyle.bonusPink(), {
    scale: 1 + (f.scale - 1) * 0.5,
    alpha: f.alpha,
  });
  return true;
}

export interface TallyContent {
  /** Sum of the hit pegs' values so far. */
  readonly sum: number;
  /** Pegs counted so far; undefined before the first one pops ("2,390 X PEGS"). */
  readonly pegs?: number;
  /** Style points earned this shot. */
  readonly style?: number;
}

/** Shot total block in the upper third of the playfield (9.2). */
export function drawShotTally(ctx: Ctx, t: TallyContent, alpha = 1): void {
  const { x, y } = layout.shotTally;
  const line1 =
    t.pegs === undefined
      ? `${formatNumber(t.sum)} X PEGS`
      : `${formatNumber(t.sum)} X ${t.pegs} ${t.pegs === 1 ? 'PEG' : 'PEGS'}`;
  drawText(ctx, line1, x, y - 14, textStyle.tally(type.shotTotalSmall), { alpha });
  if (t.pegs !== undefined) {
    drawText(ctx, formatNumber(t.sum * t.pegs), x, y + 10, textStyle.tally(type.shotTotalLarge), {
      alpha,
    });
  }
  if (t.style !== undefined && t.style > 0) {
    drawText(ctx, `+${formatNumber(t.style)} STYLE POINTS`, x, y + 33, textStyle.stylePoints(), {
      alpha,
    });
  }
}

/** Style shot callout where the event happened: name and +value, with the pop (9.3). */
export function drawStyleCallout(
  ctx: Ctx,
  x: number,
  y: number,
  name: string,
  value: number,
  tMs: number,
): boolean {
  const f = popIn(tMs);
  if (f.done) return false;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(f.scale, f.scale);
  drawText(ctx, name.toUpperCase(), 0, 0, textStyle.styleShot(), { alpha: f.alpha });
  drawText(
    ctx,
    `+${formatNumber(value)}`,
    0,
    16,
    { ...textStyle.styleShot(), cap: 10 },
    { alpha: f.alpha },
  );
  ctx.restore();
  return true;
}

/**
 * Low-ball warning (7.5): "3 BALLS LEFT" and "2 BALLS LEFT" settle small under the launcher;
 * "LAST BALL!" stays huge across the playfield.
 */
export function drawBallsWarning(ctx: Ctx, balls: number, tMs: number): boolean {
  const last = balls === 1;
  const text = last ? 'LAST BALL!' : `${balls} BALLS LEFT`;
  const cap = last ? type.warningHuge : type.warning;
  const f = warningIn(tMs, last ? 1.5 : 3.2);
  if (f.done) return false;
  const { x, y } = layout.warning;
  drawText(ctx, text, x, last ? 165 : y, textStyle.warning(cap), {
    scale: f.scale,
    alpha: f.alpha,
    maxWidth: 680,
  });
  return true;
}
