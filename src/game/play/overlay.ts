// Everything drawn over the playfield in screen space: style callouts and free ball notices,
// the shot tally, low-ball warnings, the coin flip, the Fever finish (fireworks are particles;
// the rainbow arch and its tally are here), the Fever title, the rainbow trail and the thin
// frame shown while the camera zooms. Teggle's own lettering throughout (guide 15).

import {
  POWER_STYLE_SHOTS,
  STYLE_POINTS as STYLE_SHOT_POINTS,
  styleShotName,
  styleShotPoints,
  type StyleShot,
  type StyleShotId,
} from '../../rules/style';
import { FREE_BALL_THRESHOLDS } from '../../rules/tuning';
import { CENTER_X, WORLD_H, WORLD_W } from '../layout';
import { createCanvas, context2d, drawLayer, layers, type Layer } from '../render/cache';
import { circlePath, linear, radial, roundRect, type Ctx } from '../render/paint';
import { drawBallsWarning } from '../ui/callouts';
import { ease, popIn } from '../ui/motion';
import {
  drawText,
  drawTextOnArc,
  formatNumber,
  measureText,
  textStyle,
  type TextStyle,
} from '../ui/text';
import { color, type } from '../ui/tokens';
import type { FeverShow } from './fever';
import { COIN, thresholdNotice, type Presenter } from './presenter';
import { drawTextSprite, TextSprites } from './text-sprites';
import { stylePointsLine, tallyLine1, tallyLine2, TALLY_FADE_MS } from './timing';

// ---------------------------------------------------------------------------------------------
// Styles, built once

const STYLE_NAME: TextStyle = textStyle.styleShot();
const STYLE_VALUE: TextStyle = { ...textStyle.styleShot(), cap: 10 };
const BONUS: TextStyle = textStyle.bonusPink();
const NOTICE: TextStyle = {
  cap: 14,
  fill: [
    [0, '#f4ffb8'],
    [0.5, '#b6ff5a'],
    [1, '#3fd13b'],
  ],
  outline: { color: '#0a2c08', width: 2 },
  align: 'center',
  anchor: 'middle',
};
const NOTICE_SUB: TextStyle = { ...textStyle.styleShot(), cap: 9 };
const TALLY_SMALL = textStyle.tally(type.shotTotalSmall);
const TALLY_LARGE = textStyle.tally(type.shotTotalLarge);
const STYLE_POINTS = textStyle.stylePoints();
const COIN_WIN: TextStyle = { ...NOTICE, cap: 18 };
const COIN_LOSE: TextStyle = textStyle.warning(16);
const BIG = textStyle.bigNumber(46);
const FINISH_LINE: TextStyle = {
  cap: 13,
  fill: [
    [0, '#fffbd0'],
    [0.5, '#ffd84a'],
    [1, '#ff9a12'],
  ],
  outline: { color: '#2a0c00', width: 2 },
  align: 'center',
  anchor: 'middle',
};
/** Teggle's Fever lettering: hot gradient caps with a dark red outline and a magenta halo. */
const TITLE: TextStyle = {
  face: 'caps',
  cap: 78,
  fill: [
    [0, '#fffbd0'],
    [0.22, '#ffe14a'],
    [0.55, '#ff8a1a'],
    [0.82, '#f0420e'],
    [1, '#b81a08'],
  ],
  outline: { color: '#4a0600', width: 3.2 },
  outerOutline: { color: 'rgba(255, 70, 190, 0.95)', width: 6.5 },
  glow: { color: 'rgba(255, 40, 170, 0.85)', blur: 16 },
  sheen: 0.55,
  align: 'center',
  anchor: 'middle',
};
const TITLE_FULL: TextStyle = { ...TITLE, cap: 84 };
const ARCH_TEXT: TextStyle = {
  cap: 30,
  fill: [
    [0, '#ffffff'],
    [0.5, '#e6f8ff'],
    [1, '#8fd3ff'],
  ],
  outline: { color: '#13207a', width: 2.6 },
  outerOutline: { color: 'rgba(255,255,255,0.85)', width: 4 },
};

// ---------------------------------------------------------------------------------------------
// Callouts and the tally

export class Overlay {
  readonly sprites = new TextSprites();
  private tallyPopped = -1;
  private tallySum = -1;
  private line1 = '';
  private line2: string | null = null;
  private styleLine = '';
  private coinK = 0;
  private heads: Layer | null = null;
  private tails: Layer | null = null;
  private archK = 0;
  private arch: HTMLCanvasElement | null = null;
  private finishValue = -1;
  private finishText = '';
  private ballsLine = '';
  private bonusLine = '';
  private bucketLine = '';

  /**
   * Builds the sprites of every style shot callout and free ball notice at resolution `k`, so a
   * callout's first frame does not wait for its lettering. Called when the level loads and when
   * the resolution changes.
   */
  prebuildCallouts(k: number): void {
    const shots: StyleShot[] = [
      ...(Object.keys(STYLE_SHOT_POINTS) as StyleShotId[]),
      ...Object.values(POWER_STYLE_SHOTS).map((s) => s.shot),
    ];
    for (const shot of shots) {
      this.sprites.get(k, 'styleName', STYLE_NAME, `${styleShotName(shot).toUpperCase()}!`);
      const points = styleShotPoints(shot);
      if (points !== null) {
        this.sprites.get(k, 'styleValue', STYLE_VALUE, `+${formatNumber(points)}`);
      }
    }
    this.sprites.get(k, 'notice', NOTICE, 'FREE BALL!');
    for (const line of [
      'BUCKET CATCH',
      'LUCKY SPIN',
      ...FREE_BALL_THRESHOLDS.map(thresholdNotice),
    ]) {
      this.sprites.get(k, 'noticeSub', NOTICE_SUB, line);
    }
  }

  /** Style shots, the bonus peg label and free ball notices, with the overshoot pop (9.3). */
  drawCallouts(ctx: Ctx, k: number, pres: Presenter): void {
    const now = pres.gameMs;
    for (const c of pres.callouts) {
      if (!c.active) continue;
      const f = popIn(now - c.t0, c.hold);
      if (f.done || f.alpha <= 0) continue;
      if (c.kind === 'style') {
        const s = f.scale;
        drawTextSprite(
          ctx,
          this.sprites.get(k, 'styleName', STYLE_NAME, c.line1),
          c.x,
          c.y,
          s,
          f.alpha,
        );
        drawTextSprite(
          ctx,
          this.sprites.get(k, 'styleValue', STYLE_VALUE, c.line2),
          c.x,
          c.y + 16 * s,
          s,
          f.alpha,
        );
      } else if (c.kind === 'bonus') {
        const s = 1 + (f.scale - 1) * 0.5;
        drawTextSprite(ctx, this.sprites.get(k, 'bonus', BONUS, c.line1), c.x, c.y, s, f.alpha);
      } else {
        const s = 1 + (f.scale - 1) * 0.6;
        drawTextSprite(ctx, this.sprites.get(k, 'notice', NOTICE, c.line1), c.x, c.y, s, f.alpha);
        if (c.line2.length > 0) {
          drawTextSprite(
            ctx,
            this.sprites.get(k, 'noticeSub', NOTICE_SUB, c.line2),
            c.x,
            c.y + 17 * s,
            s,
            f.alpha,
          );
        }
      }
    }
  }

  /** The shot total block (9.2): "sum X n PEGS", the running product, style points. */
  drawTally(ctx: Ctx, pres: Presenter): void {
    const t = pres.tally;
    if (!t.visible) return;
    // The winning shot's total goes into the Fever score under the arch instead.
    const f = pres.fever;
    if (f.active && f.archStart > 0 && pres.gameMs - f.t0 >= f.archStart) return;
    if (t.popped !== this.tallyPopped || t.sum !== this.tallySum) {
      this.tallyPopped = t.popped;
      this.tallySum = t.sum;
      this.line1 = tallyLine1(t.sum, t.popped);
      this.line2 = tallyLine2(t.sum, t.popped);
      this.styleLine = stylePointsLine(t.style);
    }
    const alpha = Math.min(1, (pres.gameMs - t.t0) / TALLY_FADE_MS);
    if (alpha <= 0) return;
    const x = CENTER_X;
    const y = 216;
    drawText(ctx, this.line1, x, y - 14, TALLY_SMALL, { alpha });
    if (this.line2 !== null) drawText(ctx, this.line2, x, y + 10, TALLY_LARGE, { alpha });
    if (t.style > 0) drawText(ctx, this.styleLine, x, y + 33, STYLE_POINTS, { alpha });
  }

  /** "3 BALLS LEFT", "2 BALLS LEFT", "LAST BALL!" (7.5). */
  drawWarning(ctx: Ctx, pres: Presenter): void {
    if (pres.warningBalls <= 0) return;
    drawBallsWarning(ctx, pres.warningBalls, pres.gameMs - pres.warningMs);
  }

  // -------------------------------------------------------------------------------------------
  // Coin flip (guide 12.3): Teggle's own coin, tossed, spinning, landing on its face

  private coinFaces(k: number): void {
    if (k === this.coinK && this.heads !== null) return;
    this.coinK = k;
    this.heads = layers.get('coin:heads', k, -50, -50, 100, 100, (c) => {
      paintCoin(c, true);
    });
    this.tails = layers.get('coin:tails', k, -50, -50, 100, 100, (c) => {
      paintCoin(c, false);
    });
  }

  drawCoin(ctx: Ctx, k: number, pres: Presenter): void {
    if (!pres.coinActive) return;
    const t = pres.gameMs - pres.coinT0;
    const total = COIN.spin + COIN.show + COIN.fade;
    if (t < 0 || t >= total) return;
    this.coinFaces(k);
    const x = CENTER_X;
    const baseY = 250;
    const spinT = Math.min(1, t / COIN.spin);
    // Half turns: an even count lands heads (a free ball), an odd count tails.
    const halfTurns = pres.coinWon ? 10 : 9;
    const phase = ease.outCubic(spinT) * halfTurns * Math.PI;
    const sx = Math.cos(phase);
    const toss = Math.sin(Math.PI * spinT) * 46;
    const fade = t < COIN.spin + COIN.show ? 1 : 1 - (t - COIN.spin - COIN.show) / COIN.fade;
    const pop = t < 120 ? ease.outBack(1.6)(t / 120) : 1;
    const y = baseY - toss;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * fade;
    // Shadow on the board below.
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(x - 4, baseY + 54, 40 * Math.max(0.25, Math.abs(sx)) * pop, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    // Edge: a gold band whose width shows the coin's thickness as it turns.
    const thick = 6 * Math.sqrt(Math.max(0, 1 - sx * sx));
    if (thick > 0.3) {
      ctx.fillStyle = '#8a5a1a';
      roundRect(
        ctx,
        -44 * Math.abs(sx) - thick / 2,
        -44,
        88 * Math.abs(sx) + thick,
        88,
        44 * Math.max(0.02, Math.abs(sx)),
      );
      ctx.fill();
    }
    ctx.scale(Math.max(0.02, Math.abs(sx)), 1);
    const face = sx >= 0 ? this.heads : this.tails;
    if (face !== null) drawLayer(ctx, face);
    ctx.restore();
    if (t >= COIN.spin) {
      const f = popIn(t - COIN.spin, COIN.show - 250);
      const text = pres.coinWon ? 'FREE BALL!' : 'NO FREE BALL';
      const style = pres.coinWon ? COIN_WIN : COIN_LOSE;
      const sprite = this.sprites.get(k, pres.coinWon ? 'coinWin' : 'coinLose', style, text);
      drawTextSprite(ctx, sprite, x, baseY + 78, 1 + (f.scale - 1) * 0.5, Math.min(1, f.alpha));
    }
    ctx.globalAlpha = prevAlpha;
  }

  // -------------------------------------------------------------------------------------------
  // Fever finish: the rainbow arch with the Fever score and the level-end bonuses (12.5)

  private archLayer(k: number): HTMLCanvasElement {
    if (this.arch !== null && this.archK === k) return this.arch;
    this.archK = k;
    const c = createCanvas(WORLD_W * k, WORLD_H * k);
    const ctx = context2d(c);
    ctx.scale(c.width / WORLD_W, c.height / WORLD_H);
    paintArch(ctx);
    this.arch = c;
    return c;
  }

  drawFeverFinish(ctx: Ctx, k: number, pres: Presenter): void {
    const f = pres.fever;
    if (!f.active || f.archStart <= 0) return;
    const t = pres.gameMs - f.t0;
    if (t < f.archStart || t > f.dialogAt + 200) return;
    const fade = t < f.fadeStart ? 1 : Math.max(0, 1 - (t - f.fadeStart) / 450);
    const prevAlpha = ctx.globalAlpha;
    // The arch draws in from the right.
    const p = ease.inOutSine(Math.min(1, (t - f.archStart) / 700));
    if (fade > 0 && p > 0) {
      ctx.save();
      ctx.globalAlpha = prevAlpha * fade;
      ctx.beginPath();
      ctx.moveTo(ARCH.x, ARCH.y);
      ctx.arc(ARCH.x, ARCH.y, ARCH.r + 40, 0, -Math.PI * p, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(this.archLayer(k), 0, 0, WORLD_W, WORLD_H);
      ctx.restore();
    }
    if (t < f.countStart) return;
    // The Fever score counts up, then the bucket joins it.
    const ct = Math.min(1, (t - f.countStart) / f.countMs);
    let value = Math.round(f.shotScore * ease.outCubic(ct));
    if (f.bucketAt >= 0 && t >= f.bucketAt) {
      value = f.shotScore + Math.round(f.bucketPoints * Math.min(1, (t - f.bucketAt) / 350));
    }
    if (value !== this.finishValue) {
      this.finishValue = value;
      this.finishText = formatNumber(value);
    }
    const numberFade = t < f.fadeStart + 250 ? 1 : Math.max(0, 1 - (t - f.fadeStart - 250) / 450);
    const rise = t < f.fadeStart + 250 ? 0 : (t - f.fadeStart - 250) * 0.05;
    drawText(ctx, this.finishText, CENTER_X, 292 - rise, BIG, { alpha: numberFade });
    let y = 334 - rise;
    if (f.bucketAt >= 0 && t >= f.bucketAt) {
      if (this.bucketLine === '') this.bucketLine = `+${formatNumber(f.bucketPoints)} FEVER BUCKET`;
      this.finishLine(ctx, this.bucketLine, y, t - f.bucketAt, numberFade);
      y += 22;
    }
    if (f.ballsAt >= 0 && t >= f.ballsAt) {
      if (this.ballsLine === '') {
        const n = f.unusedBalls;
        this.ballsLine = `+${formatNumber(f.unusedPoints)} FOR ${n} ${n === 1 ? 'BALL' : 'BALLS'} LEFT`;
      }
      this.finishLine(ctx, this.ballsLine, y, t - f.ballsAt, numberFade);
      y += 22;
    }
    if (f.bonusAt >= 0 && t >= f.bonusAt) {
      if (this.bonusLine === '') this.bonusLine = `+${formatNumber(f.clearBonus)} CLEAR BONUS`;
      this.finishLine(ctx, this.bonusLine, y, t - f.bonusAt, numberFade);
    }
    ctx.globalAlpha = prevAlpha;
  }

  private finishLine(ctx: Ctx, text: string, y: number, t: number, alpha: number): void {
    const f = popIn(t, 100_000);
    drawText(ctx, text, CENTER_X, y, FINISH_LINE, {
      scale: 1 + (f.scale - 1) * 0.4,
      alpha: alpha * f.alpha,
    });
  }

  /** Forgets per-attempt texts. */
  resetAttempt(): void {
    this.bucketLine = '';
    this.ballsLine = '';
    this.bonusLine = '';
    this.finishValue = -1;
  }

  // -------------------------------------------------------------------------------------------
  // Fever title (12.5): letters fly in from both sides, hold, fly out

  drawFeverTitle(ctx: Ctx, k: number, show: FeverShow, now: number): void {
    const title = show.title;
    if (title === null) return;
    const lines = title === 'fever' ? FEVER_LINES : FULL_CLEAR_LINES;
    const style = title === 'fever' ? TITLE : TITLE_FULL;
    const styleId = title === 'fever' ? 'title' : 'titleFull';
    let index = 0;
    let anyVisible = false;
    for (let l = 0; l < lines.length; l++) {
      const word = lines[l] ?? '';
      const y = title === 'fever' ? 112 : 150 + l * 128;
      const advances = this.advances(ctx, style, word);
      let width = 0;
      for (const a of advances) width += a;
      let x = CENTER_X - width / 2;
      for (let c = 0; c < word.length; c++) {
        const ch = word.charAt(c);
        const adv = advances[c] ?? 0;
        const slot = x + adv / 2;
        x += adv;
        const i = index++;
        const fromLeft = i % 2 === 0;
        const tIn = (now - show.titleIn - i * 70) / 280;
        if (tIn <= 0) continue;
        let px: number;
        let alpha: number;
        const tOut = (now - show.titleOut - i * 35) / 240;
        if (tOut > 0) {
          if (tOut >= 1) continue;
          const toLeft = slot < CENTER_X;
          const target = toLeft ? -140 : WORLD_W + 140;
          px = slot + (target - slot) * (tOut * tOut * tOut);
          alpha = 1 - tOut * 0.5;
        } else {
          const p = Math.min(1, tIn);
          const from = fromLeft ? -140 : WORLD_W + 140;
          px = from + (slot - from) * ease.outBack(1.3)(p);
          alpha = Math.min(1, p * 3);
        }
        anyVisible = true;
        const bob = Math.sin((now + i * 130) / 95) * 1.4;
        const sprite = this.sprites.get(k, styleId, style, ch);
        drawTextSprite(ctx, sprite, px, y + bob, 1, alpha);
        // A flicker of heat over each letter.
        const prevOp = ctx.globalCompositeOperation;
        ctx.globalCompositeOperation = 'lighter';
        drawTextSprite(
          ctx,
          sprite,
          px,
          y + bob - 1,
          1.02,
          alpha * (0.12 + 0.1 * Math.sin((now + i * 77) / 60)),
        );
        ctx.globalCompositeOperation = prevOp;
      }
    }
    if (!anyVisible && now > show.titleOut) show.title = null;
  }

  private readonly titleAdvances = new Map<TextStyle, Map<string, number[]>>();

  /** Letter advances of a title word in its font, plus the room its thick outline needs. */
  private advances(ctx: Ctx, style: TextStyle, word: string): number[] {
    let byWord = this.titleAdvances.get(style);
    if (byWord === undefined) {
      byWord = new Map();
      this.titleAdvances.set(style, byWord);
    }
    let a = byWord.get(word);
    if (a === undefined) {
      a = [];
      for (let i = 0; i < word.length; i++) {
        a.push(measureText(ctx, word.charAt(i), style) + style.cap * 0.06);
      }
      byWord.set(word, a);
    }
    return a;
  }

  // -------------------------------------------------------------------------------------------
  // Rainbow trail and the zoom frame

  /** The rainbow trail behind the ball during Fever: red tail to violet head (12.5). */
  drawTrail(ctx: Ctx, show: FeverShow, headX: number, headY: number): void {
    const n = show.trailCount;
    if (n < 2) return;
    const trail = show.trail;
    const cap = trail.length / 2;
    const start = (show.trailHead - n + cap) % cap;
    const prevOp = ctx.globalCompositeOperation;
    const prevAlpha = ctx.globalAlpha;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let pass = 0; pass < 2; pass++) {
      ctx.globalCompositeOperation = pass === 0 ? 'lighter' : prevOp;
      for (let j = 0; j < n; j++) {
        const a = (start + j) % cap;
        const x0 = trail[2 * a] ?? 0;
        const y0 = trail[2 * a + 1] ?? 0;
        let x1 = headX;
        let y1 = headY;
        if (j < n - 1) {
          const b = (start + j + 1) % cap;
          x1 = trail[2 * b] ?? 0;
          y1 = trail[2 * b + 1] ?? 0;
        }
        const f = j / (n - 1);
        const band = Math.min(6, Math.floor(f * 7));
        ctx.strokeStyle = color.rainbow[band] ?? '#ffffff';
        ctx.lineWidth = pass === 0 ? 6 + 12 * f : 2 + 7 * f;
        ctx.globalAlpha = prevAlpha * (pass === 0 ? 0.28 * f : 0.35 + 0.65 * f);
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = prevAlpha;
    ctx.globalCompositeOperation = prevOp;
  }

  /** The thin light-blue frame that replaces the machine while the camera is zoomed (12.5). */
  drawZoomFrame(ctx: Ctx, alpha: number): void {
    if (alpha <= 0) return;
    const prevAlpha = ctx.globalAlpha;
    ctx.globalAlpha = prevAlpha * alpha;
    roundRect(ctx, 3, 3, WORLD_W - 6, WORLD_H - 6, 22);
    ctx.lineWidth = 7;
    ctx.strokeStyle = '#0b2a52';
    ctx.stroke();
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#9fdcff';
    ctx.stroke();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    roundRect(ctx, 4.5, 4.5, WORLD_W - 9, WORLD_H - 9, 21);
    ctx.stroke();
    ctx.globalAlpha = prevAlpha;
  }
}

const FEVER_LINES: readonly string[] = ['FEVER'];
const FULL_CLEAR_LINES: readonly string[] = ['FULL', 'CLEAR', 'FEVER'];

// ---------------------------------------------------------------------------------------------
// Painters (cached layers)

const ARCH = { x: CENTER_X + 3, y: 583, r: 420, band: 73 } as const;

function paintArch(ctx: Ctx): void {
  const bands = color.rainbow;
  const w = ARCH.band / bands.length;
  // Soft glow outside the arch.
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.beginPath();
  ctx.arc(ARCH.x, ARCH.y, ARCH.r + 10, Math.PI, 0);
  ctx.lineWidth = 26;
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.stroke();
  ctx.restore();
  bands.forEach((c, i) => {
    ctx.beginPath();
    ctx.arc(ARCH.x, ARCH.y, ARCH.r - w * (i + 0.5), Math.PI, 0);
    ctx.lineWidth = w + 0.6;
    ctx.strokeStyle = c;
    ctx.stroke();
  });
  // Gloss along the outer red band and a soft shade along the inner edge.
  ctx.beginPath();
  ctx.arc(ARCH.x, ARCH.y, ARCH.r - w * 0.3, Math.PI, 0);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ARCH.x, ARCH.y, ARCH.r - ARCH.band, Math.PI, 0);
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(30,0,80,0.6)';
  ctx.stroke();
  drawTextOnArc(ctx, 'FEVER SCORE', ARCH.x, ARCH.y, ARCH.r - ARCH.band / 2 - 15, 0, ARCH_TEXT, {
    maxAngle: 1.5,
  });
}

/** Teggle's coin: a gold rim with a reeded edge around an enamel face. */
function paintCoin(ctx: Ctx, heads: boolean): void {
  const r = 44;
  circlePath(ctx, 0, 0, r + 1);
  ctx.fillStyle = '#3a2408';
  ctx.fill();
  circlePath(ctx, 0, 0, r);
  ctx.fillStyle = radial(ctx, -14, -18, 4, 0, 0, r, [
    [0, '#fff4cc'],
    [0.35, '#f0c85a'],
    [0.75, '#c08a26'],
    [1, '#7a4f10'],
  ]);
  ctx.fill();
  // Reeded rim.
  ctx.strokeStyle = 'rgba(90,55,10,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5));
    ctx.lineTo(Math.cos(a) * (r - 1), Math.sin(a) * (r - 1));
    ctx.stroke();
  }
  const fr = r - 8;
  circlePath(ctx, 0, 0, fr);
  ctx.fillStyle = heads
    ? radial(ctx, -8, -10, 2, 0, 0, fr, [
        [0, '#7dffa0'],
        [0.5, '#16a84a'],
        [1, '#0a4a22'],
      ])
    : radial(ctx, -8, -10, 2, 0, 0, fr, [
        [0, '#ff9a8a'],
        [0.5, '#b8261a'],
        [1, '#4a0a06'],
      ]);
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#5a3a0a';
  ctx.stroke();
  // A steel ball on the face: plain on heads, crossed out on tails.
  circlePath(ctx, 0, -2, 13);
  ctx.fillStyle = linear(ctx, 0, -15, 0, 11, [
    [0, color.ballSkyDeep],
    [0.45, color.ballSkyLight],
    [0.52, color.ballHorizon],
    [1, '#c49a3a'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#2a1a06';
  ctx.stroke();
  circlePath(ctx, 4, -7, 3.5);
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  ctx.fill();
  if (heads) {
    drawText(ctx, '+1', 0, 24, {
      cap: 9,
      fill: '#ffffff',
      outline: { color: '#0a3a18', width: 1.4 },
      align: 'center',
      anchor: 'middle',
    });
  } else {
    ctx.beginPath();
    ctx.moveTo(-14, -16);
    ctx.lineTo(14, 12);
    ctx.moveTo(14, -16);
    ctx.lineTo(-14, 12);
    ctx.lineCap = 'round';
    ctx.lineWidth = 5;
    ctx.strokeStyle = '#2a0402';
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#ff4a3a';
    ctx.stroke();
  }
  // Shine across the upper left.
  ctx.save();
  circlePath(ctx, 0, 0, r);
  ctx.clip();
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath();
  ctx.ellipse(-16, -22, 26, 10, -0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
