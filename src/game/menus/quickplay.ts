// Quick Play's level select (visual guide 10.4; spec 8): a title pill, a 3 x 2 grid of thumbnail
// windows with the level titles in lime, the bottom middle cell an info panel with the level's
// name and best scores, paging arrows under it, the round main menu button bottom left and a
// random level button bottom right. One page per stage, so a page holds that stage's five
// levels. A level plays once the Adventure has cleared it; until then it is stamped LOCKED.
// Levels with every peg cleared carry a medal.
//
// A click on a cleared level plays it; on a touch screen the first tap shows its scores in the
// info panel and the second plays it. The challenge whose level the player picks uses the same
// screen in its own mode (LevelSelectMode): any level in the game, then the challenge. So does
// Quick Play's Original section, the original game's 55 levels, every one open, with records of
// their own; a pill bottom left switches between the two sections.

import { display, legible } from '../app/display';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { audioBus } from '../audio/bus';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import { LEVELS_PER_STAGE, type CampaignManifest } from '../../level/campaign';
import type { OriginalManifest } from '../../level/original';
import { masterOfPower } from '../../rules/masters';
import { circlePath, linear, radial, roundRect, type Ctx, type PathFn } from '../render/paint';
import {
  isCleared,
  levelRecord,
  originalRecord,
  type LevelRecord,
  type Progress,
} from '../progress/save';
import { progressStore } from '../progress/store';
import {
  drawArrowButton,
  drawListRow,
  drawPanel,
  drawPillButton,
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
import { manifestLevels } from '../modes/manifest';
import { drawLayer, layers } from '../render/cache';
import { wrapText } from './overlay';
import { campaignThumb, levelThumbs, originalThumb, type ThumbSource } from './thumbs';

const CELL_W = 316;
const CELL_H = 226;
const COLS = [26, CENTER_X - CELL_W / 2, WORLD_W - 26 - CELL_W] as const;
const ROWS = [62, 302] as const;
/** Grid cells for a page's five items; the bottom middle cell is the info panel. */
const SLOTS: readonly (readonly [number, number])[] = [
  [0, 0],
  [1, 0],
  [2, 0],
  [0, 1],
  [2, 1],
];
/** The info panel: the bottom middle cell of the grid (10.4). */
export const INFO: Box = { x: COLS[1], y: ROWS[1], w: CELL_W, h: CELL_H };
/** The title pill over the grid. */
export const TITLE_PILL: Box = { x: 96, y: 12, w: WORLD_W - 192, h: 34 };
/** Paging arrows under the info panel, the round menu button bottom left. */
export const PAGE_LEFT: Box = { x: CENTER_X - 124, y: WORLD_H - 56, w: 115, h: 34 };
export const PAGE_RIGHT: Box = { x: CENTER_X + 9, y: WORLD_H - 56, w: 115, h: 34 };
export const MENU_BUTTON: Box = { x: 12, y: WORLD_H - 62, w: 50, h: 50 };
/** The pill that switches to the other section, between the menu button and the arrows. */
export const OTHER_BUTTON: Box = { x: 74, y: WORLD_H - 56, w: 196, h: 34 };

/** A level as the level select shows it. */
export interface SelectLevel {
  /** Its id in the mode's routes and records, e.g. "1-3". */
  readonly id: string;
  readonly name: string;
  readonly stage: number;
  /** 1-based place within its stage. */
  readonly index: number;
  readonly thumb: ThumbSource;
}

/** The campaign's levels, in campaign order. */
export function campaignLevels(m: CampaignManifest): SelectLevel[] {
  return manifestLevels(m).map((l) => ({
    id: l.level.id,
    name: l.level.name,
    stage: l.stage.stage,
    index: l.index,
    thumb: campaignThumb(l),
  }));
}

/** The original's levels, in its campaign order. */
export function originalLevels(m: OriginalManifest): SelectLevel[] {
  return m.levels.map((l) => ({
    id: l.id,
    name: l.name,
    stage: l.stage,
    index: l.number - (l.stage - 1) * LEVELS_PER_STAGE,
    thumb: originalThumb(l),
  }));
}

/** What the level select is for: Quick Play, its Original section, or a challenge's level. */
export interface LevelSelectMode {
  /** The title pill's text on a stage's page. */
  title(stage: number): string;
  /** A level can be chosen (else it is stamped LOCKED). */
  choosable(id: string, p: Progress): boolean;
  /** A level's record: its best scores, tries, wins and full clear. */
  record(p: Progress, id: string): LevelRecord;
  /** Where choosing a level leads. */
  open(id: string): string;
  /** Where the menu button and Escape lead. */
  readonly back: string;
  /** The info panel's line while no level is picked, once some level can be chosen. */
  hint(coarse: boolean): string;
  /** The round random button bottom right. */
  readonly random: boolean;
  /** The pill bottom left that switches to the other section, if any. */
  readonly other?: { readonly label: string; readonly hash: string };
}

/** Quick Play: levels the Adventure has cleared (spec 8). */
export const QUICK_PLAY: LevelSelectMode = {
  title: (stage) => `Quick Play: ${stageName(stage)}`,
  choosable: (id, p) => isCleared(p, id),
  record: levelRecord,
  open: (id) => `#/quickplay/${id}`,
  back: '#/',
  hint: (coarse) =>
    coarse
      ? 'Tap a level to see its best scores, and tap a cleared level again to play it.'
      : 'Pick a level to see its best scores. Click a cleared level to play it.',
  random: true,
  other: { label: 'Original Levels', hash: '#/quickplay/original' },
};

/** Quick Play's Original section: the original game's 55 levels, all open (spec 14.1). */
export const ORIGINAL_QUICK_PLAY: LevelSelectMode = {
  title: (stage) => `Original Levels: ${stageName(stage)}`,
  choosable: () => true,
  record: originalRecord,
  open: (id) => `#/quickplay/original/${id}`,
  back: '#/',
  hint: (coarse) =>
    coarse
      ? 'Tap a level to see its best scores, and tap it again to play it.'
      : 'Pick a level to see its best scores. Click one to play it.',
  random: true,
  other: { label: 'Teggle Levels', hash: '#/quickplay' },
};

/** Cell `slot` (0 to 4) of the grid. */
export function cellBox(slot: number): Box {
  const [c, r] = SLOTS[slot] ?? [0, 0];
  return { x: COLS[c] ?? 0, y: ROWS[r] ?? 0, w: CELL_W, h: CELL_H };
}

/** The picture area inside a cell, under the title band. */
export function pictureBox(cell: Box): Box {
  return { x: cell.x + 12, y: cell.y + 34, w: cell.w - 24, h: cell.h - 46 };
}

/** A cell's title, above its picture: lime display text (10.4). */
export const TITLE: TextStyle = {
  cap: 12,
  fill: [
    [0, '#efff9a'],
    [1, '#9fe02a'],
  ],
  outline: { color: '#0b2a05', width: 1.8 },
  align: 'center',
  anchor: 'middle',
};
/** The info panel's item name (yellow), subheading (green) and notes. */
export const INFO_NAME: TextStyle = {
  cap: 14,
  fill: [
    [0, '#fffa9a'],
    [1, '#f3e525'],
  ],
  outline: { color: '#000000', width: 1.6 },
  align: 'center',
  anchor: 'middle',
};
export const INFO_SUB: TextStyle = {
  face: 'caps',
  cap: 9,
  fill: '#8dff4a',
  outline: { color: '#06200a', width: 1.2 },
  align: 'center',
  anchor: 'middle',
};
export const INFO_NOTE: TextStyle = { ...textStyle.body('#d9ecff'), cap: 8.4, align: 'center' };
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
  | { kind: 'random' }
  | { kind: 'other'; hash: string; label: string };

export function paintBackground(ctx: Ctx): void {
  paintPlate(ctx, { x: 0, y: 0, w: WORLD_W, h: WORLD_H });
}

export class LevelSelectScreen implements Screen {
  private app: AppServices | null = null;
  private readonly pages: number[];
  private page: number;
  private selected = -1;
  private readonly buttons: ButtonSet<Action>;
  private noteLines: string[] | null = null;

  /** `levels` in play order; one page per stage they come from, starting on `stage`'s. */
  constructor(
    private readonly levels: readonly SelectLevel[],
    stage: number,
    private readonly mode: LevelSelectMode = QUICK_PLAY,
  ) {
    this.pages = [...new Set(levels.map((l) => l.stage))];
    const i = this.pages.indexOf(stage);
    this.page = i < 0 ? 0 : i;
    const other = mode.other;
    this.buttons = new ButtonSet<Action>([
      ...SLOTS.map((_, slot): UiButton<Action> => ({
        action: { kind: 'level', slot },
        box: cellBox(slot),
        enabled: true,
      })),
      { action: { kind: 'page', dir: -1 }, box: PAGE_LEFT, enabled: false },
      { action: { kind: 'page', dir: 1 }, box: PAGE_RIGHT, enabled: false },
      { action: { kind: 'menu' }, box: MENU_BUTTON, round: true, enabled: true },
      {
        action: { kind: 'random' },
        box: { x: WORLD_W - 62, y: WORLD_H - 62, w: 50, h: 50 },
        round: true,
        enabled: false,
      },
      ...(other === undefined
        ? []
        : [
            {
              action: { kind: 'other' as const, hash: other.hash, label: other.label },
              box: OTHER_BUTTON,
              enabled: true,
            },
          ]),
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
  private pageLevels(): SelectLevel[] {
    const s = this.stage();
    return this.levels.filter((l) => l.stage === s);
  }

  private requestPage(): void {
    for (const l of this.pageLevels()) levelThumbs.requestSource(l.thumb);
  }

  private setPage(page: number): void {
    if (page < 0 || page >= this.pages.length || page === this.page) return;
    this.page = page;
    this.selected = -1;
    this.noteLines = null;
    this.requestPage();
  }

  private play(level: SelectLevel): void {
    audioBus.emit({ type: 'uiClick' });
    this.app?.navigate(this.mode.open(level.id));
  }

  private act(a: Action, touch: boolean): void {
    const p = progressStore().progress;
    switch (a.kind) {
      case 'level': {
        const level = this.pageLevels()[a.slot];
        if (level === undefined) return;
        if (this.mode.choosable(level.id, p) && (!touch || this.selected === a.slot)) {
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
        this.app?.navigate(this.mode.back);
        return;
      case 'random': {
        const cleared = this.levels.filter((l) => this.mode.choosable(l.id, p));
        const pick = cleared[Math.floor(Math.random() * cleared.length)];
        if (pick !== undefined) this.play(pick);
        return;
      }
      case 'other':
        audioBus.emit({ type: 'uiClick' });
        this.app?.navigate(a.hash);
        return;
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
        b.enabled = this.mode.random && this.levels.some((l) => this.mode.choosable(l.id, p));
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
    drawTitlePill(ctx, TITLE_PILL, this.mode.title(this.stage()));

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
      } else if (a.kind === 'other') {
        drawPillButton(ctx, b.box, 'blue', state, a.label);
      } else if (this.mode.random) {
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
    level: SelectLevel | undefined,
    p: Progress,
    state: ButtonState,
    selected: boolean,
  ): void {
    const inner = drawTealWindow(ctx, cell, 16, 8);
    if (level === undefined) {
      finishTealWindow(ctx, inner);
      return;
    }
    const id = level.id;
    const cleared = this.mode.choosable(id, p);
    drawText(ctx, level.name.toUpperCase(), cell.x + cell.w / 2, cell.y + 18, TITLE, {
      maxWidth: cell.w - 30,
    });
    const pic = pictureBox(cell);
    const clip: PathFn = (c) => {
      roundRect(c, pic.x, pic.y, pic.w, pic.h, 9);
    };
    ctx.save();
    clip(ctx);
    ctx.clip();
    if (!levelThumbs.draw(ctx, k, level.thumb.key, pic)) {
      ctx.fillStyle = '#0e1638';
      ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
    }
    if (!cleared) drawLockedVeil(ctx, pic);
    ctx.restore();
    finishTealWindow(ctx, clip);
    if (cleared && this.mode.record(p, id).fullClear) {
      drawMedal(ctx, pic.x + pic.w - 20, pic.y + 20);
    }
    if (cleared && (state === 'hover' || state === 'down' || selected)) drawSelectRing(ctx, cell);
  }

  private drawInfo(ctx: Ctx, level: SelectLevel | null, p: Progress, slot: number): void {
    drawPanel(ctx, INFO);
    const cx = INFO.x + INFO.w / 2;
    if (level === null) {
      const anyCleared = this.pageLevels().some((l) => this.mode.choosable(l.id, p));
      const text = !anyCleared
        ? 'Levels you clear in the Adventure can be replayed here.'
        : this.mode.hint(display.coarse);
      this.drawNote(ctx, text, INFO.y + INFO.h / 2 - 10, slot);
      return;
    }
    const id = level.id;
    const rec = this.mode.record(p, id);
    drawText(ctx, level.name.toUpperCase(), cx, INFO.y + 32, INFO_NAME, {
      maxWidth: INFO.w - 40,
    });
    const sub = `Stage ${level.stage} · Level ${level.index}${rec.fullClear ? ' · Full clear' : ''}`;
    const subStyle = legible(INFO_SUB);
    drawText(ctx, sub.toUpperCase(), cx, INFO.y + 52, subStyle, { maxWidth: INFO.w - 30 });
    if (!this.mode.choosable(id, p)) {
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

/** Locked: a purple veil over the picture with a diagonal LOCKED stamp (10.4). */
export function drawLockedVeil(ctx: Ctx, pic: Box): void {
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

/** The orange-gold ring around a hovered or picked cell (10.4). */
export function drawSelectRing(ctx: Ctx, cell: Box): void {
  roundRect(ctx, cell.x - 11, cell.y - 11, cell.w + 22, cell.h + 22, 24);
  ctx.lineWidth = 4;
  ctx.strokeStyle = linear(ctx, 0, cell.y - 11, 0, cell.y + cell.h + 11, [
    [0, '#ffe27a'],
    [0.5, '#ff9a1a'],
    [1, '#d86a08'],
  ]);
  ctx.stroke();
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
