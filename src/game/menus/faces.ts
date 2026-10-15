// Master portraits in the menus: the stage intro portrait and the progress thumbnails
// (src/game/art/portrait.ts) with the fallbacks a missing picture needs. A master without art
// shows its own frame emblem (render/emblems.ts) in the glass; a locked one without art shows
// the dark plate alone; the Master levels tile shows a question mark.

import { masterIndex, masterPortraits } from '../art/masters';
import { drawIntroPortrait, drawThumbnail, type ThumbState } from '../art/portrait';
import { drawEmblem } from '../render/emblems';
import type { Ctx } from '../render/paint';
import type { PowerId } from '../../rules/powers';
import { drawText } from '../ui/text';
import { themeAt } from '../ui/tokens';

/** The stage intro portrait of a master, or of the Master levels when `power` is null. */
export function drawMasterPortrait(
  ctx: Ctx,
  k: number,
  power: PowerId | null,
  x: number,
  y: number,
  size: number,
): void {
  const theme = themeAt(power === null ? 9 : masterIndex(power));
  const img = power === null ? null : masterPortraits.get(power, 'neutral');
  drawIntroPortrait(ctx, k, img, theme, x, y, size);
  if (img !== null) return;
  if (power === null) drawQuestion(ctx, x + size / 2, y + size / 2, size * 0.42);
  else if (masterPortraits.status(power, 'neutral') === 'missing') {
    drawEmblem(ctx, theme, x + size / 2, y + size / 2, size / 70);
  }
}

/** A progress thumbnail: plain, current (gold) or locked (silhouette). */
export function drawMasterTile(
  ctx: Ctx,
  k: number,
  power: PowerId | null,
  x: number,
  y: number,
  size: number,
  state: ThumbState,
): void {
  const theme = themeAt(power === null ? 9 : masterIndex(power));
  const img = power === null ? null : masterPortraits.get(power, 'neutral');
  drawThumbnail(ctx, k, img, theme, x, y, state, size);
  if (img !== null) return;
  const cx = x + size / 2;
  const cy = y + size / 2;
  if (power === null) {
    drawQuestion(ctx, cx, cy, size * 0.38, state === 'locked' ? 0.35 : 1);
  } else if (state !== 'locked' && masterPortraits.status(power, 'neutral') === 'missing') {
    drawEmblem(ctx, theme, cx, cy, size / 80);
  }
}

function drawQuestion(ctx: Ctx, x: number, y: number, cap: number, alpha = 1): void {
  drawText(
    ctx,
    '?',
    x,
    y,
    {
      cap,
      fill: [
        [0, '#fff6c8'],
        [0.5, '#ffd23a'],
        [1, '#e87a10'],
      ],
      outline: { color: '#2a1000', width: Math.max(1.5, cap * 0.08) },
      align: 'center',
      anchor: 'middle',
    },
    { alpha },
  );
}
