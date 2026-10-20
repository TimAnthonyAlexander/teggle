// The goal card of a challenge level (spec 14.2, "Decided in the challenges"): as the level
// starts, a panel over the board with the goal in capitals in its title, the goal as a sentence
// and, in a run, which level of how many this is. The play screen holds the level until one
// click, tap or key puts the card away, and that input does not fire the cannon. It is the only
// thing allowed to wait on the board; everything else there clears within about a second.

import { legible } from '../app/display';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import type { Ctx } from '../render/paint';
import { drawPanel } from '../ui/controls';
import { drawText, textStyle, type TextStyle } from '../ui/text';
import { wrapText } from '../menus/overlay';
import type { GoalBriefing } from './host';

const GOAL: TextStyle = { ...textStyle.body('#ffffff'), cap: 11, align: 'center' };
const RUN: TextStyle = {
  face: 'caps',
  cap: 10,
  fill: '#8dff4a',
  outline: { color: '#06200a', width: 1.2 },
  align: 'center',
  anchor: 'middle',
};
const HINT: TextStyle = { ...textStyle.body('#a9cdf0'), cap: 8.4, align: 'center' };
/** Panel width at design size, and where its middle sits on the screen. */
const WIDTH = 560;
const MID_Y = 270;
/** The title pill's height in drawPanel, and the padding inside the body. */
const TITLE_H = 46;
const PAD = 22;
const FADE_MS = 180;

export class GoalCard {
  private lines: string[] = [];
  private cap = 0;

  constructor(
    private readonly briefing: GoalBriefing,
    /** UI time it opened, ms. */
    private readonly t0: number,
  ) {}

  render(ctx: Ctx, now: number, touch: boolean): void {
    const goal = legible(GOAL);
    const run = legible(RUN);
    const hint = legible(HINT);
    // Text that grows on a phone widens the panel, up to most of the board.
    const w = Math.min(900, WIDTH * Math.min(1.6, goal.cap / GOAL.cap));
    if (goal.cap !== this.cap) {
      this.cap = goal.cap;
      this.lines = wrapText(ctx, this.briefing.goal, w - 70, goal);
    }
    const pitch = goal.cap * 1.7;
    const textH = goal.cap + (this.lines.length - 1) * pitch;
    const runH = this.briefing.run === null ? 0 : run.cap * 3;
    const h = TITLE_H + PAD + textH + runH + hint.cap * 2.8 + PAD;
    const b: Box = { x: CENTER_X - w / 2, y: Math.round(MID_Y - h / 2), w, h };
    ctx.save();
    ctx.globalAlpha = Math.min(1, Math.max(0, (now - this.t0) / FADE_MS));
    ctx.fillStyle = 'rgba(4, 2, 20, 0.3)';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    drawPanel(ctx, b, this.briefing.band);
    let y = b.y + TITLE_H + PAD + goal.cap;
    for (const line of this.lines) {
      drawText(ctx, line, CENTER_X, y, goal);
      y += pitch;
    }
    if (this.briefing.run !== null) {
      const ry = b.y + TITLE_H + PAD + textH + runH * 0.62;
      drawText(ctx, this.briefing.run.toUpperCase(), CENTER_X, ry, run, { maxWidth: w - 60 });
    }
    const hintText = touch ? 'Tap to start.' : 'Click to start.';
    drawText(ctx, hintText, CENTER_X, b.y + b.h - PAD, hint);
    ctx.restore();
  }
}
