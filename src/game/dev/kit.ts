// DEV ONLY: #/dev/kit/<page>. Every UI kit component in every state, for visual review against
// the original's design grammar. Not linked from any menu. Sample numbers on these pages are
// review fixtures, not game data. Left and right arrow keys or the page tabs switch pages; the
// query `t=<ms>` freezes animated samples at that time (used by the screenshot tool).

import type { Route } from '../app/router';
import { numberParam } from '../app/router';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { CANNON_BALL_REACH, CENTER_X, WORLD_H, WORLD_W, layout } from '../layout';
import { drawBall, drawBallShadow, drawFireball } from '../render/ball';
import {
  drawBucket,
  drawCatchGlow,
  drawFeverBuckets,
  drawFeverLandingGlow,
  drawFlippers,
} from '../render/buckets';
import { drawAimGuide, drawCannon, drawGuideHit } from '../render/cannon';
import { drawFrame, drawFrameKnobs, drawFrameShadow } from '../render/frame';
import { drawBallCounter, drawFeverMeter, drawScoreWindow } from '../render/hud';
import { drawLauncher, drawLauncherBack } from '../render/launcher';
import { drawMachine } from '../render/machine';
import { linear, roundRect, type Ctx } from '../render/paint';
import {
  drawBrick,
  drawBrickGlow,
  drawBrickHitFlash,
  drawBrickPop,
  drawBrickShadow,
  drawHitFlash,
  drawPeg,
  drawPegGlow,
  drawPegShadow,
  drawRemovalPop,
  type BrickShape,
} from '../render/pegs';
import { drawWordmark } from '../screens/title';
import {
  drawBallsWarning,
  drawBonusLabel,
  drawPegValue,
  drawPowerLabel,
  drawShotTally,
  drawStyleCallout,
} from '../ui/callouts';
import {
  drawArrowButton,
  drawGelSlab,
  drawListRow,
  drawPanel,
  drawPillButton,
  drawRoundButton,
  drawRow,
  drawSlider,
  drawToggle,
  fastForwardIcon,
  hitBox,
  panelContent,
  type ButtonState,
} from '../ui/controls';
import { drawText, drawTextOnArc, textStyle } from '../ui/text';
import { GRAVITY, LAUNCH_SPEED } from '../../sim/tuning';
import { PEG_COLORS, THEMES, themeAt, type PegColor } from '../ui/tokens';
import { drawDevBackdrop } from './backdrop';

const PAGES = ['pegs', 'hud', 'top', 'themes', 'text', 'controls', 'dialogs', 'buckets'] as const;
type Page = (typeof PAGES)[number];

const STATES: readonly ButtonState[] = ['normal', 'hover', 'down', 'disabled'];

function caption(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  align: 'left' | 'center' = 'center',
): void {
  drawText(ctx, text, x, y, {
    face: 'body',
    cap: 6.4,
    weight: 500,
    fill: '#c9c4e8',
    align,
    anchor: 'middle',
  });
}

function heading(ctx: Ctx, text: string): void {
  drawText(ctx, text.toUpperCase(), 16, 22, { ...textStyle.title(13), align: 'left' });
}

function darkBackground(ctx: Ctx): void {
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, '#1b1838'],
    [1, '#0d0b1f'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

function guidePoints(px: number, py: number, angle: number, count: number): Float64Array {
  const out = new Float64Array(count * 2);
  const dx = Math.sin(angle);
  const dy = Math.cos(angle);
  const sx = px + dx * CANNON_BALL_REACH;
  const sy = py + dy * CANNON_BALL_REACH;
  for (let i = 0; i < count; i++) {
    const t = 4.3 * i;
    out[2 * i] = sx + dx * LAUNCH_SPEED * t;
    out[2 * i + 1] = sy + dy * LAUNCH_SPEED * t + 0.5 * GRAVITY * t * t;
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// Pages

function pagePegs(ctx: Ctx, k: number, t: number): void {
  drawDevBackdrop(ctx, k);
  drawFrameShadow(ctx, k);
  ctx.fillStyle = 'rgba(10,8,30,0.55)';
  ctx.fillRect(0, 0, WORLD_W, 40);
  heading(ctx, 'Pegs and bricks');
  const cols: [number, string][] = [
    [100, 'normal'],
    [145, 'lit'],
    [195, 'flash 0'],
    [235, 'flash 60'],
    [275, 'flash 120'],
    [315, 'flash 180'],
    [370, 'pop 40'],
    [430, 'pop 120'],
    [490, 'pop 220'],
    [560, 'brick'],
    [610, 'lit'],
    [665, 'tilted'],
    [720, 'lit'],
    [790, 'curved'],
    [860, 'lit'],
    [925, 'hit'],
    [985, 'pop'],
  ];
  for (const [x, label] of cols) caption(ctx, label, x, 58);
  PEG_COLORS.forEach((color: PegColor, row) => {
    const y = 100 + row * 62;
    caption(ctx, color, 48, y, 'center');
    drawPegShadow(ctx, 100, y);
    drawPeg(ctx, k, 100, y, color, false);
    drawPegShadow(ctx, 145, y);
    drawPegGlow(ctx, k, 145, y, color);
    drawPeg(ctx, k, 145, y, color, true);
    [0, 60, 120, 180].forEach((ft, i) => {
      const x = 195 + i * 40;
      drawPegGlow(ctx, k, x, y, color);
      drawPeg(ctx, k, x, y, color, true);
      drawHitFlash(ctx, k, x, y, color, ft);
    });
    [40, 120, 220].forEach((pt, i) => {
      drawRemovalPop(ctx, 370 + i * 60, y, color, pt);
    });
    const flat = (x: number, rot: number): BrickShape => ({
      kind: 'brick',
      x,
      y,
      rotation: rot,
      length: 35,
      width: 20,
    });
    const curved = (x: number): BrickShape => ({
      kind: 'curvedBrick',
      x,
      y: y + 6,
      rotation: Math.PI / 2,
      innerRadius: 35,
      width: 20,
      sector: Math.PI / 6,
      points: 4,
    });
    for (const [b, lit] of [
      [flat(560, Math.PI / 2), false],
      [flat(610, Math.PI / 2), true],
      [flat(665, Math.PI / 2 + 0.5), false],
      [flat(720, Math.PI / 2 + 0.5), true],
      [curved(790), false],
      [curved(860), true],
    ] as const) {
      drawBrickShadow(ctx, b);
      if (lit) drawBrickGlow(ctx, k, b, color);
      drawBrick(ctx, k, b, color, lit);
    }
    const hb = flat(925, Math.PI / 2);
    drawBrick(ctx, k, hb, color, true);
    drawBrickHitFlash(ctx, k, hb, color, 60);
    drawBrickPop(ctx, flat(985, Math.PI / 2), color, 120);
  });
  // Balls, cannon and the aim guide.
  caption(ctx, 'ball', 110, 372);
  drawBallShadow(ctx, 110, 400);
  drawBall(ctx, k, 110, 400);
  caption(ctx, 'ball, detail', 175, 372);
  drawBall(ctx, k, 175, 410, 22);
  caption(ctx, 'fireball', 260, 372);
  drawFireball(ctx, 250, 410, 1, -0.6, t);
  drawFireball(ctx, 300, 470, -0.4, 1, t + 300);
  caption(ctx, 'curved brick, 7 points', 120, 470);
  drawBrick(
    ctx,
    k,
    {
      kind: 'curvedBrick',
      x: 120,
      y: 540,
      rotation: Math.PI / 2,
      innerRadius: 60,
      width: 20,
      sector: Math.PI / 2.2,
      points: 7,
    },
    'blue',
    false,
  );
  for (const [px, angle] of [
    [460, -0.9],
    [640, 0],
    [820, 0.7],
  ] as const) {
    const pts = guidePoints(px, 330, angle, 8);
    drawAimGuide(ctx, k, pts, 8);
    drawCannon(ctx, k, px, 330, angle, true);
  }
  caption(ctx, 'cannon and aim guide at -52, 0 and 40 degrees', 640, 378);
  caption(ctx, 'guide bounce marker', 960, 450);
  drawGuideHit(ctx, 960, 480, -0.6, t);
}

function pageHud(ctx: Ctx, k: number, t: number): void {
  darkBackground(ctx);
  heading(ctx, 'Ball counter and Fever meter');
  const counters = [
    { label: '10 balls, empty tubes', balls: 10, col: 9, score: 0 },
    { label: '7 balls, 18,000', balls: 7, col: 6, score: 18_000 },
    { label: '3 balls (warning), 40,000', balls: 3, col: 2, score: 40_000 },
    {
      label: 'free ball, 25,000',
      balls: 6,
      col: 5,
      score: 26_000,
      fb: { stage: 1 as const, tMs: 400, showPoints: false },
    },
    {
      label: '1 ball, 125,000 points',
      balls: 1,
      col: 0,
      score: 130_000,
      fb: { stage: 3 as const, tMs: 400, showPoints: true },
    },
  ];
  counters.forEach((c, i) => {
    const dx = 14 + i * 98;
    caption(ctx, c.label, dx + 43, 48);
    ctx.save();
    ctx.translate(dx, 0);
    drawBallCounter(ctx, k, {
      balls: c.balls,
      columnBalls: c.col,
      shotScore: c.score,
      timeMs: t,
      ...(c.fb === undefined ? {} : { freeBall: c.fb }),
    });
    ctx.restore();
  });
  const meters = [
    { label: 'x1, frozen', hit: 0 },
    { label: '9 orange', hit: 9 },
    { label: '10: x2 lit', hit: 10, since: 120 },
    { label: '19: x5', hit: 19 },
    { label: '25: full', hit: 25 },
  ];
  meters.forEach((m, i) => {
    const target = 520 + i * 106;
    const dx = target - layout.feverMeter.x;
    caption(ctx, m.label, target + 46, 48);
    ctx.save();
    ctx.translate(dx, 0);
    drawFeverMeter(ctx, k, {
      orangeHit: m.hit,
      timeMs: t,
      ...(m.since === undefined ? {} : { sinceHitMs: m.since }),
    });
    ctx.restore();
  });
}

function pageTop(ctx: Ctx, k: number, t: number): void {
  darkBackground(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, 132);
  ctx.clip();
  drawDevBackdrop(ctx, k);
  drawFrameShadow(ctx, k);
  drawFrame(ctx, k, themeAt(0));
  drawLauncherBack(ctx, k, themeAt(0));
  drawScoreWindow(ctx, k, 'left', { line1: 'Stage', line2: '2-3', value: 41_270 });
  drawScoreWindow(ctx, k, 'right', { line1: 'Total', line2: 'Score', value: 1_284_330 });
  drawFrameKnobs(ctx);
  drawLauncher(ctx, k, {
    theme: themeAt(0),
    power: themeAt(0).power,
    active: true,
    turns: 3,
    timeMs: t,
  });
  drawCannon(ctx, k, CENTER_X, 70, 0.3, true);
  ctx.restore();
  caption(
    ctx,
    'score windows stretched to 16:9, launcher with lit banner and 3 turns',
    CENTER_X,
    140,
  );
  THEMES.forEach((theme, i) => {
    const col = i % 5;
    const row = Math.floor(i / 5);
    const cx = 110 + col * 212;
    const dy = 150 + row * 222;
    const active = i % 2 === 0;
    ctx.save();
    ctx.translate(cx - CENTER_X, dy);
    drawLauncherBack(ctx, k, theme);
    drawLauncher(ctx, k, {
      theme,
      power: theme.power,
      active,
      ...(active ? { turns: (i % 3) + 1 } : {}),
      timeMs: t,
    });
    drawCannon(ctx, k, CENTER_X, 70, -0.6 + i * 0.13, i % 3 !== 1);
    ctx.restore();
    caption(ctx, `${theme.master}: ${active ? 'lit' : 'dark'}`, cx, dy + 196);
  });
}

function pageThemes(ctx: Ctx, k: number, t: number): void {
  darkBackground(ctx);
  heading(ctx, 'Ten master themes');
  const s = 0.245;
  THEMES.forEach((theme, i) => {
    const col = i % 4;
    const row = Math.floor(i / 4);
    const x = 8 + col * 264;
    const y = 40 + row * 186;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s, s);
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();
    drawDevBackdrop(ctx, k);
    drawFrameShadow(ctx, k);
    drawMachine(ctx, k, {
      theme,
      ballCounter: { balls: 8, columnBalls: 7, shotScore: 9_000, timeMs: t },
      fever: { orangeHit: 11, timeMs: t },
      scoreLeft: { line1: 'Stage', line2: `${i + 1}-1`, value: 0 },
      scoreRight: { line1: 'Total', line2: 'Score', value: 0 },
      power: { name: theme.power, active: false },
      cannonAngle: 0,
      cannonLoaded: true,
      menuButton: 'normal',
      holdButton: 'normal',
      timeMs: t,
    });
    ctx.restore();
    caption(
      ctx,
      `${i}: ${theme.master}, ${theme.power}`,
      x + (WORLD_W * s) / 2,
      y + WORLD_H * s + 8,
    );
  });
}

function pageText(ctx: Ctx): void {
  darkBackground(ctx);
  heading(ctx, 'Text');
  const swatch = (x: number, y: number, w: number, h: number) => {
    roundRect(ctx, x, y, w, h, 10);
    ctx.fillStyle = linear(ctx, 0, y, 0, y + h, [
      [0, '#2333c8'],
      [1, '#0716e1'],
    ]);
    ctx.fill();
  };
  swatch(16, 40, 230, 44);
  drawText(ctx, 'STAGE', 30, 58, textStyle.label());
  drawText(ctx, '3-2', 30, 73, textStyle.label());
  drawText(ctx, '1,284,330', 232, 62, textStyle.score());
  caption(ctx, 'score window label and digits', 131, 94);
  ctx.fillStyle = '#063d27';
  ctx.beginPath();
  ctx.arc(300, 62, 26, 0, Math.PI * 2);
  ctx.fill();
  drawText(ctx, '10', 300, 63, textStyle.ballCount());
  caption(ctx, 'ball count', 300, 94);
  drawText(ctx, '20', 360, 62, textStyle.pegValue());
  drawText(ctx, '300', 395, 62, textStyle.pegValue());
  drawPegValue(ctx, 440, 75, 1_000, 0);
  caption(ctx, 'peg values', 395, 94);
  drawPowerLabel(ctx, 520, 85, 'Guide', 'Next 3 turns', 600);
  caption(ctx, 'power label', 520, 94);
  drawBonusLabel(ctx, 630, 85, 'Purple bonus', 600);
  caption(ctx, 'purple bonus', 630, 94);
  drawTextOnArc(ctx, 'TEXT ON AN ARC', 760, 120, 60, 0, {
    cap: 10,
    fill: '#ffffff',
    outline: { color: '#000', width: 1.2 },
  });
  caption(ctx, 'arc lettering', 760, 94);
  drawWordmark(ctx, 935, 66, 34);
  caption(ctx, 'wordmark', 935, 94);
  // Style shot pop, sampled along its curve.
  const times = [0, 80, 165, 250, 900, 1050];
  times.forEach((ms, i) => {
    const x = 105 + i * 171;
    drawStyleCallout(ctx, x, 140, 'Long Shot!', 25_000, ms);
    caption(ctx, `${ms} ms`, x, 178);
  });
  caption(
    ctx,
    'style shot pop: 1.85x at 80 ms, settled by 250 ms, fading after 850 ms',
    CENTER_X,
    192,
  );
  ctx.save();
  ctx.translate(-CENTER_X + 200, 30);
  drawShotTally(ctx, { sum: 2_390, pegs: 9, style: 25_000 });
  ctx.restore();
  caption(ctx, 'shot tally', 200, 290);
  ctx.save();
  ctx.translate(-CENTER_X + 470, 30);
  drawShotTally(ctx, { sum: 1_120 });
  ctx.restore();
  caption(ctx, 'tally before the first pop', 470, 290);
  drawText(ctx, 'LEVEL COMPLETE!', 760, 222, textStyle.title(18));
  caption(ctx, 'cool title', 760, 240);
  drawText(ctx, '64,000', 760, 272, textStyle.bigNumber(34));
  caption(ctx, 'big number', 760, 296);
  drawRow(ctx, 880, 220, 170, 'Level score', '126,040');
  drawText(ctx, 'Shots: 10', 880, 250, textStyle.stats());
  drawText(
    ctx,
    'Clear every orange peg before the balls run out.',
    880,
    272,
    { ...textStyle.body(), cap: 7 },
    { maxWidth: 180 },
  );
  caption(ctx, 'row, stats and body (Exo 2)', 965, 290);
  ctx.save();
  ctx.translate(0, 180);
  drawBallsWarning(ctx, 3, 2000);
  ctx.restore();
  caption(ctx, 'warning, settled', CENTER_X, 350);
  ctx.save();
  ctx.translate(0, 300);
  drawBallsWarning(ctx, 1, 2000);
  ctx.restore();
  caption(ctx, 'last ball warning at full size', CENTER_X, 580);
}

function pageControls(ctx: Ctx): void {
  darkBackground(ctx);
  heading(ctx, 'Buttons');
  STATES.forEach((s, i) => {
    const x = 40 + i * 255;
    caption(ctx, s, x + 85, 48);
    drawPillButton(ctx, { x, y: 60, w: 171, h: 34 }, 'orange', s, 'Next Level', { lugs: true });
    drawPillButton(
      ctx,
      { x: x + 25, y: 112, w: 120, h: 27 },
      'blue',
      s,
      s === 'down' ? 'Selected' : 'Choice',
    );
    drawPillButton(ctx, { x: x + 36, y: 156, w: 99, h: 35 }, 'brown', s, 'Options');
    drawPillButton(ctx, { x: x + 25, y: 206, w: 120, h: 27 }, 'green', s, 'Done');
  });
  const rounds: [number, ButtonState][] = [
    [70, 'normal'],
    [140, 'hover'],
    [210, 'down'],
  ];
  for (const [x, s] of rounds) {
    drawRoundButton(ctx, x, 290, 25.5, 'purple', s, 'Menu');
    drawRoundButton(ctx, x + 230, 290, 23, 'green', s, '', fastForwardIcon);
  }
  caption(ctx, 'round: normal, hover, down', 140, 326);
  caption(ctx, 'hold control (fast forward)', 370, 326);
  drawGelSlab(ctx, { x: 520, y: 252, w: 188, h: 110 }, 'normal', 'Campaign');
  drawGelSlab(ctx, { x: 750, y: 252, w: 188, h: 110 }, 'hover', 'Quick Play');
  caption(ctx, 'menu gel slab: normal, hover', 730, 382);
  drawArrowButton(ctx, { x: 40, y: 400, w: 115, h: 36 }, 'left', 'normal');
  drawArrowButton(ctx, { x: 175, y: 400, w: 115, h: 36 }, 'right', 'hover');
  caption(ctx, 'paging arrows', 165, 452);
  drawToggle(ctx, { x: 330, y: 400, w: 171, h: 34 }, true, 'normal', 'Full Screen');
  drawToggle(ctx, { x: 520, y: 400, w: 171, h: 34 }, false, 'hover', 'Colorblind');
  caption(ctx, 'toggles: checked, unchecked hover', 510, 452);
  drawSlider(ctx, { x: 720, y: 396, w: 300, h: 42 }, 0.35, 'normal');
  drawSlider(ctx, { x: 720, y: 450, w: 300, h: 42 }, 0.8, 'hover');
  caption(ctx, 'sliders: normal, hover', 870, 504);
}

function pageDialogs(ctx: Ctx, k: number): void {
  drawDevBackdrop(ctx, k);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  const b = { x: 40, y: 60, w: 425, h: 305 };
  drawPanel(ctx, b, 'Level Complete!');
  const c = panelContent(b, true);
  drawRow(ctx, c.x, c.y + 10, c.w, 'Total score:', '512,880');
  drawRow(ctx, c.x, c.y + 36, c.w, 'Level score:', '98,410');
  drawRow(ctx, c.x, c.y + 62, c.w, 'Cleared on try:', '1');
  const stats = textStyle.stats();
  drawText(ctx, 'Shots:', c.x, c.y + 96, stats);
  drawText(ctx, '9', c.x + 150, c.y + 96, { ...stats, align: 'right' });
  drawText(ctx, 'Free balls:', c.x, c.y + 112, stats);
  drawText(ctx, '2', c.x + 150, c.y + 112, { ...stats, align: 'right' });
  drawText(ctx, 'Shot points:', c.x + 190, c.y + 96, stats);
  drawText(ctx, '61,300', c.x + c.w, c.y + 96, { ...stats, align: 'right' });
  drawText(ctx, 'Fever points:', c.x + 190, c.y + 112, stats);
  drawText(ctx, '37,110', c.x + c.w, c.y + 112, { ...stats, align: 'right' });
  drawPillButton(
    ctx,
    { x: b.x + b.w / 2 - 85, y: b.y + b.h - 58, w: 171, h: 34 },
    'orange',
    'hover',
    'Continue',
    { lugs: true },
  );
  const p = { x: 520, y: 60, w: 300, h: 260 };
  drawPanel(ctx, p, 'Best Scores');
  const pc = panelContent(p, true);
  ['First', 'Second', 'Third', 'Fourth', 'Fifth'].forEach((name, i) => {
    drawListRow(
      ctx,
      { x: pc.x, y: pc.y + i * 26, w: pc.w, h: 22 },
      i + 1,
      name,
      ((5 - i) * 61_250).toLocaleString('en-US'),
      i === 1 ? 'hover' : 'normal',
    );
  });
  const small = { x: 850, y: 60, w: 190, h: 150 };
  drawPanel(ctx, small);
  drawText(ctx, 'A panel without a title.', small.x + 22, small.y + 40, {
    ...textStyle.body(),
    cap: 8,
  });
  caption(ctx, 'dialog panels, result rows, stat block and ranked list rows', CENTER_X, 400);
}

function pageBuckets(ctx: Ctx, k: number): void {
  drawDevBackdrop(ctx, k);
  heading(ctx, 'Buckets and flippers');
  const row = (dy: number, draw: () => void) => {
    ctx.save();
    ctx.translate(0, dy);
    draw();
    ctx.restore();
  };
  row(-400, () => {
    drawBucket(ctx, k, { x: 250 });
    drawCatchGlow(ctx, 250, 160);
    drawBucket(ctx, k, { x: 533, pyramid: true });
    drawBucket(ctx, k, { x: 816, covered: true });
  });
  caption(ctx, 'free ball bucket with catch light, Pyramid, Fireball cover', CENTER_X, 205);
  row(-250, () => {
    drawFlippers(ctx, k, 0, 0);
  });
  ctx.save();
  ctx.translate(300, -250);
  drawFlippers(ctx, k, 0.5, -0.5);
  ctx.restore();
  caption(ctx, 'flippers at rest at the walls; a raised left flipper, shifted in', CENTER_X, 330);
  row(-120, () => {
    drawFeverBuckets(ctx, k, { litIndex: 2 });
    drawFeverLandingGlow(ctx, 2, 500);
  });
  caption(ctx, 'Fever buckets, center lit', CENTER_X, 400);
  drawFeverBuckets(ctx, k, { fullClear: true });
  caption(ctx, 'Full Clear Fever buckets', CENTER_X, 530);
}

function pageIndex(ctx: Ctx, selected: number): void {
  darkBackground(ctx);
  drawText(ctx, 'UI KIT REVIEW (DEV ONLY)', CENTER_X, 70, textStyle.title(20));
  PAGES.forEach((p, i) => {
    drawPillButton(ctx, indexBox(i), 'blue', i === selected ? 'hover' : 'normal', `${i + 1}  ${p}`);
  });
  caption(
    ctx,
    'Left and right arrows switch pages. Every page takes t=<ms> to freeze animation.',
    CENTER_X,
    560,
  );
}

function indexBox(i: number) {
  return { x: CENTER_X - 110, y: 120 + i * 48, w: 220, h: 32 };
}

export class DevKitScreen implements Screen {
  private app: AppServices | null = null;
  private page: Page | null = null;
  private frozen: number | null = null;

  enter(app: AppServices, route: Route): void {
    this.app = app;
    const name = route.segments[2];
    this.page = PAGES.find((p) => p === name) ?? null;
    this.frozen = route.params.has('t') ? numberParam(route, 't', 0) : null;
  }

  letterbox(): string {
    return '#0d0b1f';
  }

  private go(index: number): void {
    const n = PAGES.length;
    const p = PAGES[((index % n) + n) % n];
    if (p !== undefined) this.app?.navigate(`#/dev/kit/${p}`);
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    const t = this.frozen ?? f.timeMs;
    const app = this.app;
    const current = this.page === null ? -1 : PAGES.indexOf(this.page);
    if (app !== null) {
      for (const code of app.input.consumeKeys()) {
        if (code === 'ArrowRight') this.go(current + 1);
        if (code === 'ArrowLeft') this.go(current < 0 ? PAGES.length - 1 : current - 1);
        const digit = /^Digit([1-9])$/.exec(code);
        if (digit !== null) this.go(Number(digit[1]) - 1);
        if (code === 'Escape') app.navigate('#/dev/kit');
      }
      // Presses only navigate on the index; elsewhere they are drained and ignored.
      const presses = app.input.consumePresses();
      if (this.page === null) {
        for (const p of presses) {
          PAGES.forEach((_, i) => {
            if (hitBox(indexBox(i), p.x, p.y)) this.go(i);
          });
        }
      }
    }
    switch (this.page) {
      case null: {
        const ptr = app?.input.pointer;
        const hover =
          ptr === undefined ? -1 : PAGES.findIndex((_, i) => hitBox(indexBox(i), ptr.x, ptr.y));
        pageIndex(ctx, hover);
        break;
      }
      case 'pegs':
        pagePegs(ctx, k, t);
        break;
      case 'hud':
        pageHud(ctx, k, t);
        break;
      case 'top':
        pageTop(ctx, k, t);
        break;
      case 'themes':
        pageThemes(ctx, k, t);
        break;
      case 'text':
        pageText(ctx);
        break;
      case 'controls':
        pageControls(ctx);
        break;
      case 'dialogs':
        pageDialogs(ctx, k);
        break;
      case 'buckets':
        pageBuckets(ctx, k);
        break;
    }
  }
}

export const KIT_PAGES: readonly string[] = PAGES;
