// A challenge's briefing card (spec 14.2, "Decided in the challenges"), opened over the list by a
// click or tap on the challenge: its picture with the goal band, the goal as a sentence, the
// balls, the target if any, the levels of a run and the player's record, with Play and Back. A
// locked challenge's card says exactly which Adventure levels open it and has only Back. Nothing
// about a challenge is shown only on hover.
//
// Also the challenge picture the list's windows share: the first level's thumbnail, face-down
// cards for random levels, the pick's levels behind a question mark, the goal in a band along the
// bottom, and the LOCKED veil.

import { display, legible } from '../app/display';
import type { Input } from '../app/input';
import { CENTER_X, type Box } from '../layout';
import {
  carriesBalls,
  isPick,
  namedSlots,
  randomCount,
  type ChallengeDef,
} from '../../rules/challenges';
import { DEFAULT_BALLS } from '../../rules/tuning';
import { linear, roundRect, type Ctx, type PathFn } from '../render/paint';
import type { ChallengeRecord } from '../progress/save';
import { drawListRow, drawPanel, drawPillButton } from '../ui/controls';
import { rgba } from '../ui/color';
import { drawMedal } from '../ui/medal';
import { dialogDrop } from '../ui/motion';
import { drawText, formatNumber, textStyle, type TextStyle } from '../ui/text';
import { ButtonSet } from './buttons';
import { cardTitle, goalBand, goalSentence, lockSentence, type LevelNamer } from './challenge-copy';
import { drawLock, drawTealWindow, finishTealWindow } from './chrome';
import { dimBehind, wrapText } from './overlay';
import { drawLockedVeil } from './quickplay';
import { levelThumbs } from './thumbs';

// ---------------------------------------------------------------------------------------------
// The picture

/** Height of the goal band along the bottom of a challenge's picture. */
const BAND_H = 28;

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
/** The question mark of a face-down card or the pick. */
const MARK: TextStyle = {
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
/** A level still loading shows its slot. */
const SLOT_ID: TextStyle = {
  ...MARK,
  cap: 16,
  fill: '#6f86c8',
  outline: { color: '#05082a', width: 1.6 },
};

/** The levels a challenge's picture shows: its first named level, or for the pick `preview`. */
export function pictureLevels(def: ChallengeDef, preview: readonly string[]): readonly string[] {
  if (isPick(def)) return preview;
  const first = namedSlots(def)[0];
  return first === undefined ? [] : [first];
}

/**
 * Draws a challenge's picture inside `pic`, clipped to its rounded corners, with the goal band
 * and, when `locked`, the LOCKED veil. Returns the clip path, for the window's finish.
 */
export function drawChallengePicture(
  ctx: Ctx,
  k: number,
  def: ChallengeDef,
  pic: Box,
  preview: readonly string[],
  locked: boolean,
): PathFn {
  const clip: PathFn = (c) => {
    roundRect(c, pic.x, pic.y, pic.w, pic.h, 9);
  };
  ctx.save();
  clip(ctx);
  ctx.clip();
  ctx.fillStyle = linear(ctx, 0, pic.y, 0, pic.y + pic.h, [
    [0, '#16205a'],
    [1, '#0b0f30'],
  ]);
  ctx.fillRect(pic.x, pic.y, pic.w, pic.h);
  const slots = pictureLevels(def, preview);
  if (slots.length === 0) drawCards(ctx, randomCount(def), pic);
  const w = pic.w / Math.max(1, slots.length);
  slots.forEach((slot, i) => {
    const b: Box = { x: Math.round(pic.x + i * w), y: pic.y, w: Math.round(w), h: pic.h };
    ctx.save();
    ctx.beginPath();
    ctx.rect(b.x, b.y, b.w, b.h);
    ctx.clip();
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
    drawText(ctx, '?', pic.x + pic.w / 2, pic.y + (pic.h - BAND_H) / 2, { ...MARK, cap: 44 });
  }
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
  if (locked) drawLockedVeil(ctx, pic);
  ctx.restore();
  return clip;
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
    drawText(ctx, '?', x + cw / 2, y + ch / 2 + 1, { ...MARK, cap: Math.min(20, ch * 0.4) });
  }
}

// ---------------------------------------------------------------------------------------------
// The card

export type CardAction = 'play' | 'back';

export interface CardData {
  readonly def: ChallengeDef;
  /** Adventure levels still to beat before it opens, in campaign order; empty when open. */
  readonly toOpen: readonly string[];
  readonly name: LevelNamer;
  /** The levels the pick's picture shows. */
  readonly preview: readonly string[];
  /** Beaten levels its random levels are drawn from, or the pick chooses from. */
  readonly choices: number;
  readonly record: ChallengeRecord;
}

const PANEL: Box = { x: CENTER_X - 350, y: 82, w: 700, h: 436 };
const PIC: Box = { x: PANEL.x + 36, y: PANEL.y + 70, w: 296, h: 186 };
const COL_X = PANEL.x + 364;
const COL_W = PANEL.x + PANEL.w - 36 - COL_X;
const BUTTON_Y = PANEL.y + PANEL.h - 60;
const PLAY_BOX: Box = { x: PANEL.x + PANEL.w - 36 - 171, y: BUTTON_Y, w: 171, h: 34 };
const BACK_BOX: Box = { x: PANEL.x + 36, y: BUTTON_Y + 3.5, w: 150, h: 27 };
const BACK_ALONE: Box = { x: CENTER_X - 85, y: BUTTON_Y, w: 171, h: 34 };

const GOAL: TextStyle = { ...textStyle.body('#ffffff'), cap: 10.4 };
const NOTE: TextStyle = { ...textStyle.body('#d9ecff'), cap: 8.8 };
const LOCK_NOTE: TextStyle = { ...textStyle.body('#ffc06a'), cap: 9.6 };
const FACT_LABEL: TextStyle = {
  face: 'caps',
  cap: 9,
  fill: '#7fe6ff',
  outline: { color: '#06083a', width: 1.1 },
  anchor: 'middle',
};
const FACT_VALUE: TextStyle = { ...textStyle.rowValue(), cap: 10.5 };
const HEAD: TextStyle = {
  face: 'caps',
  cap: 9,
  fill: '#8dff4a',
  outline: { color: '#06200a', width: 1.2 },
  anchor: 'middle',
};

export class ChallengeCard {
  private readonly buttons: ButtonSet<CardAction>;
  private readonly locked: boolean;
  private cap = 0;
  private goalLines: string[] = [];
  private noteLines: string[] = [];
  private lockLines: string[] = [];

  constructor(
    private readonly data: CardData,
    /** UI time it opened, ms. */
    private readonly t0: number,
  ) {
    this.locked = data.toOpen.length > 0;
    this.buttons = new ButtonSet<CardAction>(
      this.locked
        ? [{ action: 'back', box: BACK_ALONE, enabled: true }]
        : [
            { action: 'play', box: PLAY_BOX, enabled: true },
            { action: 'back', box: BACK_BOX, enabled: true },
          ],
    );
  }

  get def(): ChallengeDef {
    return this.data.def;
  }

  private dy(now: number): number {
    return dialogDrop(now - this.t0, 520);
  }

  /** Reads this frame's input: Play, Back, or null while the card stays. */
  update(input: Input, now: number): CardAction | null {
    for (const code of input.consumeKeys()) {
      if (code === 'Escape') return 'back';
      if ((code === 'Enter' || code === 'Space') && !this.locked) return 'play';
    }
    return this.buttons.handle(input, 0, this.dy(now))[0] ?? null;
  }

  render(ctx: Ctx, k: number, input: Input, now: number): void {
    dimBehind(ctx, now - this.t0);
    const dy = this.dy(now);
    const d = this.data;
    const def = d.def;
    ctx.save();
    ctx.translate(0, dy);
    drawPanel(ctx, PANEL, cardTitle(def, d.name));
    this.wrap(ctx);

    // The picture, in a teal window, with the medal once passed.
    drawTealWindow(ctx, PIC, 10, 7);
    finishTealWindow(ctx, drawChallengePicture(ctx, k, def, PIC, d.preview, this.locked));
    if (d.record.passes > 0) drawMedal(ctx, PIC.x + PIC.w - 22, PIC.y + 20, 13);
    this.drawRecord(ctx, PIC.y + PIC.h + 30);

    // The goal, the facts, and the levels or what opens it.
    const goal = legible(GOAL);
    const pitch = goal.cap * 1.65;
    let y = PANEL.y + 70 + goal.cap;
    for (const line of this.goalLines) {
      drawText(ctx, line, COL_X, y, goal);
      y += pitch;
    }
    y += 14 - pitch + goal.cap;
    for (const [label, value] of this.facts()) {
      y = this.fact(ctx, y, label, value);
    }
    y += 10;
    if (this.locked) this.drawLock(ctx, y);
    else this.drawLevels(ctx, y);

    this.buttons.items.forEach((b, i) => {
      const state = this.buttons.state(i, input, 0, dy);
      if (b.action === 'play') {
        drawPillButton(ctx, b.box, 'orange', state, 'Play', { lugs: true });
      } else {
        drawPillButton(ctx, b.box, this.locked ? 'orange' : 'blue', state, 'Back', {
          lugs: this.locked,
        });
      }
    });
    ctx.restore();
  }

  /** Wraps the sentences once per text size. */
  private wrap(ctx: Ctx): void {
    const goal = legible(GOAL);
    if (goal.cap === this.cap) return;
    this.cap = goal.cap;
    const d = this.data;
    this.goalLines = wrapText(ctx, goalSentence(d.def, d.name), COL_W, goal);
    this.noteLines = wrapText(ctx, this.note(), COL_W, legible(NOTE));
    this.lockLines = wrapText(
      ctx,
      lockSentence(d.def, d.toOpen, d.name),
      COL_W - 34,
      legible(LOCK_NOTE),
    );
  }

  /** Balls and target, label and value. */
  private facts(): [string, string][] {
    const def = this.data.def;
    const n = def.levels.length;
    const out: [string, string][] = [];
    if (def.balls !== null && carriesBalls(def)) out.push(['Balls', `${def.balls} for all ${n}`]);
    else if (def.balls !== null) out.push(['Balls', String(def.balls)]);
    else out.push(['Balls', n > 1 ? `${DEFAULT_BALLS} each level` : String(DEFAULT_BALLS)]);
    if (def.score !== null) {
      out.push(['Target', `Over ${formatNumber(def.score)}${n > 1 ? ' combined' : ''}`]);
    }
    return out;
  }

  /** One fact row: cyan label, yellow value, a thin rule; returns the next row's y. */
  private fact(ctx: Ctx, y: number, label: string, value: string): number {
    const l = legible(FACT_LABEL);
    drawText(ctx, label.toUpperCase(), COL_X, y, l);
    drawText(ctx, value, COL_X + COL_W, y, legible(FACT_VALUE), { maxWidth: COL_W * 0.7 });
    ctx.fillStyle = rgba('#5fd0e6', 0.5);
    ctx.fillRect(COL_X, y + l.cap * 0.9 + 2, COL_W, 1);
    return y + Math.max(22, l.cap * 2.5);
  }

  /** Where the random levels or the pick come from, for an open challenge. */
  private note(): string {
    const d = this.data;
    const random = randomCount(d.def);
    if (random > 0) return `Drawn at random from ${d.choices} levels you've beaten.`;
    if (isPick(d.def)) return `You choose from the ${d.choices} levels you've beaten.`;
    return '';
  }

  /** The levels of a run of named levels, numbered; or the note on random levels or the pick. */
  private drawLevels(ctx: Ctx, y: number): void {
    const d = this.data;
    const named = namedSlots(d.def);
    if (named.length > 1) {
      drawText(ctx, 'LEVELS', COL_X, y + 2, legible(HEAD));
      let ry = y + 12;
      named.forEach((slot, i) => {
        drawListRow(
          ctx,
          { x: COL_X - 14, y: ry, w: COL_W + 14, h: 20 },
          i + 1,
          d.name(slot),
          slot,
          'normal',
        );
        ry += 21;
      });
      return;
    }
    const note = legible(NOTE);
    let ny = y + note.cap;
    for (const line of this.noteLines) {
      drawText(ctx, line, COL_X, ny, note);
      ny += note.cap * 1.6;
    }
  }

  /** What opens a locked challenge, beside a lock. */
  private drawLock(ctx: Ctx, y: number): void {
    const style = legible(LOCK_NOTE);
    drawLock(ctx, COL_X + 12, y + 14, 1.2, '#ffc06a');
    let ly = y + style.cap + 2;
    for (const line of this.lockLines) {
      drawText(ctx, line, COL_X + 34, ly, style);
      ly += style.cap * 1.6;
    }
  }

  /** The player's record under the picture: passed or not, best, tries. */
  private drawRecord(ctx: Ctx, y: number): void {
    const d = this.data;
    const rec = d.record;
    const n = d.def.levels.length;
    const rows: [string, string][] = [
      ['Status', rec.passes > 0 ? 'Passed' : rec.tries > 0 ? 'Not passed yet' : 'Not tried yet'],
    ];
    if (rec.best !== null && (d.def.score !== null || n === 1)) {
      rows.push(['Best', formatNumber(rec.best)]);
    } else if (n > 1 && rec.tries > 0) {
      rows.push(['Best', `${rec.bestLevels} of ${n} levels won`]);
    }
    if (rec.tries > 0) rows.push(['Tries', String(rec.tries)]);
    const l = legible(FACT_LABEL);
    const v = legible(FACT_VALUE);
    let ry = y;
    for (const [label, value] of rows) {
      drawText(ctx, label.toUpperCase(), PIC.x, ry, l);
      drawText(ctx, value, PIC.x + PIC.w, ry, v, { maxWidth: PIC.w * 0.7 });
      ctx.fillStyle = rgba('#5fd0e6', 0.5);
      ctx.fillRect(PIC.x, ry + l.cap * 0.9 + 2, PIC.w, 1);
      ry += Math.max(22, l.cap * 2.5);
    }
  }
}

/** The hint under the list's info panel text. */
export function cardHint(anyOpen: boolean): string {
  const verb = display.coarse ? 'Tap' : 'Click';
  return anyOpen
    ? `${verb} a challenge to see the details and play it.`
    : `${verb} a challenge to see what opens it.`;
}
