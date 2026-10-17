// The stage intro card (visual guide 10.5): a full-screen indigo panel with the stage in the
// title pill, the power's tagline and the master line, the master's portrait in a teal bevel
// beside a dark speech panel whose text types out, the progress rows (a thumbnail per master,
// a square per challenge group: locked, or open with a pip per challenge that turns gold when it
// is passed and the medal once all five are) and the orange Continue pill in a brass housing.

import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { masterPortraits } from '../art/masters';
import { audioBus } from '../audio/bus';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import { STAGE_COUNT } from '../../level/campaign';
import { CHALLENGE_GROUPS, CHALLENGES, challengesOf } from '../../rules/challenges';
import { MASTERS, masterOfStage } from '../../rules/masters';
import type { PowerId } from '../../rules/powers';
import { groupOpen } from '../modes/challenge-run';
import {
  brass,
  circlePath,
  innerBevel,
  linear,
  roundRect,
  type Ctx,
  type PathFn,
} from '../render/paint';
import { isPassed, passedCount, unlockedStage, type Progress } from '../progress/save';
import { drawPanel, drawPillButton, drawRoundButton, type ButtonState } from '../ui/controls';
import { darken, mix } from '../ui/color';
import { drawMedal } from '../ui/medal';
import { drawText, measureText, textStyle, type TextStyle } from '../ui/text';
import { color } from '../ui/tokens';
import { ButtonSet } from './buttons';
import { drawLock } from './chrome';
import { MASTER_COPY, MASTER_LEVELS_COPY, stageName } from './copy';
import { drawMasterPortrait, drawMasterTile } from './faces';
import { wrapText } from './overlay';

const PANEL: Box = { x: 4, y: 4, w: WORLD_W - 8, h: WORLD_H - 8 };
const PORTRAIT = { x: 92, y: 124, size: 190 } as const;
const SPEECH: Box = { x: 298, y: 124, w: 676, h: 190 };
const TILE = 70;
const TILE_GAP = 8;
const SQUARE = 46;
const SQUARE_GAP = 8;
/** Characters typed per second. */
const TYPE_CPS = 48;

const SPEECH_TEXT: TextStyle = { ...textStyle.body('#d9ecff'), cap: 12.4, weight: 600 };
const SPEECH_LINE = 23;

const TAGLINE: TextStyle = {
  cap: 18,
  fill: [
    [0, '#9ff0ff'],
    [1, '#45bbd9'],
  ],
  outline: { color: '#06103a', width: 2 },
  align: 'center',
  anchor: 'middle',
};

const MASTER_LINE: TextStyle = {
  cap: 15,
  fill: [
    [0, '#ffffff'],
    [1, '#d8dcff'],
  ],
  outline: { color: '#06103a', width: 2 },
  align: 'center',
  anchor: 'middle',
};

const ROW_LABEL: TextStyle = {
  cap: 11,
  fill: '#ffffff',
  outline: { color: '#05082a', width: 1.6 },
  align: 'left',
  anchor: 'middle',
};

/** Draws parts of one centered line in their own colors. */
function drawParts(
  ctx: Ctx,
  parts: readonly (readonly [string, string])[],
  cx: number,
  y: number,
  style: TextStyle,
): void {
  const widths = parts.map(([t]) => measureText(ctx, t, style));
  let x = cx - widths.reduce((a, b) => a + b, 0) / 2;
  parts.forEach(([t, fill], i) => {
    drawText(ctx, t, x, y, { ...style, fill, align: 'left' });
    x += widths[i] ?? 0;
  });
}

export interface IntroData {
  readonly stage: number;
  /** The stage's world name from the manifest. */
  readonly world: string;
  /** Levels in the manifest, and how many of them the campaign has cleared. */
  readonly levels: number;
  readonly cleared: number;
  readonly progress: Progress;
  /** Where Continue leads. */
  readonly next: string;
}

export class StageIntroScreen implements Screen {
  private app: AppServices | null = null;
  private t0 = -1;
  private typedAll = false;
  private lines: string[] | null = null;
  private readonly power: PowerId | null;
  private readonly buttons: ButtonSet<'continue' | 'menu'>;

  constructor(private readonly data: IntroData) {
    this.power = data.stage <= 10 ? (masterOfStage(data.stage)?.power ?? null) : null;
    this.buttons = new ButtonSet<'continue' | 'menu'>([
      {
        action: 'continue',
        box: { x: CENTER_X - 85, y: WORLD_H - 62, w: 171, h: 36 },
        enabled: true,
      },
      { action: 'menu', box: { x: 14, y: WORLD_H - 64, w: 46, h: 46 }, round: true, enabled: true },
    ]);
  }

  enter(app: AppServices): void {
    this.app = app;
    for (const m of MASTERS) void masterPortraits.request(m.power, 'neutral');
    audioBus.emit({ type: 'dialogMove' });
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return '#0d0838';
  }

  private speech(): string {
    return this.power === null ? MASTER_LEVELS_COPY.speech : MASTER_COPY[this.power].speech;
  }

  render(f: FrameInfo): void {
    const { ctx, k, timeMs } = f;
    const app = this.app;
    if (app === null) return;
    if (this.t0 < 0) this.t0 = timeMs;
    const input = app.input;
    const text = this.speech();
    const typed = this.typedAll
      ? text.length
      : Math.floor(((timeMs - this.t0 - 350) * TYPE_CPS) / 1000);
    for (const code of input.consumeKeys()) {
      if (code === 'Enter') this.go('continue');
      else if (code === 'Space') {
        if (typed < text.length) this.typedAll = true;
        else this.go('continue');
      } else if (code === 'Escape') this.go('menu');
    }
    for (const { press, e } of input.consumePointer()) {
      const touch = e.kind === 'touch';
      if (press) {
        // A click outside the buttons finishes the typing.
        if (this.buttons.at(e.x, e.y, touch) < 0) this.typedAll = true;
      }
      if (e.crowded) this.buttons.cancel();
      else if (press) this.buttons.press(e.x, e.y, touch);
      else {
        const a = this.buttons.release(e.x, e.y, touch);
        if (a !== null) this.go(a);
      }
    }

    ctx.fillStyle = '#0d0838';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    const d = this.data;
    drawPanel(ctx, PANEL, `${stageName(d.stage)}: ${d.world}`);
    const tagline =
      this.power === null ? MASTER_LEVELS_COPY.tagline : MASTER_COPY[this.power].tagline;
    drawText(ctx, tagline.toUpperCase(), CENTER_X, 78, TAGLINE, { maxWidth: WORLD_W - 120 });
    const masterLine =
      this.power === null
        ? 'Master: your choice'
        : `Master: ${masterOfStage(d.stage)?.animal ?? ''}`;
    drawText(ctx, masterLine.toUpperCase(), CENTER_X, 104, MASTER_LINE);

    drawMasterPortrait(ctx, k, this.power, PORTRAIT.x, PORTRAIT.y, PORTRAIT.size);
    this.drawSpeech(ctx, Math.max(0, Math.min(text.length, typed)));
    this.drawProgress(ctx, k);

    // Brass housing under the Continue pill.
    const cont = this.buttons.items[0];
    if (cont !== undefined) {
      const hb = cont.box;
      const housing: PathFn = (c) => {
        roundRect(c, hb.x - 30, hb.y - 10, hb.w + 60, hb.h + 30, 18);
      };
      brass(ctx, housing, hb.y - 10, hb.y + hb.h + 20, 2.4);
      drawPillButton(ctx, hb, 'orange', this.buttons.state(0, input), 'Continue', { lugs: true });
    }
    const menu = this.buttons.items[1];
    if (menu !== undefined) {
      const mb = menu.box;
      drawRoundMenu(ctx, mb, this.buttons.state(1, input));
    }
  }

  private go(action: 'continue' | 'menu'): void {
    audioBus.emit({ type: 'uiClick' });
    this.app?.navigate(action === 'continue' ? this.data.next : '#/');
  }

  private drawSpeech(ctx: Ctx, chars: number): void {
    const b = SPEECH;
    const path: PathFn = (c) => {
      roundRect(c, b.x, b.y, b.w, b.h, 12);
    };
    path(ctx);
    ctx.fillStyle = linear(ctx, 0, b.y, 0, b.y + b.h, [
      [0, '#150a52'],
      [1, '#0d0638'],
    ]);
    ctx.fill();
    innerBevel(ctx, path, {
      light: '#000000',
      dark: color.panelBevel,
      width: 2.5,
      lightAlpha: 0.6,
      darkAlpha: 0.5,
    });
    path(ctx);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color.tealLipDark;
    ctx.stroke();
    this.lines ??= wrapText(ctx, this.speech(), b.w - 48, SPEECH_TEXT);
    let left = chars;
    let y = b.y + 40;
    for (const line of this.lines) {
      if (left <= 0) break;
      const shown = line.slice(0, left);
      drawText(ctx, shown, b.x + 24, y, SPEECH_TEXT);
      // One character per space the wrap dropped, so typing keeps pace with the text.
      left -= line.length + 1;
      y += SPEECH_LINE;
    }
  }

  private drawProgress(ctx: Ctx, k: number): void {
    const d = this.data;
    const reached = unlockedStage(d.progress);
    drawParts(
      ctx,
      [
        ['ADVENTURE: ', '#ffffff'],
        [`${d.cleared} OF ${d.levels}`, '#8dff4a'],
        [' COMPLETE', '#ffffff'],
      ],
      CENTER_X,
      344,
      ROW_LABEL,
    );
    const rowW = STAGE_COUNT * TILE + (STAGE_COUNT - 1) * TILE_GAP;
    const x0 = CENTER_X - rowW / 2;
    const y = 358;
    this.drawWell(ctx, { x: x0 - 10, y: y - 8, w: rowW + 20, h: TILE + 16 });
    for (let s = 1; s <= STAGE_COUNT; s++) {
      const power = s <= 10 ? (masterOfStage(s)?.power ?? null) : null;
      const state = s === d.stage ? 'current' : s <= reached ? 'normal' : 'locked';
      drawMasterTile(ctx, k, power, x0 + (s - 1) * (TILE + TILE_GAP), y, TILE, state);
    }
    const p = d.progress;
    const anyOpen = CHALLENGE_GROUPS.some((_, g) => groupOpen(p, g));
    drawParts(
      ctx,
      anyOpen
        ? [
            ['CHALLENGES: ', '#ffffff'],
            [`${passedCount(p)} OF ${CHALLENGES.length}`, '#8dff4a'],
            [' PASSED', '#ffffff'],
          ]
        : [
            ['CHALLENGES: ', '#ffffff'],
            ['LOCKED UNTIL STAGE 3 IS COMPLETE', '#ffb340'],
          ],
      CENTER_X,
      450,
      ROW_LABEL,
    );
    const n = CHALLENGE_GROUPS.length;
    const sqW = n * SQUARE + (n - 1) * SQUARE_GAP;
    const sx0 = CENTER_X - sqW / 2;
    const sy = 464;
    this.drawWell(ctx, { x: sx0 - 10, y: sy - 7, w: sqW + 20, h: SQUARE + 14 });
    CHALLENGE_GROUPS.forEach((group, g) => {
      const x = sx0 + g * (SQUARE + SQUARE_GAP);
      if (group.duel || !groupOpen(p, g)) drawLockedSquare(ctx, x, sy, SQUARE, g);
      else {
        const passed = challengesOf(group.id).map((c) => isPassed(p, c.id));
        drawOpenSquare(ctx, x, sy, SQUARE, g, passed);
      }
    });
  }

  private drawWell(ctx: Ctx, b: Box): void {
    const path: PathFn = (c) => {
      roundRect(c, b.x, b.y, b.w, b.h, 10);
    };
    path(ctx);
    ctx.fillStyle = 'rgba(8, 4, 40, 0.65)';
    ctx.fill();
    innerBevel(ctx, path, {
      light: '#000000',
      dark: color.panelBevel,
      width: 2,
      lightAlpha: 0.5,
      darkAlpha: 0.45,
    });
  }
}

/** Hues of the challenge squares along the row, after the original's group colors (10.5). */
const SQUARE_HUES = ['#2a4fb8', '#1f8a9a', '#5a8a1c', '#a89a18', '#b8641a', '#a8282a', '#9a2a8a'];

function squareHue(group: number): string {
  const n = CHALLENGE_GROUPS.length;
  const i = Math.min(SQUARE_HUES.length - 1, Math.floor((group * SQUARE_HUES.length) / n));
  return SQUARE_HUES[i] ?? '#2a4fb8';
}

/** The teal frame every challenge square sits in. */
function squareFrame(ctx: Ctx, x: number, y: number, s: number): void {
  roundRect(ctx, x, y, s, s, 8);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + s, [
    [0, '#8fc4cc'],
    [1, color.tealDeep],
  ]);
  ctx.fill();
}

/**
 * An open group's square: its hue lit, a pip per challenge along the bottom (gold once passed),
 * and the medal when all five are passed.
 */
function drawOpenSquare(
  ctx: Ctx,
  x: number,
  y: number,
  s: number,
  group: number,
  passed: readonly boolean[],
): void {
  const hue = squareHue(group);
  squareFrame(ctx, x, y, s);
  roundRect(ctx, x + 4, y + 4, s - 8, s - 8, 5);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + s, [
    [0, mix(hue, '#ffffff', 0.35)],
    [0.55, hue],
    [1, darken(hue, 0.35)],
  ]);
  ctx.fill();
  // Gloss on the upper half.
  roundRect(ctx, x + 7, y + 6, s - 14, s * 0.32, 4);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.22)';
  ctx.fill();
  const all = passed.length > 0 && passed.every((p) => p);
  if (all) drawMedal(ctx, x + s / 2, y + s / 2 - 5, 9, false);
  else {
    drawText(ctx, String(group + 1), x + s / 2, y + s / 2 - 4, {
      cap: 13,
      fill: '#ffffff',
      outline: { color: darken(hue, 0.6), width: 1.6 },
      align: 'center',
      anchor: 'middle',
    });
  }
  const pip = 3.3;
  const gap = 1.9;
  const rowW = passed.length * pip * 2 + (passed.length - 1) * gap;
  const px = x + s / 2 - rowW / 2 + pip;
  passed.forEach((done, i) => {
    circlePath(ctx, px + i * (2 * pip + gap), y + s - 10, pip);
    ctx.fillStyle = done ? '#ffd23a' : 'rgba(6, 8, 30, 0.6)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = done ? '#6e4210' : 'rgba(255, 255, 255, 0.35)';
    ctx.stroke();
  });
}

/** A group that is not open (or not in the game): its hue dimmed, with a lock. */
function drawLockedSquare(ctx: Ctx, x: number, y: number, s: number, group: number): void {
  const base = mix(squareHue(group), '#1a1840', 0.55);
  squareFrame(ctx, x, y, s);
  roundRect(ctx, x + 4, y + 4, s - 8, s - 8, 5);
  ctx.fillStyle = linear(ctx, 0, y, 0, y + s, [
    [0, base],
    [1, darken(base, 0.45)],
  ]);
  ctx.fill();
  drawLock(ctx, x + s / 2, y + s / 2 + 1, 1.05, '#aab4c8');
}

/** The round purple main menu button in the bottom left corner (10.4). */
export function drawRoundMenu(ctx: Ctx, b: Box, state: ButtonState): void {
  drawRoundButton(ctx, b.x + b.w / 2, b.y + b.h / 2, b.w / 2, 'purple', state, 'Menu');
}
