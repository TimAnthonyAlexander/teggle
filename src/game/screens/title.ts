// The Teggle wordmark in its own lettering (visual guide 15: never the original's wordmark or
// bubble logo): chunky display caps with a hot gradient, a dark outline and a glossy top. The
// main menu and the dev kit draw it.

import type { Ctx } from '../render/paint';
import { rgba } from '../ui/color';
import { drawText } from '../ui/text';

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
