// The challenge list (visual guide 10.4, the level select's layout, used for the challenge lists):
// one page per challenge group with something to show, its challenges in thumbnail windows titled
// by their level in lime, the goal in a band on the picture, the bottom middle cell an info panel
// with the group. Only challenges whose levels are in the game show; duels never do. A passed
// challenge carries Teggle's medal; one the player has not opened yet (its levels not beaten in
// the Adventure) is stamped LOCKED. The paging arrows under the info panel go from group to group.
//
// A click or tap on a challenge opens its briefing card (challenge-card.ts): the goal, the
// record, and Play, or for a locked one what opens it.

import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { audioBus } from '../audio/bus';
import { legible } from '../app/display';
import { WORLD_H, WORLD_W, type Box } from '../layout';
import type { CampaignManifest } from '../../level/campaign';
import {
  CHALLENGES_PER_GROUP,
  challengeById,
  drawPool,
  isPick,
  namedSlots,
} from '../../rules/challenges';
import { drawLayer, layers } from '../render/cache';
import type { Ctx } from '../render/paint';
import { challengeRecord, isPassed, type Progress } from '../progress/save';
import { progressStore } from '../progress/store';
import { drawArrowButton, drawPanel, type ButtonState } from '../ui/controls';
import { drawMedal } from '../ui/medal';
import { drawText, textStyle, type TextStyle } from '../ui/text';
import {
  beatenSlots,
  builtSlots,
  levelNamer,
  shownGroups,
  type ChallengeStatus,
  type GroupStatus,
} from '../modes/challenge-run';
import { findLevel, manifestLevels } from '../modes/manifest';
import { ButtonSet, type UiButton } from './buttons';
import { cardHint, ChallengeCard, drawChallengePicture, pictureLevels } from './challenge-card';
import { cardTitle, groupName, groupText, type LevelNamer } from './challenge-copy';
import { drawTealWindow, drawTitlePill, finishTealWindow, STEEL } from './chrome';
import { drawRoundMenu } from './intro';
import { wrapText } from './overlay';
import {
  cellBox,
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

const GROUP_TEXT: TextStyle = { ...textStyle.body('#ffffff'), cap: 9.4, align: 'center' };
/** Levels a pick challenge's picture shows. */
const PICK_PREVIEW = 5;

type Action = { kind: 'cell'; slot: number } | { kind: 'page'; dir: -1 | 1 } | { kind: 'menu' };

export class ChallengeListScreen implements Screen {
  private app: AppServices | null = null;
  private page: number;
  private readonly buttons: ButtonSet<Action>;
  private readonly built: ReadonlySet<string>;
  private readonly name: LevelNamer;
  private readonly preview: readonly string[];
  private card: ChallengeCard | null = null;
  /** A challenge whose card opens with the screen. */
  private openId: string | null;
  private groups: GroupStatus[] = [];
  private groupsFor: Progress | null = null;
  private textKey = '';
  private textLines: string[] = [];
  private hintKey = '';
  private hintLines: string[] = [];

  /**
   * Opens on the page of `group` (a group id), else of the challenge `open` (whose card opens
   * too), else on the first group with an open challenge left to pass.
   */
  constructor(
    private readonly manifest: CampaignManifest,
    group: string | null,
    open: string | null = null,
  ) {
    this.built = builtSlots(manifest);
    this.name = levelNamer(manifest);
    this.preview = manifestLevels(manifest)
      .slice(0, PICK_PREVIEW)
      .map((l) => l.level.id);
    const groups = this.shown(progressStore().progress);
    const def = open === null ? null : challengeById(open);
    const asked = groups.findIndex((g) => g.group.id === (group ?? def?.group));
    this.page = asked >= 0 ? asked : this.firstUnfinished(groups);
    this.openId = def !== null && this.status(def.id) !== null ? def.id : null;
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

  /** The groups shown for `p`, worked out again only when the save changes. */
  private shown(p: Progress): GroupStatus[] {
    if (p !== this.groupsFor) {
      this.groupsFor = p;
      this.groups = shownGroups(p, this.built);
    }
    return this.groups;
  }

  private firstUnfinished(groups: readonly GroupStatus[]): number {
    const p = progressStore().progress;
    const i = groups.findIndex((g) =>
      g.challenges.some((s) => s.playable && !isPassed(p, s.def.id)),
    );
    return Math.max(0, i);
  }

  private current(): GroupStatus | null {
    return this.groups[this.page] ?? this.groups[0] ?? null;
  }

  private status(id: string): ChallengeStatus | null {
    for (const g of this.groups) for (const s of g.challenges) if (s.def.id === id) return s;
    return null;
  }

  enter(app: AppServices): void {
    this.app = app;
    this.requestThumbs();
    if (this.openId !== null) {
      const s = this.status(this.openId);
      if (s !== null) this.openCard(s, 0);
      this.openId = null;
    }
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return STEEL.deep;
  }

  private requestThumbs(): void {
    for (const s of this.current()?.challenges ?? []) {
      for (const slot of pictureLevels(s.def, this.preview)) {
        const entry = findLevel(this.manifest, slot);
        if (entry !== null) levelThumbs.request(entry);
      }
    }
  }

  private setPage(page: number): void {
    const n = this.groups.length;
    if (n === 0) return;
    const next = ((page % n) + n) % n;
    if (next === this.page) return;
    this.page = next;
    this.requestThumbs();
  }

  private openCard(s: ChallengeStatus, now: number): void {
    const p = progressStore().progress;
    const beaten = beatenSlots(p, this.built);
    const named = new Set(namedSlots(s.def));
    const choices = isPick(s.def)
      ? beaten.size
      : drawPool(this.built, beaten).filter((id) => !named.has(id)).length;
    this.card = new ChallengeCard(
      {
        def: s.def,
        toOpen: s.toOpen,
        name: this.name,
        preview: this.preview,
        choices,
        record: challengeRecord(p, s.def.id),
      },
      now,
    );
    audioBus.emit({ type: 'dialogMove' });
  }

  private act(a: Action, now: number): void {
    const app = this.app;
    if (app === null) return;
    audioBus.emit({ type: 'uiClick' });
    switch (a.kind) {
      case 'cell': {
        const s = this.current()?.challenges[a.slot];
        if (s !== undefined) this.openCard(s, now);
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
    const { ctx, k, timeMs } = f;
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    const p = progressStore().progress;
    this.shown(p);
    const group = this.current();
    const list = group?.challenges ?? [];
    for (const b of this.buttons.items) {
      if (b.action.kind === 'cell') b.enabled = list[b.action.slot] !== undefined;
      else if (b.action.kind === 'page') b.enabled = this.groups.length > 1;
    }
    const card = this.card;
    if (card !== null) {
      const action = card.update(input, timeMs);
      if (action !== null) {
        audioBus.emit({ type: 'uiClick' });
        this.card = null;
        if (action === 'play') {
          app.navigate(`#/challenges/${card.def.id}`);
          return;
        }
      }
    } else {
      for (const code of input.consumeKeys()) {
        if (code === 'ArrowLeft') this.setPage(this.page - 1);
        else if (code === 'ArrowRight') this.setPage(this.page + 1);
        else if (code === 'Escape') this.act({ kind: 'menu' }, timeMs);
      }
      for (const a of this.buttons.handle(input)) this.act(a, timeMs);
    }

    drawLayer(ctx, layers.get('quickplay:plate', k, 0, 0, WORLD_W, WORLD_H, paintBackground));
    drawTitlePill(
      ctx,
      TITLE_PILL,
      group === null ? 'Challenges' : `Challenges: ${groupName(group.group)}`,
    );
    const live = this.card === null;
    this.buttons.items.forEach((b, i) => {
      const state = live ? this.buttons.state(i, input) : 'normal';
      const a = b.action;
      if (a.kind === 'cell') this.drawCell(ctx, k, b.box, list[a.slot], p, state);
      else if (a.kind === 'page') drawArrowButton(ctx, b.box, a.dir < 0 ? 'left' : 'right', state);
      else drawRoundMenu(ctx, b.box, state);
    });
    this.drawInfo(ctx, group, p);
    this.card?.render(ctx, k, input, timeMs);
  }

  private drawCell(
    ctx: Ctx,
    k: number,
    cell: Box,
    s: ChallengeStatus | undefined,
    p: Progress,
    state: ButtonState,
  ): void {
    const inner = drawTealWindow(ctx, cell, 16, 8);
    if (s === undefined) {
      finishTealWindow(ctx, inner);
      return;
    }
    const def = s.def;
    drawText(ctx, cardTitle(def, this.name), cell.x + cell.w / 2, cell.y + 18, TITLE, {
      maxWidth: cell.w - 30,
    });
    const pic = pictureBox(cell);
    finishTealWindow(ctx, drawChallengePicture(ctx, k, def, pic, this.preview, !s.playable));
    if (isPassed(p, def.id)) drawMedal(ctx, pic.x + pic.w - 22, pic.y + 20, 13);
    if (state === 'hover' || state === 'down') drawSelectRing(ctx, cell);
  }

  /** The info panel: the group, how many are passed, its text, and what a click does. */
  private drawInfo(ctx: Ctx, group: GroupStatus | null, p: Progress): void {
    drawPanel(ctx, INFO);
    const cx = INFO.x + INFO.w / 2;
    if (group === null) {
      this.drawSentences(ctx, 'No challenges are in the game yet.', INFO.y, INFO.y + INFO.h);
      return;
    }
    const list = group.challenges;
    drawText(ctx, groupName(group.group).toUpperCase(), cx, INFO.y + 32, INFO_NAME, {
      maxWidth: INFO.w - 40,
    });
    const passed = list.filter((s) => isPassed(p, s.def.id)).length;
    const open = list.filter((s) => s.playable).length;
    const head =
      `Group ${this.page + 1} of ${this.groups.length} · ` +
      (open < list.length ? `${open} of ${list.length} open · ` : '') +
      `${passed} of ${list.length} passed`;
    drawText(ctx, head.toUpperCase(), cx, INFO.y + 52, legible(INFO_SUB), {
      maxWidth: INFO.w - 30,
    });
    const style = legible(INFO_NOTE);
    const hint = cardHint(open > 0);
    const hintKey = `${hint}:${style.cap}`;
    if (hintKey !== this.hintKey) {
      this.hintKey = hintKey;
      this.hintLines = wrapText(ctx, hint, INFO.w - 40, style);
    }
    const pitch = style.cap * 1.7;
    const hintTop = INFO.y + INFO.h - 22 - (this.hintLines.length - 1) * pitch;
    // The group's text sits in the middle of the room between the heading and the hint.
    this.drawSentences(ctx, groupText(group.group), INFO.y + 64, hintTop - style.cap - 6);
    let hy = hintTop;
    for (const line of this.hintLines) {
      drawText(ctx, line, cx, hy, style);
      hy += pitch;
    }
  }

  /** Wrapped centered sentences, centered between `top` and `bottom`. */
  private drawSentences(ctx: Ctx, text: string, top: number, bottom: number): void {
    const style = legible(GROUP_TEXT);
    const cacheKey = `${text}:${style.cap}`;
    if (cacheKey !== this.textKey) {
      this.textKey = cacheKey;
      this.textLines = wrapText(ctx, text, INFO.w - 44, style);
    }
    const pitch = Math.max(14, style.cap * 1.65);
    const h = style.cap + (this.textLines.length - 1) * pitch;
    let ly = Math.max(top + style.cap, (top + bottom - h) / 2 + style.cap);
    for (const line of this.textLines) {
      drawText(ctx, line, INFO.x + INFO.w / 2, ly, style);
      ly += pitch;
    }
  }
}
