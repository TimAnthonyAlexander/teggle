// Quick Play's level select (visual guide 10.4; spec 8): a title pill, a 3 x 2 grid of thumbnail
// windows with the level titles in lime, the bottom middle cell an info panel with the level's
// name and best scores, paging arrows under it, the round main menu button bottom left and a
// random level button bottom right. One page per stage, so a page holds that stage's five
// levels. A level plays once the Adventure has cleared it; until then it is stamped LOCKED.
// Levels with every peg cleared carry a medal.
//
// A click on a cleared level plays it; on a touch screen the first tap shows its scores in the
// info panel and the second plays it.

import { display, legible } from '../app/display';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { audioBus } from '../audio/bus';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import type { CampaignManifest } from '../../level/campaign';
import { masterOfPower } from '../../rules/masters';
import { circlePath, linear, radial, roundRect, type Ctx, type PathFn } from '../render/paint';
import { isCleared, levelRecord, type Progress } from '../progress/save';
import { progressStore } from '../progress/store';
import {
  drawArrowButton,
  drawListRow,
  drawPanel,
  drawRoundButton,
  type ButtonState,
} from '../ui/controls';
import { rgba } from '../ui/color';
import { drawText, formatNumber, textStyle, type TextStyle } from '../ui/text';
import { ButtonSet, type UiButton } from './buttons';
import {
  drawLock,
  drawTealWindow,
  drawTitlePill,
  finishTealWindow,
  paintPlate,
  STEEL,
} from './chrome';
import { stageName } from './copy';
import { drawRoundMenu } from './intro';
import { manifestLevels, type ManifestLevel } from '../modes/manifest';
import { drawLayer, layers } from '../render/cache';
import { wrapText } from './overlay';
import { levelThumbs } from './thumbs';

const CELL_W = 316;
const CELL_H = 226;
const COLS = [26, CENTER_X - CELL_W / 2, WORLD_W - 26 - CELL_W] as const;
const ROWS = [62, 302] as const;
/** Grid cells for a page's five levels; the bottom middle cell is the info panel. */
const SLOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [2, 1],
];
const INFO: Box = { x: COLS[1], y: ROWS[1], w: CELL_W, h: CELL_H };

const TITLE: TextStyle = {
  cap: 12,
  fill: [
    [0, '#efff9a'],
    [1, '#9fe02a'],
  ],
  outline: { color: '#0b2a05', width: 1.8 },
  align: 'center',
  anchor: 'middle',
};
const INFO_NAME: TextStyle = {
  cap: 14,
  fill: [
    [0, '#fffa9a'],
    [1, '#f3e525'],
  ],
  outline: { color: '#000000', width: 1.6 },
  align: 'center',
  anchor: 'middle',
};
const INFO_SUB: TextStyle = {
  face: 'caps',
  cap: 9,
  fill: '#8dff4a',
  outline: { color: '#06200a', width: 1.2 },
  align: 'center',
  anchor: 'middle',
};
const INFO_NOTE: TextStyle = { ...textStyle.body('#d9ecff'), cap: 8.4, align: 'center' };
const STAMP: TextStyle = {
  cap: 22,
  fill: [
    [0, '#ffd0f8'],
    [1, '#e070d8'],
  ],
  outline: { color: '#3a0838', width: 2.4 },
  align: 'center',
  anchor: 'middle',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function shortDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${MONTHS[(m ?? 1) - 1] ?? ''} ${d ?? ''}`;
}

type Action =
  | { kind: 'level'; slot: number }
  | { kind: 'page'; dir: -1 | 1 }
  | { kind: 'menu' }
  | { kind: 'random' };

function cellBox(slot: number): Box {
  const [c, r] = SLOTS[slot] ?? [0, 0];
  return { x: COLS[c] ?? 0, y: ROWS[r] ?? 0, w: CELL_W, h: CELL_H };
}

/** The picture area inside a cell, under the title band. */
function pictureBox(cell: Box): Box {
  return { x: cell.x + 12, y: cell.y + 34, w: cell.w - 24, h: cell.h - 46 };
}

function paintBackground(ctx: Ctx): void {
  paintPlate(ctx, { x: 0, y: 0, w: WORLD_W, h: WORLD_H });
}

export class LevelSelectScreen implements Screen {
  private app: AppServices | null = null;
  private readonly levels: ManifestLevel[];
  private readonly pages: number[];
  private page: number;
  private selected = -1;
  private readonly buttons: ButtonSet<Action>;
  private noteLines: string[] | null = null;

  constructor(manifest: CampaignManifest, stage: number) {
    this.levels = manifestLevels(manifest);
    this.pages = manifest.stages.map((s) => s.stage);
    const i = this.pages.indexOf(stage);
    this.page = i < 0 ? 0 : i;
    this.buttons = new ButtonSet<Action>([
      ...SLOTS.map((_, slot): UiButton<Action> => ({
        action: { kind: 'level', slot },
        box: cellBox(slot),
        enabled: true,
      })),
      {
        action: { kind: 'page', dir: -1 },
        box: { x: CENTER_X - 124, y: WORLD_H - 56, w: 115, h: 34 },
        enabled: false,
      },
      {
        action: { kind: 'page', dir: 1 },
        box: { x: CENTER_X + 9, y: WORLD_H - 56, w: 115, h: 34 },
        enabled: false,
      },
      {
        action: { kind: 'menu' },
        box: { x: 12, y: WORLD_H - 62, w: 50, h: 50 },
        round: true,
        enabled: true,
      },
      {
        action: { kind: 'random' },
        box: { x: WORLD_W - 62, y: WORLD_H - 62, w: 50, h: 50 },
        round: true,
        enabled: false,
      },
    ]);
  }

  enter(app: AppServices): void {
    this.app = app;
    this.requestPage();
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return STEEL.deep;
  }

  private stage(): number {
    return this.pages[this.page] ?? 1;
  }

  /** The levels on this page, by slot. */
  private pageLevels(): ManifestLevel[] {
    const s = this.stage();
    return this.levels.filter((l) => l.stage.stage === s);
  }

  private requestPage(): void {
    for (const l of this.pageLevels()) levelThumbs.request(l);
  }

  private setPage(page: number): void {
    if (page < 0 || page >= this.pages.length || page === this.page) return;
    this.page = page;
    this.selected = -1;
    this.noteLines = null;
    this.requestPage();
  }

  private play(level: ManifestLevel): void {
    audioBus.emit({ type: 'uiClick' });
    this.app?.navigate(`#/quickplay/${level.level.id}`);
  }

  private act(a: Action, touch: boolean): void {
    const p = progressStore().progress;
    switch (a.kind) {
      case 'level': {
        const level = this.pageLevels()[a.slot];
        if (level === undefined) return;
        if (isCleared(p, level.level.id) && (!touch || this.selected === a.slot)) {
          this.play(level);
          return;
        }
        audioBus.emit({ type: 'uiClick' });
        this.selected = a.slot;
        this.noteLines = null;
        return;
      }
      case 'page':
        audioBus.emit({ type: 'uiClick' });
        this.setPage(this.page + a.dir);
        return;
      case 'menu':
        audioBus.emit({ type: 'uiClick' });
        this.app?.navigate('#/');
        return;
      case 'random': {
        const cleared = this.levels.filter((l) => isCleared(p, l.level.id));
        const pick = cleared[Math.floor(Math.random() * cleared.length)];
        if (pick !== undefined) this.play(pick);
        return;
      }
    }
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    const p = progressStore().progress;
    const levels = this.pageLevels();
    for (const b of this.buttons.items) {
      if (b.action.kind === 'page') {
        b.enabled = this.page + b.action.dir >= 0 && this.page + b.action.dir < this.pages.length;
      } else if (b.action.kind === 'random') {
        b.enabled = this.levels.some((l) => isCleared(p, l.level.id));
      } else if (b.action.kind === 'level') {
        b.enabled = levels[b.action.slot] !== undefined;
      }
    }
    for (const code of input.consumeKeys()) {
      if (code === 'ArrowLeft') this.setPage(this.page - 1);
      else if (code === 'ArrowRight') this.setPage(this.page + 1);
      else if (code === 'Escape') this.act({ kind: 'menu' }, false);
    }
    const touch = input.pointer.kind === 'touch';
    for (const a of this.buttons.handle(input)) this.act(a, touch);

    drawLayer(ctx, layers.get('quickplay:plate', k, 0, 0, WORLD_W, WORLD_H, paintBackground));
    drawTitlePill(
      ctx,
      { x: 96, y: 12, w: WORLD_W - 192, h: 34 },
      `Quick Play: ${stageName(this.stage())}`,
    );

    // Which level the info panel shows: the one under the mouse, else the one tapped last.
    let shown = this.selected;
    this.buttons.items.forEach((b, i) => {
      const state = this.buttons.state(i, input);
      const a = b.action;
      if (a.kind === 'level') {
        const level = levels[a.slot];
        this.drawCell(ctx, k, b.box, level, p, state, a.slot === this.selected);
        if (level !== undefined && (state === 'hover' || state === 'down')) shown = a.slot;
      } else if (a.kind === 'page') {
        drawArrowButton(ctx, b.box, a.dir < 0 ? 'left' : 'right', state);
      } else if (a.kind === 'menu') {
        drawRoundMenu(ctx, b.box, state);
      } else {
        drawRoundButton(
          ctx,
          b.box.x + b.box.w / 2,
          b.box.y + b.box.h / 2,
          b.box.w / 2,
          'green',
          state,
          'Random',
        );
      }
    });
    this.drawInfo(ctx, levels[shown] ?? null, p, shown);
  }

  private drawCell(
    ctx: Ctx,
    k: number,
    cell: Box,
    level: ManifestLevel | undefined,
    p: Progress,
    state: ButtonState,
    selected: boolean,
  ): void {
    const inner = drawTealWindow(ctx, cell, 16, 8);
    if (level === undefined) {
      finishTealWindow(ctx, inner);
      return;
    }
    const id = level.level.id;
    const cleared = isCleared(p, id);
    drawText(ctx, level.level.name.toUpperCase(), cell.x + cell.w / 2, cell.y + 18, TITLE, {
      maxWidth: cell.w - 30,
    });
    const pic = pictureBox(cell);
    const clip: PathFn = (c) => {
      roundRect(c, pic.x, pic.y, pic.w, pic.h, 9);
    };
    ctx.save();
    clip(ctx);
    ctx.clip();
    if (!levelThumbs.draw(ctx, k, id, pic)) {
      ctx.fillStyle = '#0e1638';
      ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
    }
    if (!cleared) {
      // Locked: a purple veil with a diagonal stamp (10.4).
      ctx.fillStyle = 'rgba(60, 10, 80, 0.62)';
      ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
      ctx.save();
      ctx.translate(pic.x + pic.w / 2, pic.y + pic.h / 2);
      ctx.rotate(-0.32);
      roundRect(ctx, -86, -21, 172, 42, 8);
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba('#f09ae8', 0.9);
      ctx.stroke();
      drawText(ctx, 'LOCKED', 0, 1, STAMP);
      ctx.restore();
    }
    ctx.restore();
    finishTealWindow(ctx, clip);
    if (cleared && levelRecord(p, id).fullClear) drawMedal(ctx, pic.x + pic.w - 20, pic.y + 20);
    if (cleared && (state === 'hover' || state === 'down' || selected)) {
      // The orange-gold ring around the thumbnail (10.4).
      roundRect(ctx, cell.x - 11, cell.y - 11, cell.w + 22, cell.h + 22, 24);
      ctx.lineWidth = 4;
      ctx.strokeStyle = linear(ctx, 0, cell.y - 11, 0, cell.y + cell.h + 11, [
        [0, '#ffe27a'],
        [0.5, '#ff9a1a'],
        [1, '#d86a08'],
      ]);
      ctx.stroke();
    }
  }

  private drawInfo(ctx: Ctx, level: ManifestLevel | null, p: Progress, slot: number): void {
    drawPanel(ctx, INFO);
    const cx = INFO.x + INFO.w / 2;
    if (level === null) {
      const anyCleared = this.pageLevels().some((l) => isCleared(p, l.level.id));
      const text = !anyCleared
        ? 'Levels you clear in the Adventure can be replayed here.'
        : display.coarse
          ? 'Tap a level to see its best scores, and tap a cleared level again to play it.'
          : 'Pick a level to see its best scores. Click a cleared level to play it.';
      this.drawNote(ctx, text, INFO.y + INFO.h / 2 - 10, slot);
      return;
    }
    const id = level.level.id;
    const rec = levelRecord(p, id);
    drawText(ctx, level.level.name.toUpperCase(), cx, INFO.y + 32, INFO_NAME, {
      maxWidth: INFO.w - 40,
    });
    const sub = `Stage ${level.stage.stage} · Level ${level.index}${rec.fullClear ? ' · Full clear' : ''}`;
    const subStyle = legible(INFO_SUB);
    drawText(ctx, sub.toUpperCase(), cx, INFO.y + 52, subStyle, { maxWidth: INFO.w - 30 });
    if (!isCleared(p, id)) {
      drawLock(ctx, cx, INFO.y + 100, 2.2);
      this.drawNote(ctx, 'Clear this level in the Adventure to play it here.', INFO.y + 150, slot);
      return;
    }
    drawText(ctx, 'BEST SCORES', cx, INFO.y + 74, { ...subStyle, fill: '#ffffff' });
    let y = INFO.y + 84;
    rec.top.forEach((e, i) => {
      const who = e.master === null ? 'No master' : masterOfPower(e.master).animal;
      drawListRow(
        ctx,
        { x: INFO.x + 18, y, w: INFO.w - 36, h: 20 },
        i + 1,
        `${who}, ${shortDate(e.date)}`,
        formatNumber(e.score),
        'normal',
      );
      y += 21;
    });
    drawText(
      ctx,
      `Tries ${rec.tries} · Wins ${rec.wins}`,
      cx,
      INFO.y + INFO.h - 22,
      legible(INFO_NOTE),
    );
  }

  private noteSlot = -2;
  private noteCap = 0;

  private drawNote(ctx: Ctx, text: string, y: number, slot: number): void {
    const style = legible(INFO_NOTE);
    if (this.noteLines === null || this.noteSlot !== slot || this.noteCap !== style.cap) {
      this.noteLines = wrapText(ctx, text, INFO.w - 60, style);
      this.noteSlot = slot;
      this.noteCap = style.cap;
    }
    const pitch = Math.max(15, style.cap * 1.6);
    let ly = y - ((this.noteLines.length - 1) * pitch) / 2;
    for (const line of this.noteLines) {
      drawText(ctx, line, INFO.x + INFO.w / 2, ly, style);
      ly += pitch;
    }
  }
}

/** Full clear medal: Teggle's own small gold medal with a lit peg (guide 15). */
function drawMedal(ctx: Ctx, x: number, y: number): void {
  circlePath(ctx, x + 1, y + 2, 13);
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.fill();
  circlePath(ctx, x, y, 13);
  ctx.fillStyle = radial(ctx, x - 4, y - 5, 1, x, y, 13, [
    [0, '#fff6c8'],
    [0.4, '#f2c24a'],
    [1, '#8a5a14'],
  ]);
  ctx.fill();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#3e2410';
  ctx.stroke();
  circlePath(ctx, x, y, 5.5);
  ctx.fillStyle = radial(ctx, x - 1.5, y - 2, 0.5, x, y, 5.5, [
    [0, '#fafabc'],
    [0.6, '#f8a44d'],
    [1, '#a03504'],
  ]);
  ctx.fill();
}
