// The challenge list (visual guide 10.4, the level select's layout, used for the challenge lists):
// one page per challenge group, its five challenges in thumbnail windows with their names in
// lime, the bottom middle cell an info panel with the challenge's goal, its levels and the
// player's record. A passed challenge carries Teggle's medal; one that cannot be played is
// stamped LOCKED and the info panel says why (its group is not open yet, its levels are not in
// the game yet, or it is a duel, which is not in the game yet). The paging arrows under the info
// panel go from group to group.
//
// A click on a playable challenge starts it; on a touch screen the first tap shows it in the info
// panel and the second starts it.

import { display, legible } from '../app/display';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { audioBus } from '../audio/bus';
import { WORLD_H, WORLD_W, type Box } from '../layout';
import type { CampaignManifest } from '../../level/campaign';
import {
  CHALLENGE_GROUPS,
  CHALLENGES_PER_GROUP,
  challengeById,
  isPick,
  namedSlots,
  randomCount,
  randomPool,
  type ChallengeDef,
  type ChallengeGroup,
} from '../../rules/challenges';
import { drawLayer, layers } from '../render/cache';
import { linear, roundRect, type Ctx, type PathFn } from '../render/paint';
import {
  challengeRecord,
  isPassed,
  passedCount,
  type ChallengeRecord,
  type Progress,
} from '../progress/save';
import { progressStore } from '../progress/store';
import { drawArrowButton, drawListRow, drawPanel, type ButtonState } from '../ui/controls';
import { drawMedal } from '../ui/medal';
import { drawText, formatNumber, textStyle, type TextStyle } from '../ui/text';
import {
  builtSlots,
  challengeStatus,
  groupOpen,
  levelNamer,
  type ChallengeStatus,
} from '../modes/challenge-run';
import { findLevel, manifestLevels } from '../modes/manifest';
import { ButtonSet, type UiButton } from './buttons';
import { goalBand, goalSentence, listing, lockSentences, type LevelNamer } from './challenge-copy';
import { drawLock, drawTealWindow, drawTitlePill, finishTealWindow, STEEL } from './chrome';
import { drawRoundMenu } from './intro';
import { wrapText } from './overlay';
import {
  cellBox,
  drawLockedVeil,
  drawSelectRing,
  INFO,
  INFO_NAME,
  INFO_NOTE,
  INFO_SUB,
  MENU_BUTTON,
  PAGE_LEFT,
  PAGE_RIGHT,
  paintBackground,
  pictureBox,
  TITLE,
  TITLE_PILL,
} from './quickplay';
import { levelThumbs } from './thumbs';

const BAND: TextStyle = {
  cap: 10,
  fill: [
    [0, '#fffa9a'],
    [1, '#f3c525'],
  ],
  outline: { color: '#000000', width: 1.5 },
  align: 'center',
  anchor: 'middle',
};
const CARD: TextStyle = {
  cap: 20,
  fill: [
    [0, '#fffbd0'],
    [0.5, '#ffb21c'],
    [1, '#d8300a'],
  ],
  outline: { color: '#2a0c02', width: 2 },
  align: 'center',
  anchor: 'middle',
};
/** A level that is not in the game yet shows its slot. */
const SLOT_ID: TextStyle = {
  ...CARD,
  cap: 16,
  fill: '#6f86c8',
  outline: { color: '#05082a', width: 1.6 },
};
const GOAL: TextStyle = { ...textStyle.body('#ffffff'), cap: 8.4, align: 'center' };
const LOCK_NOTE: TextStyle = { ...textStyle.body('#ffc06a'), cap: 8.4, align: 'center' };
/** Height of the goal band along the bottom of a cell's picture. */
const BAND_H = 28;
/** Levels a pick challenge's picture shows. */
const PICK_PREVIEW = 5;

type Action = { kind: 'cell'; slot: number } | { kind: 'page'; dir: -1 | 1 } | { kind: 'menu' };

/** The five challenges of a group, in order. */
function groupChallenges(g: ChallengeGroup): ChallengeDef[] {
  const out: ChallengeDef[] = [];
  for (let i = 1; i <= CHALLENGES_PER_GROUP; i++) {
    const c = challengeById(`${g.id}.${i}`);
    if (c !== null) out.push(c);
  }
  return out;
}

export class ChallengeListScreen implements Screen {
  private app: AppServices | null = null;
  private page: number;
  private selected: number;
  private readonly buttons: ButtonSet<Action>;
  private readonly built: ReadonlySet<string>;
  private readonly name: LevelNamer;
  private readonly firstLevels: readonly string[];
  private textKey = '';
  private goalLines: string[] = [];
  private noteLines: string[] = [];

  /**
   * Opens on the page of `group` (a group id), else of `selected` (a challenge id, shown in the
   * info panel), else on the first open group with a challenge left to pass.
   */
  constructor(
    private readonly manifest: CampaignManifest,
    group: string | null,
    selected: string | null = null,
  ) {
    this.built = builtSlots(manifest);
    this.name = levelNamer(manifest);
    this.firstLevels = manifestLevels(manifest)
      .slice(0, PICK_PREVIEW)
      .map((l) => l.level.id);
    const def = selected === null ? null : challengeById(selected);
    const asked = CHALLENGE_GROUPS.findIndex((g) => g.id === (group ?? def?.group));
    this.page = asked >= 0 ? asked : this.firstOpenUnfinished();
    this.selected = def === null || def.group !== this.group().id ? -1 : def.index - 1;
    this.buttons = new ButtonSet<Action>([
      ...Array.from({ length: CHALLENGES_PER_GROUP }, (_, slot): UiButton<Action> => ({
        action: { kind: 'cell', slot },
        box: cellBox(slot),
        enabled: true,
      })),
      { action: { kind: 'page', dir: -1 }, box: PAGE_LEFT, enabled: true },
      { action: { kind: 'page', dir: 1 }, box: PAGE_RIGHT, enabled: true },
      { action: { kind: 'menu' }, box: MENU_BUTTON, round: true, enabled: true },
    ]);
  }

  private firstOpenUnfinished(): number {
    const p = progressStore().progress;
    const i = CHALLENGE_GROUPS.findIndex(
      (g, index) => !g.duel && groupOpen(p, index) && passedCount(p, g.id) < CHALLENGES_PER_GROUP,
    );
    return Math.max(0, i);
  }

  enter(app: AppServices): void {
    this.app = app;
    this.requestThumbs();
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return STEEL.deep;
  }

  private group(): ChallengeGroup {
    const g = CHALLENGE_GROUPS[this.page] ?? CHALLENGE_GROUPS[0];
    if (g === undefined) throw new Error('there are no challenge groups');
    return g;
  }

  private statuses(p: Progress): ChallengeStatus[] {
    return groupChallenges(this.group()).map((c) => challengeStatus(p, this.built, c));
  }

  /** The levels a cell's picture shows: the named ones, or for the pick the first in the game. */
  private pictureLevels(def: ChallengeDef): readonly string[] {
    return isPick(def) ? this.firstLevels : namedSlots(def);
  }

  private requestThumbs(): void {
    for (const def of groupChallenges(this.group())) {
      for (const slot of this.pictureLevels(def)) {
        const entry = findLevel(this.manifest, slot);
        if (entry !== null) levelThumbs.request(entry);
      }
    }
  }

  private setPage(page: number): void {
    const n = CHALLENGE_GROUPS.length;
    const next = ((page % n) + n) % n;
    if (next === this.page) return;
    this.page = next;
    this.selected = -1;
    this.textKey = '';
    this.requestThumbs();
  }

  private act(a: Action, touch: boolean): void {
    const app = this.app;
    if (app === null) return;
    audioBus.emit({ type: 'uiClick' });
    switch (a.kind) {
      case 'cell': {
        const s = this.statuses(progressStore().progress)[a.slot];
        if (s === undefined) return;
        if (s.playable && (!touch || this.selected === a.slot)) {
          app.navigate(`#/challenges/${s.def.id}`);
          return;
        }
        this.selected = a.slot;
        return;
      }
      case 'page':
        this.setPage(this.page + a.dir);
        return;
      case 'menu':
        app.navigate('#/');
        return;
    }
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    const p = progressStore().progress;
    for (const code of input.consumeKeys()) {
      if (code === 'ArrowLeft') this.setPage(this.page - 1);
      else if (code === 'ArrowRight') this.setPage(this.page + 1);
      else if (code === 'Escape') this.act({ kind: 'menu' }, false);
    }
    const touch = input.pointer.kind === 'touch';
    for (const a of this.buttons.handle(input)) this.act(a, touch);

    const list = this.statuses(p);
    drawLayer(ctx, layers.get('quickplay:plate', k, 0, 0, WORLD_W, WORLD_H, paintBackground));
    drawTitlePill(ctx, TITLE_PILL, `Challenges: ${this.group().name}`);

    // The info panel shows the challenge under the mouse, else the one tapped last.
    let shown = this.selected;
    this.buttons.items.forEach((b, i) => {
      const state = this.buttons.state(i, input);
      const a = b.action;
      if (a.kind === 'cell') {
        const s = list[a.slot];
        if (s === undefined) return;
        this.drawCell(ctx, k, b.box, s, p, state, a.slot === this.selected);
        if (state === 'hover' || state === 'down') shown = a.slot;
      } else if (a.kind === 'page') {
        drawArrowButton(ctx, b.box, a.dir < 0 ? 'left' : 'right', state);
      } else {
        drawRoundMenu(ctx, b.box, state);
      }
    });
    const s = list[shown];
    if (s === undefined) this.drawGroupInfo(ctx, list, p);
    else this.drawChallengeInfo(ctx, s, p);
  }

  private drawCell(
    ctx: Ctx,
    k: number,
    cell: Box,
    s: ChallengeStatus,
    p: Progress,
    state: ButtonState,
    selected: boolean,
  ): void {
    const def = s.def;
    drawTealWindow(ctx, cell, 16, 8);
    drawText(ctx, def.name.toUpperCase(), cell.x + cell.w / 2, cell.y + 18, TITLE, {
      maxWidth: cell.w - 30,
    });
    const pic = pictureBox(cell);
    const clip: PathFn = (c) => {
      roundRect(c, pic.x, pic.y, pic.w, pic.h, 9);
    };
    ctx.save();
    clip(ctx);
    ctx.clip();
    this.drawPicture(ctx, k, def, pic);
    // The goal in a dark band along the bottom.
    const by = pic.y + pic.h - BAND_H;
    ctx.fillStyle = linear(ctx, 0, by, 0, pic.y + pic.h, [
      [0, 'rgba(4, 6, 30, 0.55)'],
      [1, 'rgba(4, 6, 30, 0.85)'],
    ]);
    ctx.fillRect(pic.x, by, pic.w, BAND_H);
    drawText(ctx, goalBand(def), pic.x + pic.w / 2, by + BAND_H / 2, legible(BAND), {
      maxWidth: pic.w - 20,
    });
    if (!s.playable) drawLockedVeil(ctx, pic);
    ctx.restore();
    finishTealWindow(ctx, clip);
    if (isPassed(p, def.id)) drawMedal(ctx, pic.x + pic.w - 22, pic.y + 20, 13);
    if (s.playable && (state === 'hover' || state === 'down' || selected)) {
      drawSelectRing(ctx, cell);
    }
  }

  /** The named levels side by side, face-down cards for random levels, the pick's choice. */
  private drawPicture(ctx: Ctx, k: number, def: ChallengeDef, pic: Box): void {
    ctx.fillStyle = linear(ctx, 0, pic.y, 0, pic.y + pic.h, [
      [0, '#16205a'],
      [1, '#0b0f30'],
    ]);
    ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
    const slots = this.pictureLevels(def);
    if (slots.length === 0) {
      drawCards(ctx, randomCount(def), pic);
      return;
    }
    const w = pic.w / slots.length;
    slots.forEach((slot, i) => {
      const b: Box = { x: Math.round(pic.x + i * w), y: pic.y, w: Math.round(w), h: pic.h };
      ctx.save();
      ctx.beginPath();
      ctx.rect(b.x, b.y, b.w, b.h);
      ctx.clip();
      // A level that is not in the game (or still loading) shows its slot near the top, clear
      // of the LOCKED stamp.
      if (!levelThumbs.draw(ctx, k, slot, b)) drawText(ctx, slot, b.x + b.w / 2, b.y + 28, SLOT_ID);
      ctx.restore();
      if (i > 0) {
        ctx.fillStyle = 'rgba(2, 4, 14, 0.9)';
        ctx.fillRect(b.x - 1.5, b.y, 3, b.h);
      }
    });
    if (isPick(def)) {
      ctx.fillStyle = 'rgba(8, 10, 40, 0.45)';
      ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
      drawText(ctx, '?', pic.x + pic.w / 2, pic.y + (pic.h - BAND_H) / 2, { ...CARD, cap: 44 });
    }
  }

  /** The info panel while no challenge is picked: the group. */
  private drawGroupInfo(ctx: Ctx, list: readonly ChallengeStatus[], p: Progress): void {
    const g = this.group();
    drawPanel(ctx, INFO);
    const cx = INFO.x + INFO.w / 2;
    drawText(ctx, g.name.toUpperCase(), cx, INFO.y + 32, INFO_NAME, { maxWidth: INFO.w - 40 });
    const head =
      `Group ${this.page + 1} of ${CHALLENGE_GROUPS.length} · ` +
      `${passedCount(p, g.id)} of ${CHALLENGES_PER_GROUP} passed`;
    drawText(ctx, head.toUpperCase(), cx, INFO.y + 52, legible(INFO_SUB), {
      maxWidth: INFO.w - 30,
    });
    const first = list[0];
    let note: string;
    if (g.duel) note = 'Duels are not in the game yet.';
    else if (first !== undefined && !first.open) {
      note = lockSentences(false, first.opensAfter, null)[0] ?? '';
    } else if (list.some((s) => s.playable)) {
      note = display.coarse
        ? 'Tap a challenge to see its goal, and tap it again to start it.'
        : 'Pick a challenge to see its goal. Click it to start.';
    } else note = "This group's levels are not in the game yet.";
    const playable = list.some((s) => s.playable);
    // A group that cannot be played says why instead of describing itself.
    let y = this.drawLines(
      ctx,
      `group:${g.id}:${note}`,
      playable ? g.description : '',
      playable ? '' : note,
      INFO.y + 76,
    );
    // The group's five challenges with where each stands: the ranked list of 10.4.
    y = Math.max(y - 6, INFO.y + 100);
    list.forEach((s, i) => {
      const value = isPassed(p, s.def.id) ? 'PASSED' : s.playable ? 'OPEN' : 'LOCKED';
      drawListRow(
        ctx,
        { x: INFO.x + 18, y, w: INFO.w - 36, h: 17 },
        i + 1,
        s.def.name,
        value,
        'normal',
      );
      y += 18;
    });
    if (playable && y < INFO.y + INFO.h - 30) {
      drawText(ctx, note, cx, INFO.y + INFO.h - 20, legible(INFO_NOTE), {
        maxWidth: INFO.w - 24,
      });
    }
  }

  private drawChallengeInfo(ctx: Ctx, s: ChallengeStatus, p: Progress): void {
    const def = s.def;
    const g = this.group();
    const rec = challengeRecord(p, def.id);
    drawPanel(ctx, INFO);
    const cx = INFO.x + INFO.w / 2;
    drawText(ctx, def.name.toUpperCase(), cx, INFO.y + 32, INFO_NAME, { maxWidth: INFO.w - 40 });
    const head =
      `${g.name} · ${def.index} of ${CHALLENGES_PER_GROUP}` + (rec.passes > 0 ? ' · Passed' : '');
    drawText(ctx, head.toUpperCase(), cx, INFO.y + 52, legible(INFO_SUB), {
      maxWidth: INFO.w - 30,
    });
    const locks = s.playable ? [] : lockSentences(s.open, s.opensAfter, s.unplayable);
    // Random levels: which levels they come from, while the game holds few of them.
    const pool = randomPool(this.built);
    const from =
      randomCount(def) === 0 || !s.playable
        ? ''
        : pool.length <= 6
          ? ` The levels come from ${listing(pool)}.`
          : ` The levels come from the ${pool.length} the random pool has in the game.`;
    let y = this.drawLines(
      ctx,
      `challenge:${def.id}:${locks.join(' ')}`,
      goalSentence(def, this.name) + from,
      locks.join(' '),
      INFO.y + 76,
    );
    if (locks.length > 0) {
      drawLock(ctx, cx, INFO.y + INFO.h - 24, 1.3);
      return;
    }
    // A run over named levels lists them in order.
    const named = namedSlots(def);
    if (named.length > 1) {
      y += 2;
      named.forEach((id, i) => {
        if (y > INFO.y + INFO.h - 52) return;
        const entry = findLevel(this.manifest, id);
        drawListRow(
          ctx,
          { x: INFO.x + 18, y, w: INFO.w - 36, h: 18 },
          i + 1,
          entry?.level.name ?? `Level ${id}`,
          id,
          'normal',
        );
        y += 19;
      });
    }
    drawText(ctx, recordLine(def, rec), cx, INFO.y + INFO.h - 22, legible(INFO_NOTE), {
      maxWidth: INFO.w - 30,
    });
  }

  /** The goal (or the group's description) and an orange note under it; returns the next y. */
  private drawLines(ctx: Ctx, key: string, text: string, note: string, y: number): number {
    const goal = legible(GOAL);
    const lock = legible(LOCK_NOTE);
    const cacheKey = `${key}:${goal.cap}`;
    if (cacheKey !== this.textKey) {
      this.textKey = cacheKey;
      this.goalLines = text === '' ? [] : wrapText(ctx, text, INFO.w - 40, goal);
      this.noteLines = note === '' ? [] : wrapText(ctx, note, INFO.w - 40, lock);
    }
    const pitch = Math.max(14, goal.cap * 1.6);
    const cx = INFO.x + INFO.w / 2;
    let ly = y;
    for (const line of this.goalLines) {
      drawText(ctx, line, cx, ly, goal);
      ly += pitch;
    }
    if (this.noteLines.length > 0 && this.goalLines.length > 0) ly += 4;
    for (const line of this.noteLines) {
      drawText(ctx, line, cx, ly, lock);
      ly += pitch;
    }
    return ly;
  }
}

/** The player's record of a challenge in one line. */
function recordLine(def: ChallengeDef, rec: ChallengeRecord): string {
  if (rec.tries === 0) return 'Not tried yet';
  const parts = [`Tries ${rec.tries}`];
  if (rec.passes > 0) parts.push(`Passed ${rec.passes}`);
  if (def.score !== null && rec.best !== null) parts.push(`Best ${formatNumber(rec.best)}`);
  else if (def.levels.length > 1) parts.push(`Best ${rec.bestLevels} of ${def.levels.length}`);
  return parts.join(' · ');
}

/** Face-down cards, one per random level, in one row or two. */
function drawCards(ctx: Ctx, n: number, pic: Box): void {
  if (n <= 0) return;
  const gap = 8;
  const rows = n > 6 ? 2 : 1;
  const perRow = Math.ceil(n / rows);
  const area = { x: pic.x + 14, y: pic.y + 10, w: pic.w - 28, h: pic.h - BAND_H - 20 };
  const cw = Math.min(48, (area.w - (perRow - 1) * gap) / perRow);
  const ch = Math.min(rows === 1 ? 92 : 56, (area.h - (rows - 1) * gap) / rows);
  const y0 = area.y + (area.h - (rows * ch + (rows - 1) * gap)) / 2;
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / perRow);
    const inRow = Math.min(perRow, n - r * perRow);
    const x0 = area.x + (area.w - (inRow * cw + (inRow - 1) * gap)) / 2;
    const x = x0 + (i - r * perRow) * (cw + gap);
    const y = y0 + r * (ch + gap);
    roundRect(ctx, x, y, cw, ch, 6);
    ctx.fillStyle = linear(ctx, 0, y, 0, y + ch, [
      [0, '#3a5ad8'],
      [1, '#142a8a'],
    ]);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#a9cdf0';
    ctx.stroke();
    drawText(ctx, '?', x + cw / 2, y + ch / 2 + 1, { ...CARD, cap: Math.min(20, ch * 0.4) });
  }
}
