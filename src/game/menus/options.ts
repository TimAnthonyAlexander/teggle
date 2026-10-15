// Options (visual guide 10.6): a titled panel with slider rows behind blue label pills, a row of
// toggles, a full-width green pill and a large green Done button in a recessed sub-panel. Music
// and effects volume and mute go to the audio engine, which stores them (teggle.audio.v1).
// Fullscreen is the browser's own state; where the browser has no element fullscreen (iPhone
// Safari), the toggle shows disabled, and on a touch screen a line says how to get full screen
// there: add the game to the home screen. An installed app shows it on and disabled. Reached
// from the main menu and from the pause dialog.
//
// On a touch screen the rows sit at least 44 CSS px apart and the controls grow a little
// (spec 14.2, mobile pass); with a mouse the dialog is the original's.

import { display, legible, touchPitch } from '../app/display';
import type { Input } from '../app/input';
import { enterFullscreen, installedApp } from '../app/orientation';
import { audioControls } from '../audio/engine';
import { CENTER_X, WORLD_H, type Box } from '../layout';
import { innerBevel, linear, roundRect, type Ctx, type PathFn } from '../render/paint';
import {
  drawPanel,
  drawPillButton,
  drawSlider,
  drawToggle,
  type ButtonState,
} from '../ui/controls';
import { dialogDrop } from '../ui/motion';
import { drawText, textStyle, type TextStyle } from '../ui/text';
import { color } from '../ui/tokens';
import { ButtonSet } from './buttons';
import { HelpDialog } from './help';
import { dimBehind, wrapText, type MenuOverlay } from './overlay';

type Slider = 'music' | 'sfx';
type Action = Slider | 'mute' | 'fullscreen' | 'help' | 'done';

const DESKTOP_BOX: Box = { x: CENTER_X - 220, y: 104, w: 440, h: 372 };
const LABEL_W = 150;
const ROW_H = 26;
const HINT_TEXT =
  'To play full screen, add Teggle to your Home Screen: Share, then Add to Home Screen.';
const HINT: TextStyle = { ...textStyle.body('#fff6c0'), cap: 8.6, align: 'center' };
/** Room for the hint's two lines. */
const HINT_H = 40;

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

interface Layout {
  readonly box: Box;
  readonly rowH: number;
  readonly music: Box;
  readonly sfx: Box;
  readonly mute: Box;
  readonly fullscreen: Box;
  readonly help: Box;
  readonly done: Box;
  /** Center line of the home screen hint, or null for none. */
  readonly hintY: number | null;
}

/**
 * Rows from the top: the two sliders, the toggles, How to Play and Done, each gap at least the
 * touch pitch on a touch screen. Without touch this is the original's layout exactly.
 */
function optionsLayout(touch: boolean, hint: boolean): Layout {
  // The gap above Done includes its recessed well, 18 units more than a plain row.
  const g1 = touchPitch(42);
  const g2 = touchPitch(50);
  const g3 = touchPitch(50);
  const g4 = touchPitch(52) + 18;
  const grown = touch && g1 > 42;
  const hintH = hint ? HINT_H : 0;
  const w = grown ? 520 : DESKTOP_BOX.w;
  const rowH = grown ? 30 : ROW_H;
  const toggleH = grown ? 36 : 30;
  const helpH = grown ? 32 : 26;
  const doneH = grown ? 40 : 34;
  const h = grown || hint ? 70 + g1 + g2 + g3 + hintH + g4 + doneH + 56 : DESKTOP_BOX.h;
  const box: Box =
    grown || hint ? { x: CENTER_X - w / 2, y: Math.round((WORLD_H - h) / 2), w, h } : DESKTOP_BOX;
  const x = box.x + 32;
  const right = box.x + box.w - 32;
  const y0 = box.y + 70;
  const slider = (y: number): Box => ({
    x: x + LABEL_W + 22,
    y: y - 3,
    w: right - (x + LABEL_W + 22) - 8,
    h: rowH + 6,
  });
  const half = (right - x - 18) / 2;
  const yToggles = y0 + g1 + g2;
  const yHelp = yToggles + g3 + hintH;
  return {
    box,
    rowH,
    music: slider(y0),
    sfx: slider(y0 + g1),
    mute: { x, y: yToggles, w: half, h: toggleH },
    fullscreen: { x: x + half + 18, y: yToggles, w: half, h: toggleH },
    help: { x, y: yHelp, w: right - x, h: helpH },
    done: { x: x + 22, y: yHelp + g4, w: right - x - 44, h: doneH },
    hintY: hint ? yToggles + toggleH + (g3 - toggleH + hintH) / 2 : null,
  };
}

export class OptionsDialog implements MenuOverlay {
  private readonly buttons: ButtonSet<Action>;
  private readonly layout: Layout;
  private readonly installed = installedApp();
  private dragging: Slider | null = null;
  private help: HelpDialog | null = null;
  private hintLines: string[] | null = null;

  constructor(private readonly t0: number) {
    const hint = display.coarse && !fullscreenAvailable() && !this.installed;
    const l = optionsLayout(display.coarse, hint);
    this.layout = l;
    this.buttons = new ButtonSet<Action>([
      { action: 'music', box: l.music, enabled: true },
      { action: 'sfx', box: l.sfx, enabled: true },
      { action: 'mute', box: l.mute, enabled: true },
      {
        action: 'fullscreen',
        box: l.fullscreen,
        enabled: fullscreenAvailable() && !this.installed,
      },
      { action: 'help', box: l.help, enabled: true },
      { action: 'done', box: l.done, enabled: true },
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
    let open = true;
    for (const { press, e } of input.consumePointer()) {
      const touch = e.kind === 'touch';
      if (press) {
        if (e.crowded) {
          this.buttons.cancel();
          continue;
        }
        const i = this.buttons.at(e.x, e.y - dy, touch);
        const action = this.buttons.items[i]?.action;
        if (action === 'music' || action === 'sfx') {
          this.dragging = action;
          this.setSlider(action, e.x);
        } else {
          this.buttons.press(e.x, e.y - dy, touch);
        }
        continue;
      }
      if (this.dragging !== null) {
        if (this.dragging === 'sfx') audioControls().previewSfx();
        this.dragging = null;
        continue;
      }
      if (e.crowded) {
        this.buttons.cancel();
        continue;
      }
      const action = this.buttons.release(e.x, e.y - dy, touch);
      if (action !== null) open = this.act(action, now) && open;
    }
    if (this.dragging !== null && input.pointer.down)
      this.setSlider(this.dragging, input.pointer.x);
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
    const l = this.layout;
    const BOX = l.box;
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
      drawPillButton(ctx, { x, y: b.y + 3, w: LABEL_W, h: l.rowH }, 'blue', 'normal', label, {
        cap: 8.6,
      });
      drawSlider(ctx, b, value, state(a));
    };
    sliderRow('music', 'Music Volume', settings.musicVolume);
    sliderRow('sfx', 'Sound Effects', settings.sfxVolume);
    drawToggle(ctx, box('mute'), settings.muted, state('mute'), 'Mute All');
    drawToggle(
      ctx,
      box('fullscreen'),
      isFullscreen() || this.installed,
      state('fullscreen'),
      'Full Screen',
    );
    if (l.hintY !== null) {
      const style = legible(HINT);
      this.hintLines ??= wrapText(ctx, HINT_TEXT, BOX.w - 64, style);
      const pitch = style.cap * 1.7;
      let y = l.hintY + style.cap / 2 - ((this.hintLines.length - 1) * pitch) / 2;
      for (const line of this.hintLines) {
        drawText(ctx, line, CENTER_X, y, style, { maxWidth: BOX.w - 64 });
        y += pitch;
      }
    }
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
