// Options (visual guide 10.6): a titled panel with slider rows behind blue label pills, a row of
// toggles, a full-width green pill and a large green Done button in a recessed sub-panel. Music
// and effects volume and mute go to the audio engine, which stores them (teggle.audio.v1).
// Fullscreen is the browser's own state; where the browser has no element fullscreen (iPhone
// Safari), the toggle shows disabled. Reached from the main menu and from the pause dialog.

import type { Input } from '../app/input';
import { enterFullscreen } from '../app/orientation';
import { audioControls } from '../audio/engine';
import { CENTER_X, type Box } from '../layout';
import { innerBevel, linear, roundRect, type Ctx, type PathFn } from '../render/paint';
import {
  drawPanel,
  drawPillButton,
  drawSlider,
  drawToggle,
  type ButtonState,
} from '../ui/controls';
import { dialogDrop } from '../ui/motion';
import { color } from '../ui/tokens';
import { ButtonSet } from './buttons';
import { HelpDialog } from './help';
import { dimBehind, type MenuOverlay } from './overlay';

type Slider = 'music' | 'sfx';
type Action = Slider | 'mute' | 'fullscreen' | 'help' | 'done';

const BOX: Box = { x: CENTER_X - 220, y: 104, w: 440, h: 372 };
const LABEL_W = 150;
const ROW_H = 26;

export function fullscreenAvailable(): boolean {
  return (
    document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === 'function'
  );
}

export function isFullscreen(): boolean {
  return document.fullscreenElement !== null;
}

function toggleFullscreen(): void {
  if (isFullscreen()) {
    document.exitFullscreen().catch(() => undefined);
  } else {
    enterFullscreen();
  }
}

export class OptionsDialog implements MenuOverlay {
  private readonly buttons: ButtonSet<Action>;
  private dragging: Slider | null = null;
  private help: HelpDialog | null = null;

  constructor(private readonly t0: number) {
    const x = BOX.x + 32;
    const right = BOX.x + BOX.w - 32;
    const y0 = BOX.y + 70;
    const slider = (y: number): Box => ({
      x: x + LABEL_W + 22,
      y: y - 3,
      w: right - (x + LABEL_W + 22) - 8,
      h: ROW_H + 6,
    });
    const half = (right - x - 18) / 2;
    this.buttons = new ButtonSet<Action>([
      { action: 'music', box: slider(y0), enabled: true },
      { action: 'sfx', box: slider(y0 + 42), enabled: true },
      { action: 'mute', box: { x, y: y0 + 92, w: half, h: 30 }, enabled: true },
      {
        action: 'fullscreen',
        box: { x: x + half + 18, y: y0 + 92, w: half, h: 30 },
        enabled: fullscreenAvailable(),
      },
      { action: 'help', box: { x, y: y0 + 142, w: right - x, h: 26 }, enabled: true },
      {
        action: 'done',
        box: { x: x + 22, y: y0 + 212, w: right - x - 44, h: 34 },
        enabled: true,
      },
    ]);
  }

  private dy(now: number): number {
    return dialogDrop(now - this.t0, 500);
  }

  private setSlider(which: Slider, pointerX: number): void {
    const b = this.buttons.find(which)?.box;
    if (b === undefined) return;
    const v = Math.min(1, Math.max(0, (pointerX - b.x) / b.w));
    const audio = audioControls();
    if (which === 'music') audio.setMusicVolume(v);
    else audio.setSfxVolume(v);
  }

  update(input: Input, now: number): boolean {
    if (this.help !== null) {
      if (!this.help.update(input, now)) this.help = null;
      return true;
    }
    for (const code of input.consumeKeys()) {
      if (code === 'Escape' || code === 'Enter') return false;
    }
    const dy = this.dy(now);
    for (const p of input.consumePresses()) {
      const i = this.buttons.at(p.x, p.y - dy);
      const action = this.buttons.items[i]?.action;
      if (action === 'music' || action === 'sfx') {
        this.dragging = action;
        this.setSlider(action, p.x);
      } else {
        this.buttons.press(p.x, p.y - dy);
      }
    }
    if (this.dragging !== null && input.pointer.down)
      this.setSlider(this.dragging, input.pointer.x);
    let open = true;
    for (const r of input.consumeReleases()) {
      if (this.dragging !== null) {
        if (this.dragging === 'sfx') audioControls().previewSfx();
        this.dragging = null;
        continue;
      }
      const action = this.buttons.release(r.x, r.y - dy);
      if (action !== null) open = this.act(action, now) && open;
    }
    return open;
  }

  /** Runs a clicked action; false when it closes the dialog. */
  private act(action: Action, now: number): boolean {
    const audio = audioControls();
    switch (action) {
      case 'mute':
        audio.toggleMute();
        return true;
      case 'fullscreen':
        toggleFullscreen();
        return true;
      case 'help':
        this.help = new HelpDialog(now);
        return true;
      case 'done':
        return false;
      case 'music':
      case 'sfx':
        return true;
    }
  }

  render(ctx: Ctx, k: number, input: Input, now: number): void {
    dimBehind(ctx, now - this.t0);
    const dy = this.dy(now);
    const settings = audioControls().settings;
    ctx.save();
    ctx.translate(0, dy);
    drawPanel(ctx, BOX, 'Options');
    const x = BOX.x + 32;
    const state = (a: Action): ButtonState => {
      const i = this.buttons.items.findIndex((b) => b.action === a);
      if (this.dragging === a) return 'down';
      return this.buttons.state(i, input, 0, dy);
    };
    const box = (a: Action): Box => this.buttons.find(a)?.box ?? BOX;
    const sliderRow = (a: Slider, label: string, value: number): void => {
      const b = box(a);
      drawPillButton(ctx, { x, y: b.y + 3, w: LABEL_W, h: ROW_H }, 'blue', 'normal', label, {
        cap: 8.6,
      });
      drawSlider(ctx, b, value, state(a));
    };
    sliderRow('music', 'Music Volume', settings.musicVolume);
    sliderRow('sfx', 'Sound Effects', settings.sfxVolume);
    drawToggle(ctx, box('mute'), settings.muted, state('mute'), 'Mute All');
    drawToggle(ctx, box('fullscreen'), isFullscreen(), state('fullscreen'), 'Full Screen');
    drawPillButton(ctx, box('help'), 'green', state('help'), 'How to Play', { cap: 9 });
    // Recessed sub-panel around Done (10.6).
    const done = box('done');
    const well: PathFn = (c) => {
      roundRect(c, BOX.x + 22, done.y - 16, BOX.w - 44, done.h + 32, 14);
    };
    well(ctx);
    ctx.fillStyle = linear(ctx, 0, done.y - 16, 0, done.y + done.h + 16, [
      [0, '#160a52'],
      [1, color.panel],
    ]);
    ctx.fill();
    innerBevel(ctx, well, {
      light: '#000000',
      dark: color.panelBevel,
      width: 2.5,
      lightAlpha: 0.6,
      darkAlpha: 0.55,
    });
    well(ctx);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = color.tealLipDark;
    ctx.stroke();
    drawPillButton(ctx, done, 'green', state('done'), 'Done', { cap: 12 });
    ctx.restore();
    this.help?.render(ctx, k, input, now);
  }
}
