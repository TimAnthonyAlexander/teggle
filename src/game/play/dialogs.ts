// End-of-level and pause dialogs (guide 10.6): an indigo panel in a brass frame that drops in
// from the launcher housing on a telescoping column, result rows that count up, a stat block,
// and an orange primary button. Real numbers only: everything shown comes from the attempt's
// own score breakdown.

import { CENTER_X, WORLD_H, WORLD_W, layout, type Box } from '../layout';
import { drawLayer, layers } from '../render/cache';
import { linear, roundRect, type Ctx } from '../render/paint';
import {
  drawPanel,
  drawPillButton,
  drawRow,
  hitBox,
  panelContent,
  type ButtonState,
  type PillVariant,
} from '../ui/controls';
import { dialogDrop, ease } from '../ui/motion';
import { drawText, formatNumber, measureText, textStyle, type TextStyle } from '../ui/text';
import { color } from '../ui/tokens';
import type { ScoreBreakdown } from './summary';

export type DialogAction = 'retry' | 'resume' | 'restart' | 'quit';
export type DialogKind = 'complete' | 'failed' | 'pause';

interface Button {
  readonly box: Box;
  readonly label: string;
  readonly variant: PillVariant;
  readonly action: DialogAction;
  readonly primary: boolean;
}

/** Tips for the level failed dialog: facts about Teggle's rules, in its own words. */
export const TIPS: readonly string[] = [
  'Each orange peg you hit raises the multiplier, so late shots are worth far more than early ones.',
  'One shot worth 25,000 points earns a free ball, and so do 75,000 and 125,000.',
  'The purple peg is worth five times an orange one and moves to a new spot after every shot.',
  'Catch the ball in the moving bucket at the bottom to get it back.',
  'A shot that hits nothing flips a coin. Heads gives you the ball back.',
  'Fine-tune your aim with the mouse wheel or the arrow keys, or by dragging on a touch screen.',
  'Hold the right mouse button or the green button between shots to speed up the bucket.',
];

const STATS: TextStyle = textStyle.stats();
const STATS_RIGHT: TextStyle = { ...textStyle.stats(), align: 'right' };
const PAUSED: TextStyle = {
  cap: 46,
  fill: [
    [0, '#ffffff'],
    [0.5, '#fff6dc'],
    [1, '#f3dca8'],
  ],
  outline: { color: '#8a3a08', width: 3 },
  outerOutline: { color: 'rgba(40, 12, 0, 0.85)', width: 5 },
  shadow: { color: 'rgba(0,0,0,0.5)', dx: 1.5, dy: 3 },
  align: 'center',
  anchor: 'middle',
};

const DROP_DISTANCE = 480;
const COUNT_MS = 2400;

export function ordinal(n: number): string {
  const mod100 = n % 100;
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}

export class Dialog {
  readonly box: Box;
  private readonly buttons: Button[] = [];
  private pressed = -1;
  private readonly tip: string;

  constructor(
    readonly kind: DialogKind,
    /** Real time it opened, ms. */
    readonly t0: number,
    private readonly result: ScoreBreakdown | null,
    private readonly tryNumber: number,
    tipIndex: number,
  ) {
    this.tip = TIPS[((tipIndex % TIPS.length) + TIPS.length) % TIPS.length] ?? '';
    if (kind === 'pause') {
      this.box = { x: CENTER_X - 150, y: 190, w: 300, h: 196 };
      const bx = this.box.x + this.box.w / 2;
      this.buttons.push(
        {
          box: { x: bx - 85, y: 222, w: 171, h: 34 },
          label: 'Resume',
          variant: 'orange',
          action: 'resume',
          primary: true,
        },
        {
          box: { x: bx - 75, y: 282, w: 150, h: 27 },
          label: 'Restart Level',
          variant: 'blue',
          action: 'restart',
          primary: false,
        },
        {
          box: { x: bx - 75, y: 327, w: 150, h: 27 },
          label: 'Quit',
          variant: 'blue',
          action: 'quit',
          primary: false,
        },
      );
      return;
    }
    this.box = layout.resultDialog;
    const b = this.box;
    this.buttons.push({
      box: { x: b.x + b.w / 2 - 85, y: b.y + b.h - 52, w: 171, h: 34 },
      label: kind === 'complete' ? 'Play Again' : 'Retry Level',
      variant: 'orange',
      action: 'retry',
      primary: true,
    });
  }

  /** Vertical offset of the drop-in at real time `now`. */
  private offset(now: number): number {
    return this.kind === 'pause' ? 0 : dialogDrop(now - this.t0, DROP_DISTANCE);
  }

  /** The button under (x, y), or -1. */
  private buttonAt(x: number, y: number, now: number): number {
    const dy = this.offset(now);
    return this.buttons.findIndex((b) => hitBox(b.box, x, y - dy));
  }

  press(x: number, y: number, now: number): void {
    this.pressed = this.buttonAt(x, y, now);
  }

  /** The action of a click released on the button it started on. */
  release(x: number, y: number, now: number): DialogAction | null {
    const i = this.buttonAt(x, y, now);
    const pressed = this.pressed;
    this.pressed = -1;
    if (i < 0 || i !== pressed) return null;
    return this.buttons[i]?.action ?? null;
  }

  primary(): DialogAction | null {
    return this.buttons.find((b) => b.primary)?.action ?? null;
  }

  /** True when the pointer is over a button, for hover feedback. */
  hovering(x: number, y: number, now: number): boolean {
    return this.buttonAt(x, y, now) >= 0;
  }

  render(
    ctx: Ctx,
    k: number,
    now: number,
    pointerX: number,
    pointerY: number,
    pointerDown: boolean,
  ): void {
    const t = now - this.t0;
    // Dim the board a little behind the dialog.
    const dim = Math.min(1, t / 200) * (this.kind === 'pause' ? 0.45 : 0.25);
    ctx.fillStyle = `rgba(4, 2, 20, ${dim.toFixed(3)})`;
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const dy = this.offset(now);
    if (this.kind !== 'pause') drawColumn(ctx, k, this.box.y + dy);
    ctx.save();
    ctx.translate(0, dy);
    if (this.kind === 'pause') this.renderPause(ctx);
    else this.renderResult(ctx, k, t);
    const hover = this.buttonAt(pointerX, pointerY, now);
    this.buttons.forEach((b, i) => {
      const state: ButtonState =
        i === hover ? (pointerDown && this.pressed === i ? 'down' : 'hover') : 'normal';
      drawPillButton(ctx, b.box, b.variant, state, b.label, { lugs: b.primary });
    });
    ctx.restore();
  }

  private renderPause(ctx: Ctx): void {
    drawText(ctx, 'PAUSED', CENTER_X, this.box.y - 34, PAUSED);
    drawPanel(ctx, this.box);
  }

  private renderResult(ctx: Ctx, k: number, t: number): void {
    const r = this.result;
    if (r === null) return;
    const b = this.box;
    const won = this.kind === 'complete';
    const panel = layers.get(
      `dialog:${this.kind}`,
      k,
      b.x - 4,
      b.y - 4,
      b.w + 10,
      b.h + 10,
      (c) => {
        drawPanel(c, b, won ? 'Level Complete!' : 'Try Again!');
      },
    );
    drawLayer(ctx, panel);
    const c = panelContent(b, true);
    // Totals count up after the drop (guide 10.6: about 3 s).
    const count = ease.outCubic(Math.min(1, Math.max(0, (t - 250) / COUNT_MS)));
    const n = (v: number): string => formatNumber(Math.round(v * count));
    let y = c.y + 8;
    drawRow(ctx, c.x, y, c.w, 'Level score:', n(r.total));
    y += 26;
    if (won) {
      if (r.clearBonus > 0 && r.clearTry !== null) {
        drawRow(ctx, c.x, y, c.w, `Win on ${ordinal(r.clearTry)} try:`, `+${n(r.clearBonus)}`);
      } else {
        drawRow(ctx, c.x, y, c.w, 'Cleared on try:', String(this.tryNumber));
      }
      y += 26;
      if (r.fullClear) {
        drawRow(ctx, c.x, y, c.w, 'Full clear:', 'Every peg');
        y += 26;
      }
    }
    // Stat block: two columns in the sans face (guide 10.6).
    y += 10;
    const left = c.x;
    const mid = c.x + 150;
    const right = c.x + c.w;
    const rightLabel = c.x + 196;
    const rows: [string, string, string, string][] = [
      ['Shots:', String(r.shots), 'Shot points:', n(r.shotPoints)],
      ['Free balls:', String(r.freeBalls), 'Style points:', n(r.stylePoints)],
      [
        '% Cleared:',
        String(r.cleared),
        won ? 'Fever bucket:' : 'Orange left:',
        won ? n(r.feverPoints) : String(this.orangeLeft),
      ],
    ];
    if (won && r.unusedBalls > 0) rows.push(['', '', 'Balls left:', n(r.unusedPoints)]);
    for (const [l1, v1, l2, v2] of rows) {
      if (l1 !== '') {
        drawText(ctx, l1, left, y, STATS);
        drawText(ctx, v1, mid, y, STATS_RIGHT);
      }
      drawText(ctx, l2, rightLabel, y, STATS);
      drawText(ctx, v2, right, y, STATS_RIGHT);
      y += 16;
    }
    if (!won) {
      y += 8;
      this.tipLines ??= wrap(ctx, this.tip, c.w - 46, TIP_STYLE);
      drawTip(ctx, c.x, y, this.tipLines);
    }
  }

  private tipLines: string[] | null = null;

  /** Orange pegs left when the level was lost; set by the play screen. */
  orangeLeft = 0;
}

const TIP_STYLE: TextStyle = { ...textStyle.body('#fff6c0'), cap: 7.6 };

/** Splits a sentence into lines no wider than `maxW` in `style`. */
function wrap(ctx: Ctx, text: string, maxW: number, style: TextStyle): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line === '' ? word : `${line} ${word}`;
    if (line !== '' && measureText(ctx, next, style) > maxW) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line !== '') lines.push(line);
  return lines;
}

/** The telescoping steel-blue column the result dialogs hang from (10.6). */
function drawColumn(ctx: Ctx, k: number, bottom: number): void {
  const top = layout.housing.y + 96;
  if (bottom <= top) return;
  const seg = layers.get('dialog:segment', k, -45, 0, 90, 54, paintSegment);
  for (let y = bottom - 54; y > top - 54; y -= 50) drawLayer(ctx, seg, CENTER_X, y);
}

function paintSegment(ctx: Ctx): void {
  roundRect(ctx, -36, 0, 72, 54, 6);
  ctx.fillStyle = linear(ctx, -36, 0, 36, 0, [
    [0, '#16324e'],
    [0.22, '#6fa0c8'],
    [0.36, '#cfe6f6'],
    [0.55, '#4f82ae'],
    [1, '#122841'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#06121f';
  ctx.stroke();
  for (const y of [3, 47]) {
    roundRect(ctx, -40, y, 80, 6, 3);
    ctx.fillStyle = linear(ctx, -40, 0, 40, 0, [
      [0, color.brassLo],
      [0.3, color.brassLight],
      [0.7, color.brassMid],
      [1, color.brassLo],
    ]);
    ctx.fill();
    ctx.strokeStyle = color.brassOutline;
    ctx.stroke();
  }
}

function drawTip(ctx: Ctx, x: number, y: number, lines: readonly string[]): void {
  // Badge: a small green rounded tag with "TIP".
  roundRect(ctx, x, y - 2, 34, 18, 6);
  ctx.fillStyle = linear(ctx, 0, y - 2, 0, y + 16, [
    [0, '#7dff9a'],
    [1, '#138a3a'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#063014';
  ctx.stroke();
  drawText(ctx, 'TIP', x + 17, y + 7.5, {
    cap: 8,
    fill: '#ffffff',
    outline: { color: '#063014', width: 1.4 },
    align: 'center',
    anchor: 'middle',
  });
  // The sentence beside it.
  let ly = y + 9;
  for (const line of lines) {
    drawText(ctx, line, x + 44, ly, TIP_STYLE);
    ly += 13;
  }
}
