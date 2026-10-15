// Dialogs that open over a screen (options, how to play): they take all input while open and
// draw over whatever is below, dimmed.

import type { Input } from '../app/input';
import { WORLD_H, WORLD_W } from '../layout';
import type { Ctx } from '../render/paint';
import { measureText, type TextStyle } from '../ui/text';

export interface MenuOverlay {
  /** Reads this frame's input; returns false once the dialog has closed. */
  update(input: Input, nowMs: number): boolean;
  render(ctx: Ctx, k: number, input: Input, nowMs: number): void;
}

/** Darkens what lies under a dialog, fading in over 200 ms. */
export function dimBehind(ctx: Ctx, sinceMs: number, amount = 0.45): void {
  const a = Math.min(1, Math.max(0, sinceMs / 200)) * amount;
  ctx.fillStyle = `rgba(4, 2, 20, ${a.toFixed(3)})`;
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

/** Splits text into lines no wider than `maxW` in `style`; a blank line starts a new paragraph. */
export function wrapText(ctx: Ctx, text: string, maxW: number, style: TextStyle): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    let line = '';
    for (const word of para.split(' ')) {
      if (word === '') continue;
      const next = line === '' ? word : `${line} ${word}`;
      if (line !== '' && measureText(ctx, next, style) > maxW) {
        lines.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    lines.push(line);
  }
  return lines;
}
