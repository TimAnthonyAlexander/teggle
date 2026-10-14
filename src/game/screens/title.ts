// Title card: the Teggle wordmark on the indigo machine panel. The menus that will sit on this
// screen come with the game screens; until then it shows only the wordmark.

import { CENTER_X, WORLD_H, WORLD_W } from '../layout';
import type { FrameInfo, Screen } from '../app/screens';
import { linear, radial, type Ctx } from '../render/paint';
import { rgba } from '../ui/color';
import { drawText } from '../ui/text';
import { color, themeAt } from '../ui/tokens';

/** The Teggle wordmark: chunky display caps, hot gradient, dark outline, glossy top. */
export function drawWordmark(ctx: Ctx, x: number, y: number, cap: number): void {
  drawText(ctx, 'TEGGLE', x, y, {
    cap,
    fill: [
      [0, '#fffbd0'],
      [0.18, '#ffe94a'],
      [0.5, '#ffb21c'],
      [0.75, '#ff6a12'],
      [1, '#d8300a'],
    ],
    outline: { color: '#2a0c02', width: cap * 0.06 },
    outerOutline: { color: rgba('#ffd27a', 0.9), width: cap * 0.085 },
    shadow: { color: 'rgba(0,0,0,0.6)', dx: cap * 0.03, dy: cap * 0.07 },
    sheen: 0.55,
    align: 'center',
    anchor: 'middle',
  });
}

function drawPanelBackdrop(ctx: Ctx): void {
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, '#2e1a96'],
    [0.5, color.panel],
    [1, '#120840'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.fillStyle = rgba(color.panelScanline, 0.8);
  for (let y = 0; y < WORLD_H; y += 3.5) ctx.fillRect(0, y, WORLD_W, 1);
  ctx.fillStyle = radial(ctx, CENTER_X, 250, 40, CENTER_X, 250, 520, [
    [0, rgba(color.panelBevel, 0.7)],
    [1, rgba(color.panel, 0)],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

export class TitleScreen implements Screen {
  letterbox(): string {
    return themeAt(0).dark;
  }

  render(f: FrameInfo): void {
    drawPanelBackdrop(f.ctx);
    drawWordmark(f.ctx, CENTER_X, 270, 104);
  }
}
