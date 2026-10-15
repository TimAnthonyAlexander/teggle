// The main menu (visual guide 10.3): a frame of steel-blue enamel pipes and brass joints, a
// scene window over most of the screen, a right column of large gel slabs for the modes and a
// bottom rail of pill buttons.
//
// The original fills the scene window with a painted picture and a mascot. Teggle has no menu
// picture yet, so the window shows a quiet lit field with the wordmark, the current stage's
// master (real portrait art) saying where the campaign stands, and the next campaign level's
// board. MENU_SCENE takes a picture later: set it to an asset id under public/art/menu/ and the
// picture replaces the lit field; nothing else changes.

import { legible } from '../app/display';
import type { Input } from '../app/input';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { masterPortraits, type PortraitImage } from '../art/masters';
import { CROP_FULL, drawPortraitImage } from '../art/portrait';
import { audioBus } from '../audio/bus';
import { WORLD_H, WORLD_W, type Box } from '../layout';
import { masterOfStage } from '../../rules/masters';
import type { PowerId } from '../../rules/powers';
import type { CampaignManifest } from '../../level/campaign';
import { drawLayer, layers } from '../render/cache';
import { linear, radial, roundRect, type Ctx, type PathFn } from '../render/paint';
import {
  campaignCleared,
  campaignFinished,
  challengeState,
  stageOfNumber,
  unlockedMasters,
  unlockedStage,
  type Progress,
} from '../progress/save';
import { progressStore } from '../progress/store';
import { drawWordmark } from '../screens/title';
import { drawGelSlab, drawPillButton } from '../ui/controls';
import { rgba } from '../ui/color';
import { drawText, type TextStyle } from '../ui/text';
import { ButtonSet } from './buttons';
import {
  STEEL,
  bubbleHeight,
  bubbleText,
  brassJoint,
  brassRail,
  drawSpeechBubble,
  drawTealWindow,
  finishTealWindow,
  paintPlate,
  steelPipe,
} from './chrome';
import { stageName } from './copy';
import { HelpDialog } from './help';
import { findByNumber, loadManifest, type ManifestLevel } from '../modes/manifest';
import { OptionsDialog } from './options';
import { wrapText, type MenuOverlay } from './overlay';
import { levelThumbs } from './thumbs';

/** Asset id of a painted menu scene under public/art/menu/, once one exists. */
const MENU_SCENE: string | null = null;

const SCENE: Box = { x: 18, y: 18, w: 790, h: 494 };
const SCENE_R = 30;
const SLAB_W = 196;
const SLAB_H = 146;
const SLAB_X = WORLD_W - 22 - SLAB_W;
const SLAB_Y = [30, 222, 414] as const;
const RAIL: Box = { x: 40, y: 534, w: 750, h: 46 };
const FIGURE = 330;
/** The speech bubble: its left, width and bottom edge; it grows upward with the text. */
const BUBBLE = { x: 304, w: 450, bottom: 300 } as const;
/** Where the bubble's tail points: beside the master's face. */
const TAIL = { x: 262, y: 346 } as const;
const NEXT_BOX: Box = { x: 530, y: 350, w: 236, h: 142 };

type Action = 'adventure' | 'quickplay' | 'challenges' | 'options' | 'help' | 'next';

const NEXT_LABEL: TextStyle = {
  cap: 10,
  fill: [
    [0, '#e9ff9a'],
    [1, '#9fe02a'],
  ],
  outline: { color: '#0b2a05', width: 1.6 },
  align: 'center',
  anchor: 'middle',
};

const scenePath: PathFn = (c) => {
  roundRect(c, SCENE.x, SCENE.y, SCENE.w, SCENE.h, SCENE_R);
};

function paintChrome(ctx: Ctx): void {
  paintPlate(ctx, { x: 0, y: 0, w: WORLD_W, h: WORLD_H }, { box: SCENE, r: SCENE_R });
  // The pipe around the scene window, and the column's spine behind the slabs.
  steelPipe(
    ctx,
    (c) => {
      roundRect(c, SCENE.x - 4, SCENE.y - 4, SCENE.w + 8, SCENE.h + 8, SCENE_R + 4);
    },
    8,
  );
  const spineX = SLAB_X + SLAB_W / 2;
  steelPipe(
    ctx,
    (c) => {
      c.beginPath();
      c.moveTo(spineX, 8);
      c.lineTo(spineX, WORLD_H - 8);
    },
    14,
  );
  // A pipe from the scene's right edge into the column, at each joint.
  for (const y of [SLAB_Y[1] - 23, SLAB_Y[2] - 23]) {
    steelPipe(
      ctx,
      (c) => {
        c.beginPath();
        c.moveTo(SCENE.x + SCENE.w + 4, y);
        c.lineTo(spineX, y);
      },
      9,
    );
  }
  brassJoint(ctx, SCENE.x + 2, SCENE.y + 2, 10);
  brassJoint(ctx, SCENE.x + SCENE.w - 2, SCENE.y + 2, 10);
  brassJoint(ctx, SCENE.x + 2, SCENE.y + SCENE.h - 2, 10);
  brassJoint(ctx, SCENE.x + SCENE.w - 2, SCENE.y + SCENE.h - 2, 10);
  brassRail(ctx, RAIL);
}

function paintField(ctx: Ctx): void {
  // A quiet lit field: deep blue with soft light from the upper middle, darker toward the floor.
  ctx.fillStyle = linear(ctx, 0, SCENE.y, 0, SCENE.y + SCENE.h, [
    [0, '#20307a'],
    [0.55, '#1a2260'],
    [1, '#120f3a'],
  ]);
  ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  const cx = SCENE.x + SCENE.w * 0.5;
  ctx.fillStyle = radial(ctx, cx, 120, 20, cx, 160, 460, [
    [0, 'rgba(120, 160, 255, 0.4)'],
    [0.5, 'rgba(90, 110, 220, 0.14)'],
    [1, 'rgba(60, 70, 180, 0)'],
  ]);
  ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
  ctx.fillStyle = radial(ctx, 190, 470, 10, 190, 470, 260, [
    [0, 'rgba(140, 180, 255, 0.22)'],
    [1, 'rgba(140, 180, 255, 0)'],
  ]);
  ctx.fillRect(SCENE.x, SCENE.y, SCENE.w, SCENE.h);
}

/** The menu's master: the current stage's, else the latest met who has art, else the Unicorn. */
function menuMasters(p: Progress): PowerId[] {
  const stage = unlockedStage(p);
  const own = masterOfStage(stage)?.power;
  const met = unlockedMasters(p).reverse();
  const list = own === undefined ? met : [own, ...met];
  return [...new Set([...list, 'guide' as const])];
}

export class MainMenuScreen implements Screen {
  private app: AppServices | null = null;
  private manifest: CampaignManifest | null = null;
  private manifestFailed = false;
  private overlay: MenuOverlay | null = null;
  private scene: HTMLImageElement | null = null;
  private notice = '';
  private noticeUntil = 0;
  private bubbleText = '';
  private bubbleCap = 0;
  private bubbleLines: string[] = [];
  private readonly buttons: ButtonSet<Action>;

  constructor() {
    const slab = (i: 0 | 1 | 2): Box => ({ x: SLAB_X, y: SLAB_Y[i], w: SLAB_W, h: SLAB_H });
    const pillW = 172;
    const pillY = RAIL.y + 5;
    this.buttons = new ButtonSet<Action>([
      { action: 'adventure', box: slab(0), enabled: true },
      { action: 'quickplay', box: slab(1), enabled: true },
      { action: 'challenges', box: slab(2), enabled: true },
      {
        action: 'options',
        box: { x: RAIL.x + RAIL.w / 3 - pillW / 2, y: pillY, w: pillW, h: 36 },
        enabled: true,
      },
      {
        action: 'help',
        box: { x: RAIL.x + (2 * RAIL.w) / 3 - pillW / 2, y: pillY, w: pillW, h: 36 },
        enabled: true,
      },
      { action: 'next', box: NEXT_BOX, enabled: false },
    ]);
  }

  enter(app: AppServices): void {
    this.app = app;
    for (const power of menuMasters(progressStore().progress)) {
      void masterPortraits.request(power, 'neutral');
    }
    loadManifest().then(
      (m) => {
        this.manifest = m;
        const next = this.nextLevel();
        if (next !== null) levelThumbs.request(next);
      },
      () => {
        this.manifestFailed = true;
      },
    );
    if (MENU_SCENE !== null) {
      const img = new Image();
      img.decoding = 'async';
      img.src = `${import.meta.env.BASE_URL}art/menu/${MENU_SCENE}.webp`;
      img.decode().then(
        () => {
          this.scene = img;
        },
        () => undefined,
      );
    }
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return STEEL.deep;
  }

  /** The campaign level the Adventure continues with, if it is in the manifest. */
  private nextLevel(): ManifestLevel | null {
    const p = progressStore().progress;
    if (this.manifest === null || campaignFinished(p)) return null;
    return findByNumber(this.manifest, p.campaign.next);
  }

  private act(action: Action, now: number): void {
    const app = this.app;
    if (app === null) return;
    audioBus.emit({ type: 'uiClick' });
    switch (action) {
      case 'adventure':
      case 'next':
        app.navigate('#/adventure');
        break;
      case 'quickplay':
        app.navigate('#/quickplay');
        break;
      case 'challenges':
        this.notice = this.challengeText();
        this.noticeUntil = now + 5000;
        break;
      case 'options':
        this.overlay = new OptionsDialog(now);
        break;
      case 'help':
        this.overlay = new HelpDialog(now);
        break;
    }
  }

  private challengeText(): string {
    const state = challengeState(progressStore().progress);
    return state === 'locked'
      ? 'Challenges open up once you finish Stage Three.'
      : 'The challenges are not in the game yet. They are coming in a later version.';
  }

  private challengeSub(): string {
    return challengeState(progressStore().progress) === 'locked'
      ? 'Locked: finish stage 3'
      : 'Not in the game yet';
  }

  /**
   * What the master says: a notice, the item under the mouse (on a touch screen: under the
   * finger while it is held down, so nothing stays behind after the finger lifts), or where the
   * campaign stands.
   */
  private speech(input: Input, now: number): string {
    if (now < this.noticeUntil) return this.notice;
    const p = progressStore().progress;
    const pointer = input.pointer;
    const touch = pointer.kind === 'touch';
    const i = this.buttons.any(pointer.x, pointer.y, touch);
    const hovered =
      pointer.inside && (!touch || pointer.down) ? this.buttons.items[i]?.action : null;
    switch (hovered) {
      case 'adventure':
        return 'Play the stages in order and meet a new master in each one.';
      case 'quickplay':
        return campaignCleared(p) === 0
          ? 'Clear a level in the Adventure first, then replay it here.'
          : 'Replay any level you have cleared, with any master you have met.';
      case 'challenges':
        return this.challengeText();
      case 'options':
        return 'Music, sound effects, mute and full screen.';
      case 'help':
        return 'The rules on one page.';
      default:
        break;
    }
    if (campaignFinished(p)) {
      return 'You finished the Adventure! Quick Play has every level, and every master is ready.';
    }
    if (this.manifestFailed) return 'The campaign could not be loaded. Try reloading the page.';
    if (p.campaign.next === 1) {
      return 'Welcome to Teggle! Clear every orange peg on a board to move on. Press Adventure to begin.';
    }
    const next = this.nextLevel();
    if (this.manifest !== null && next === null) {
      return 'You have cleared every level there is so far. Quick Play replays them with any master you have met.';
    }
    const stage = stageOfNumber(p.campaign.next);
    const name = next?.level.name ?? '';
    return name === ''
      ? `${stageName(stage)} is next.`
      : `${stageName(stage)}: ${next?.stage.world ?? ''}. Next up is ${name}.`;
  }

  render(f: FrameInfo): void {
    const { ctx, k, timeMs } = f;
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    const next = this.nextLevel();
    const nextButton = this.buttons.find('next');
    if (nextButton !== undefined) nextButton.enabled = next !== null;
    if (this.overlay !== null) {
      if (!this.overlay.update(input, timeMs)) this.overlay = null;
    } else {
      for (const a of this.buttons.handle(input)) this.act(a, timeMs);
      input.consumeKeys();
    }

    // Scene window.
    ctx.save();
    scenePath(ctx);
    ctx.clip();
    if (this.scene !== null) ctx.drawImage(this.scene, SCENE.x, SCENE.y, SCENE.w, SCENE.h);
    else
      drawLayer(ctx, layers.get('menu:field', k, SCENE.x, SCENE.y, SCENE.w, SCENE.h, paintField));
    drawWordmark(ctx, SCENE.x + SCENE.w / 2, 92, 82);
    const figure = this.figure();
    if (figure !== null) {
      drawPortraitImage(ctx, k, figure, 28, SCENE.y + SCENE.h - FIGURE + 6, FIGURE, CROP_FULL);
    }
    if (next !== null) this.drawNext(ctx, k, input, next);
    ctx.restore();

    drawLayer(ctx, layers.get('menu:chrome', k, 0, 0, WORLD_W, WORLD_H, paintChrome));
    this.drawBubble(ctx, input, timeMs, figure !== null);

    const live = this.overlay === null;
    this.buttons.items.forEach((b, i) => {
      const state = live ? this.buttons.state(i, input) : 'normal';
      switch (b.action) {
        case 'adventure':
          drawGelSlab(ctx, b.box, state, 'Adventure', { cap: 22 });
          break;
        case 'quickplay':
          drawGelSlab(ctx, b.box, state, 'Quick Play', { cap: 22 });
          break;
        case 'challenges':
          drawGelSlab(ctx, b.box, 'disabled', 'Challenges', { cap: 22, sub: this.challengeSub() });
          break;
        case 'options':
          drawPillButton(ctx, b.box, 'brown', state, 'Options');
          break;
        case 'help':
          drawPillButton(ctx, b.box, 'brown', state, 'How to Play');
          break;
        case 'next':
          break;
      }
    });
    for (const y of [SLAB_Y[1] - 23, SLAB_Y[2] - 23]) brassJoint(ctx, SLAB_X + SLAB_W / 2, y, 11);
    this.overlay?.render(ctx, k, input, timeMs);
  }

  private figure(): PortraitImage | null {
    for (const power of menuMasters(progressStore().progress)) {
      const img = masterPortraits.get(power, 'neutral');
      if (img !== null) return img;
      if (masterPortraits.status(power, 'neutral') !== 'missing') return null;
    }
    return null;
  }

  private drawBubble(ctx: Ctx, input: Input, now: number, speaker: boolean): void {
    const text = this.speech(input, now);
    const style = bubbleText();
    if (text !== this.bubbleText || style.cap !== this.bubbleCap) {
      this.bubbleText = text;
      this.bubbleCap = style.cap;
      this.bubbleLines = wrapText(ctx, text, BUBBLE.w - 60, style);
    }
    const h = bubbleHeight(this.bubbleLines.length);
    const box: Box = { x: BUBBLE.x, y: BUBBLE.bottom - h, w: BUBBLE.w, h };
    drawSpeechBubble(ctx, box, speaker ? TAIL : null, this.bubbleLines);
  }

  private drawNext(ctx: Ctx, k: number, input: Input, next: ManifestLevel): void {
    const b = NEXT_BOX;
    const i = this.buttons.items.findIndex((x) => x.action === 'next');
    const state = this.overlay === null ? this.buttons.state(i, input) : 'normal';
    drawText(
      ctx,
      `Up next: ${next.level.id} ${next.level.name}`.toUpperCase(),
      b.x + b.w / 2,
      b.y - 16,
      legible(NEXT_LABEL),
      {
        maxWidth: b.w + 20,
      },
    );
    const inner = drawTealWindow(ctx, b, 10, 6);
    ctx.save();
    inner(ctx);
    ctx.clip();
    levelThumbs.draw(ctx, k, next.level.id, b);
    ctx.restore();
    finishTealWindow(ctx, inner);
    if (state === 'hover' || state === 'down') {
      roundRect(ctx, b.x - 9, b.y - 9, b.w + 18, b.h + 18, 18);
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba('#ffc33a', state === 'down' ? 1 : 0.85);
      ctx.stroke();
    }
  }
}
