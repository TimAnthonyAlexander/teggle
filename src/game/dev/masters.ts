// DEV ONLY: #/dev/masters and #/dev/masters/<powerId>. Review of the master portraits in the
// frames the game uses them in. Not linked from any menu.
//
// Overview: one column per master. Four rows of round launcher windows with the theme glow, one
// per expression (neutral, happy, power, sad), then the 66-unit thumbnail and its locked
// silhouette, all at true size. Click a column, or use the arrow keys, for a master's page: the
// four expressions as stage intro portraits (190 units, teal bevel), in the real launcher housing
// (the power expression lit, as when a power runs), and the thumbnail plain, current and locked.
// A portrait that does not exist or fails to load leaves its frame empty and says "missing".
// The query `t=<ms>` freezes the glow pulse (used for screenshots).

import type { Route } from '../app/router';
import { numberParam } from '../app/router';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import {
  EXPRESSIONS,
  MASTER_POWERS,
  masterPortraits,
  masterIndex,
  type Expression,
} from '../art/masters';
import {
  INTRO_SIZE,
  THUMB_SIZE,
  WINDOW_R,
  drawIntroPortrait,
  drawPortraitWindow,
  drawThumbnail,
} from '../art/portrait';
import type { PowerId } from '../audio/bus';
import { CANNON_PIVOT, CENTER_X, WORLD_H, WORLD_W, layout } from '../layout';
import { drawCannon } from '../render/cannon';
import { drawLauncher, drawLauncherBack } from '../render/launcher';
import { linear, type Ctx } from '../render/paint';
import { drawText, textStyle } from '../ui/text';
import { themeAt } from '../ui/tokens';

const COL_W = WORLD_W / MASTER_POWERS.length;
const ROW_Y0 = 104;
const ROW_STEP = 98;
const THUMB_Y = ROW_Y0 + 3 * ROW_STEP + WINDOW_R + 14;
const LOCKED_Y = THUMB_Y + THUMB_SIZE + 8;

function caption(
  ctx: Ctx,
  text: string,
  x: number,
  y: number,
  fill = '#c9c4e8',
  maxWidth = COL_W - 6,
): void {
  drawText(
    ctx,
    text,
    x,
    y,
    { face: 'body', cap: 6.4, weight: 500, fill, align: 'center', anchor: 'middle' },
    { maxWidth },
  );
}

function background(ctx: Ctx): void {
  ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
    [0, '#1b1838'],
    [1, '#0d0b1f'],
  ]);
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
}

function missingNote(ctx: Ctx, power: PowerId, expression: Expression, x: number, y: number) {
  const status = masterPortraits.status(power, expression);
  if (status === 'missing') caption(ctx, 'missing', x, y, '#ff8a7a');
  else if (status === 'loading' || status === 'idle') caption(ctx, 'loading', x, y);
}

function columnX(i: number): number {
  return COL_W * (i + 0.5);
}

function drawOverview(ctx: Ctx, k: number, t: number): void {
  background(ctx);
  drawText(ctx, 'MASTER PORTRAITS (DEV ONLY)', 12, 16, {
    ...textStyle.title(11),
    align: 'left',
    anchor: 'middle',
  });
  drawText(
    ctx,
    'Rows: neutral, happy, power, sad in the launcher window with the theme glow; then the thumbnail and its locked silhouette. Click a master for its page.',
    WORLD_W - 12,
    16,
    { face: 'body', cap: 6, weight: 500, fill: '#9d97c8', align: 'right', anchor: 'middle' },
    { maxWidth: 640 },
  );
  MASTER_POWERS.forEach((power, i) => {
    const theme = themeAt(i);
    const x = columnX(i);
    drawText(
      ctx,
      theme.master.toUpperCase(),
      x,
      38,
      { ...textStyle.label(), cap: 8, align: 'center', anchor: 'middle' },
      { maxWidth: COL_W - 8 },
    );
    caption(ctx, theme.power, x, 50);
    EXPRESSIONS.forEach((expression, row) => {
      const y = ROW_Y0 + row * ROW_STEP;
      drawPortraitWindow(ctx, k, masterPortraits.get(power, expression), theme, x, y, {
        bezel: true,
        active: true,
        timeMs: t + i * 90,
      });
      missingNote(ctx, power, expression, x, y);
    });
    const neutral = masterPortraits.get(power, 'neutral');
    const tx = x - THUMB_SIZE / 2;
    drawThumbnail(ctx, k, neutral, theme, tx, THUMB_Y, 'normal');
    drawThumbnail(ctx, k, neutral, theme, tx, LOCKED_Y, 'locked');
    if (neutral === null) {
      missingNote(ctx, power, 'neutral', x, THUMB_Y + THUMB_SIZE / 2);
      missingNote(ctx, power, 'neutral', x, LOCKED_Y + THUMB_SIZE / 2);
    }
  });
}

function drawMaster(ctx: Ctx, k: number, t: number, power: PowerId): void {
  background(ctx);
  const i = masterIndex(power);
  const theme = themeAt(i);
  drawText(ctx, `${theme.master} · ${theme.power}`.toUpperCase(), 16, 22, {
    ...textStyle.title(13),
    align: 'left',
  });
  const loaded = EXPRESSIONS.filter((x) => masterPortraits.status(power, x) === 'ready');
  caption(
    ctx,
    `Stage ${i + 1}, ${loaded.length} of 4 expressions present. Arrows: next master, Esc: overview.`,
    WORLD_W - 200,
    18,
    '#9d97c8',
    380,
  );
  const gap = 34;
  const x0 = (WORLD_W - 4 * INTRO_SIZE - 3 * gap) / 2;
  EXPRESSIONS.forEach((expression, j) => {
    const img = masterPortraits.get(power, expression);
    const x = x0 + j * (INTRO_SIZE + gap);
    const cx = x + INTRO_SIZE / 2;
    drawIntroPortrait(ctx, k, img, theme, x, 44);
    caption(ctx, `${expression}: stage intro portrait`, cx, 246);
    missingNote(ctx, power, expression, cx, 44 + INTRO_SIZE / 2);
    // The real launcher housing, shifted so its window lands under this portrait.
    const dx = cx - CENTER_X;
    const dy = 270;
    const active = expression === 'power';
    ctx.save();
    ctx.translate(dx, dy);
    drawLauncherBack(ctx, k, theme);
    drawLauncher(ctx, k, {
      theme,
      power: theme.power,
      active,
      ...(active ? { turns: 3 } : {}),
      timeMs: t,
    });
    drawPortraitWindow(ctx, k, img, theme, layout.portrait.x, layout.portrait.y, {
      active,
      timeMs: t,
    });
    drawCannon(ctx, k, CANNON_PIVOT.x, CANNON_PIVOT.y, 0, true);
    ctx.restore();
    caption(ctx, active ? 'launcher, power running' : 'launcher', cx, dy + 176);
  });
  const neutral = masterPortraits.get(power, 'neutral');
  const states = ['normal', 'current', 'locked'] as const;
  const ty = 486;
  const tx0 = CENTER_X - (3 * THUMB_SIZE + 2 * 40) / 2;
  states.forEach((state, j) => {
    const x = tx0 + j * (THUMB_SIZE + 40);
    drawThumbnail(ctx, k, neutral, theme, x, ty, state);
    caption(ctx, `thumbnail, ${state}`, x + THUMB_SIZE / 2, ty + THUMB_SIZE + 12);
  });
}

export class DevMastersScreen implements Screen {
  private app: AppServices | null = null;
  private power: PowerId | null = null;
  private frozen: number | null = null;

  enter(app: AppServices, route: Route): void {
    this.app = app;
    const name = route.segments[2];
    this.power = MASTER_POWERS.find((p) => p === name) ?? null;
    this.frozen = route.params.has('t') ? numberParam(route, 't', 0) : null;
    void masterPortraits.preloadAll();
  }

  letterbox(): string {
    return '#0d0b1f';
  }

  private go(index: number): void {
    const n = MASTER_POWERS.length + 1;
    const i = ((index % n) + n) % n;
    const power = i === 0 ? undefined : MASTER_POWERS[i - 1];
    this.app?.navigate(power === undefined ? '#/dev/masters' : `#/dev/masters/${power}`);
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    const t = this.frozen ?? f.timeMs;
    const app = this.app;
    const current = this.power === null ? 0 : masterIndex(this.power) + 1;
    if (app !== null) {
      for (const code of app.input.consumeKeys()) {
        if (code === 'ArrowRight') this.go(current + 1);
        if (code === 'ArrowLeft') this.go(current - 1);
        if (code === 'Escape') this.go(0);
      }
      for (const p of app.input.consumePresses()) {
        if (this.power !== null) continue;
        const col = Math.floor(p.x / COL_W);
        if (col >= 0 && col < MASTER_POWERS.length && p.y > 28) this.go(col + 1);
      }
    }
    if (this.power === null) drawOverview(ctx, k, t);
    else drawMaster(ctx, k, t, this.power);
  }
}
