// A message on the machine panel with one button: shown when a level cannot be played (missing
// file, invalid level, too few pegs flagged for orange).

import { legible, minTarget } from '../app/display';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import { linear } from '../render/paint';
import { drawPanel, drawPillButton, pickTarget, type ButtonState } from '../ui/controls';
import { drawText, measureText, textStyle, type TextStyle } from '../ui/text';
import { themeAt } from '../ui/tokens';

const BODY: TextStyle = { ...textStyle.body('#fff6c0'), cap: 8.4 };

export class MessageScreen implements Screen {
  private app: AppServices | null = null;
  private readonly box: Box = { x: CENTER_X - 230, y: 170, w: 460, h: 250 };
  private readonly button: Box;
  private lines: string[] | null = null;
  private pressed = false;

  constructor(
    private readonly title: string,
    private readonly message: string,
    private readonly buttonLabel: string,
    private readonly hash: string,
  ) {
    this.button = { x: CENTER_X - 85, y: this.box.y + this.box.h - 56, w: 171, h: 34 };
  }

  enter(app: AppServices): void {
    this.app = app;
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return themeAt(0).dark;
  }

  render(f: FrameInfo): void {
    const { ctx } = f;
    const app = this.app;
    ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
      [0, '#2e1a96'],
      [1, '#120840'],
    ]);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    drawPanel(ctx, this.box, this.title);
    const body = legible(BODY);
    if (this.lines === null) this.lines = wrap(ctx, this.message, this.box.w - 70, body);
    const pitch = Math.max(15, body.cap * 1.6);
    let y = this.box.y + 82;
    for (const line of this.lines.slice(0, Math.floor(90 / pitch) + 1)) {
      drawText(ctx, line, this.box.x + 35, y, body);
      y += pitch;
    }
    let state: ButtonState = 'normal';
    if (app !== null) {
      const p = app.input.pointer;
      const on = (x: number, y: number, touch: boolean): boolean =>
        pickTarget([{ box: this.button }], x, y, touch ? minTarget() : 0) === 0;
      const over = p.inside && on(p.x, p.y, p.kind === 'touch');
      for (const { press, e } of app.input.consumePointer()) {
        const hit = !e.crowded && on(e.x, e.y, e.kind === 'touch');
        if (press) {
          this.pressed = hit;
          continue;
        }
        if (this.pressed && hit) app.navigate(this.hash);
        this.pressed = false;
      }
      for (const key of app.input.consumeKeys()) {
        if (key === 'Enter' || key === 'Space' || key === 'Escape') app.navigate(this.hash);
      }
      state = over ? (this.pressed ? 'down' : p.kind === 'touch' ? 'normal' : 'hover') : 'normal';
    }
    drawPillButton(ctx, this.button, 'orange', state, this.buttonLabel, { lugs: true });
    drawText(ctx, 'TEGGLE', CENTER_X, 80, {
      cap: 30,
      fill: [
        [0, '#fffbd0'],
        [0.5, '#ffb21c'],
        [1, '#d8300a'],
      ],
      outline: { color: '#2a0c02', width: 2 },
      align: 'center',
      anchor: 'middle',
    });
  }
}

function wrap(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
  style: TextStyle,
): string[] {
  const out: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      const next = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measureText(ctx, next, style) > maxW) {
        out.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    out.push(line);
  }
  return out;
}
