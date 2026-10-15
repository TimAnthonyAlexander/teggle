// How to Play: the rules in a few lines, each beside the peg or ball it is about, on the dialog
// panel of visual guide 10.6. Teggle's own words; every statement matches the rules engine.
// On a touch screen the control lines speak of fingers instead of the mouse and keys; where the
// text would be too small to read (a phone), the panel widens and the text grows.

import { display, legible } from '../app/display';
import type { Input } from '../app/input';
import { CENTER_X, WORLD_H, type Box } from '../layout';
import { drawBall } from '../render/ball';
import { drawPeg } from '../render/pegs';
import type { Ctx } from '../render/paint';
import { drawPanel, drawPillButton } from '../ui/controls';
import { dialogDrop } from '../ui/motion';
import { drawText, textStyle, type TextStyle } from '../ui/text';
import type { PegColor } from '../ui/tokens';
import { ButtonSet } from './buttons';
import { dimBehind, wrapText, type MenuOverlay } from './overlay';

type Icon = { kind: 'ball' } | { kind: 'peg'; color: PegColor; lit: boolean } | { kind: 'none' };

interface HelpRow {
  readonly icon: Icon;
  readonly text: string;
  /** The line for a touch screen, where it differs. */
  readonly touch?: string;
}

export const HELP_ROWS: readonly HelpRow[] = [
  {
    icon: { kind: 'ball' },
    text: 'Aim with the mouse and click to shoot. The wheel or the arrow keys fine-tune your aim. On a touch screen, drag to aim and tap to shoot.',
    touch:
      'Touch the board to aim and tap to shoot. Drag to fine-tune your aim, then tap the cannon to shoot where it points.',
  },
  {
    icon: { kind: 'peg', color: 'orange', lit: false },
    text: 'Hit every orange peg to clear the level. Run out of balls first and the level starts over with new colors.',
  },
  {
    icon: { kind: 'peg', color: 'blue', lit: true },
    text: 'Pegs light up when the ball touches them and vanish once it leaves the board. Each orange peg you hit raises the multiplier on the right.',
  },
  {
    icon: { kind: 'peg', color: 'green', lit: false },
    text: "Green pegs set off your master's power.",
  },
  {
    icon: { kind: 'peg', color: 'purple', lit: false },
    text: 'The purple peg is worth five times an orange one and moves after every shot.',
  },
  {
    icon: { kind: 'ball' },
    text: 'Catch the ball in the moving bucket to get it back. A shot earns a free ball as it passes 25,000, 75,000 and 125,000 points, and a shot that hits nothing flips a coin for one.',
  },
  {
    icon: { kind: 'peg', color: 'orange', lit: true },
    text: 'The last orange peg starts Fever: the ball falls into a bonus bucket worth up to 100,000, and every ball you did not use adds 10,000.',
  },
  {
    icon: { kind: 'none' },
    text: 'Esc pauses and M mutes. Between shots, hold the right mouse button or the green button to speed up the bucket.',
    touch:
      'The Menu button pauses. Between shots, hold the green button to speed up the bucket. While the Flippers stand, touch the board to raise them.',
  },
];

/** The rows' text for this screen: the touch lines where a finger is the pointer. */
export function helpText(row: HelpRow, touch: boolean): string {
  return touch && row.touch !== undefined ? row.touch : row.text;
}

const BODY: TextStyle = { ...textStyle.body('#fff6c0'), cap: 9.2 };
const LINE = 15.5;
const GAP = 11;
const DESKTOP_BOX: Box = { x: CENTER_X - 280, y: 70, w: 560, h: 460 };
/** The wide panel for small screens, almost the whole screen. */
const WIDE_BOX: Box = { x: CENTER_X - 460, y: 14, w: 920, h: WORLD_H - 28 };

export class HelpDialog implements MenuOverlay {
  private readonly box: Box;
  private readonly body: TextStyle;
  private readonly touch = display.coarse;
  private readonly buttons: ButtonSet<'done'>;
  private lines: string[][] | null = null;

  constructor(private readonly t0: number) {
    const body = legible(BODY);
    const wide = body.cap > BODY.cap;
    // The wide panel has room for a little more than the legibility floor (up to 13 units).
    this.body = wide ? { ...body, cap: Math.max(body.cap, Math.min(13, body.cap * 1.12)) } : body;
    const b = wide ? WIDE_BOX : DESKTOP_BOX;
    this.box = b;
    // A finger hits Done anywhere within 44 CSS px of it; the pill itself grows a little.
    const doneH = this.touch ? 38 : 32;
    this.buttons = new ButtonSet([
      {
        action: 'done',
        box: { x: CENTER_X - 85, y: b.y + b.h - 18 - doneH, w: 171, h: doneH },
        enabled: true,
      },
    ]);
  }

  private dy(now: number): number {
    return dialogDrop(now - this.t0, 520);
  }

  update(input: Input, now: number): boolean {
    for (const code of input.consumeKeys()) {
      if (code === 'Escape' || code === 'Enter' || code === 'Space') return false;
    }
    return !this.buttons.handle(input, 0, this.dy(now)).includes('done');
  }

  render(ctx: Ctx, k: number, input: Input, now: number): void {
    dimBehind(ctx, now - this.t0);
    const dy = this.dy(now);
    const b = this.box;
    ctx.save();
    ctx.translate(0, dy);
    drawPanel(ctx, b, 'How to Play');
    const s = this.body.cap / BODY.cap;
    const textX = b.x + 76;
    const textW = b.w - 76 - 34;
    const line = LINE * s;
    this.lines ??= HELP_ROWS.map((r) => wrapText(ctx, helpText(r, this.touch), textW, this.body));
    let y = b.y + 72 + (s - 1) * 4;
    HELP_ROWS.forEach((row, i) => {
      const lines = this.lines?.[i] ?? [];
      const iconY = y - 3 * s + ((lines.length - 1) * line) / 2;
      drawIcon(ctx, k, row.icon, b.x + 46, iconY);
      for (const text of lines) {
        drawText(ctx, text, textX, y, this.body);
        y += line;
      }
      y += GAP * (s > 1 ? 0.7 * s : 1);
    });
    const done = this.buttons.items[0];
    if (done !== undefined) {
      drawPillButton(ctx, done.box, 'green', this.buttons.state(0, input, 0, dy), 'Done', {
        lugs: true,
      });
    }
    ctx.restore();
  }
}

function drawIcon(ctx: Ctx, k: number, icon: Icon, x: number, y: number): void {
  if (icon.kind === 'ball') drawBall(ctx, k, x, y, 8);
  else if (icon.kind === 'peg') drawPeg(ctx, k, x, y, icon.color, icon.lit, 11);
}
