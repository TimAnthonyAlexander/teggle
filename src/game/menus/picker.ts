// Master picker: before each Master level (spec 7 and 8: stage 11 lets the player pick any
// master) and before a Quick Play level. The ten masters as thumbnails, locked ones as dark
// silhouettes; the chosen one large with its power, and Play. The panel and controls are those
// of visual guide 10.5 and 10.6.

import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { masterPortraits } from '../art/masters';
import { audioBus } from '../audio/bus';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import { MASTERS, masterOfPower } from '../../rules/masters';
import type { PowerId } from '../../rules/powers';
import { powerName } from '../play/powers';
import { innerBevel, linear, roundRect, type Ctx, type PathFn } from '../render/paint';
import { drawPanel, drawPillButton } from '../ui/controls';
import { drawText, textStyle, type TextStyle } from '../ui/text';
import { color } from '../ui/tokens';
import { ButtonSet, type UiButton } from './buttons';
import { MASTER_COPY } from './copy';
import { drawMasterPortrait, drawMasterTile } from './faces';
import { wrapText } from './overlay';
import { drawRoundMenu } from './intro';

const PANEL: Box = { x: 4, y: 4, w: WORLD_W - 8, h: WORLD_H - 8 };
const TILE = 84;
const GAP = 14;
const GRID_Y = 92;
const BIG = { x: 150, y: 312, size: 170 } as const;

const CONTEXT: TextStyle = {
  cap: 13,
  fill: [
    [0, '#9ff0ff'],
    [1, '#45bbd9'],
  ],
  outline: { color: '#06103a', width: 1.8 },
  align: 'center',
  anchor: 'middle',
};
const NAME: TextStyle = {
  cap: 22,
  fill: [
    [0, '#fffbd0'],
    [0.5, '#ffd23a'],
    [1, '#ff8a12'],
  ],
  outline: { color: '#2a0c02', width: 2.2 },
  align: 'left',
  anchor: 'middle',
};
const POWER: TextStyle = { ...CONTEXT, cap: 14, align: 'left' };
const BODY: TextStyle = { ...textStyle.body('#d9ecff'), cap: 12, weight: 600 };

type Action =
  { kind: 'pick'; power: PowerId } | { kind: 'play' } | { kind: 'back' } | { kind: 'menu' };

export interface PickerData {
  /** What the pick is for, e.g. "Master level 11-2: ..." or "Quick Play: 1-3 The Sky Tree". */
  readonly context: string;
  readonly unlocked: readonly PowerId[];
  readonly initial: PowerId;
  /** Where Play leads with the chosen master. */
  readonly play: (power: PowerId) => string;
  /** Called with the chosen master before Play leads on. */
  readonly onPick?: (power: PowerId) => void;
  readonly back: string;
}

export class MasterPickerScreen implements Screen {
  private app: AppServices | null = null;
  private chosen: PowerId;
  private readonly buttons: ButtonSet<Action>;
  private lines: string[] | null = null;

  constructor(private readonly data: PickerData) {
    this.chosen = data.unlocked.includes(data.initial)
      ? data.initial
      : (data.unlocked[0] ?? 'guide');
    const rowW = 5 * TILE + 4 * GAP;
    const x0 = CENTER_X - rowW / 2;
    const tiles = MASTERS.map((m, i): UiButton<Action> => ({
      action: { kind: 'pick', power: m.power },
      box: {
        x: x0 + (i % 5) * (TILE + GAP),
        y: GRID_Y + Math.floor(i / 5) * (TILE + GAP),
        w: TILE,
        h: TILE,
      },
      enabled: data.unlocked.includes(m.power),
    }));
    this.buttons = new ButtonSet<Action>([
      ...tiles,
      {
        action: { kind: 'play' },
        box: { x: WORLD_W - 290, y: WORLD_H - 70, w: 171, h: 36 },
        enabled: true,
      },
      {
        action: { kind: 'back' },
        box: { x: WORLD_W - 290 - 170, y: WORLD_H - 66, w: 140, h: 28 },
        enabled: true,
      },
      {
        action: { kind: 'menu' },
        box: { x: 14, y: WORLD_H - 64, w: 46, h: 46 },
        round: true,
        enabled: true,
      },
    ]);
  }

  enter(app: AppServices): void {
    this.app = app;
    for (const m of MASTERS) void masterPortraits.request(m.power, 'neutral');
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return '#0d0838';
  }

  private act(a: Action): void {
    const app = this.app;
    if (app === null) return;
    audioBus.emit({ type: 'uiClick' });
    switch (a.kind) {
      case 'pick':
        this.chosen = a.power;
        this.lines = null;
        break;
      case 'play':
        this.data.onPick?.(this.chosen);
        app.navigate(this.data.play(this.chosen));
        break;
      case 'back':
        app.navigate(this.data.back);
        break;
      case 'menu':
        app.navigate('#/');
        break;
    }
  }

  private cycle(dir: number): void {
    const list = this.data.unlocked;
    const i = list.indexOf(this.chosen);
    const next = list[(i + dir + list.length) % list.length];
    if (next !== undefined) {
      this.chosen = next;
      this.lines = null;
    }
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    for (const code of input.consumeKeys()) {
      if (code === 'ArrowRight' || code === 'ArrowDown') this.cycle(1);
      else if (code === 'ArrowLeft' || code === 'ArrowUp') this.cycle(-1);
      else if (code === 'Enter' || code === 'Space') this.act({ kind: 'play' });
      else if (code === 'Escape') this.act({ kind: 'back' });
    }
    for (const a of this.buttons.handle(input)) this.act(a);

    ctx.fillStyle = '#0d0838';
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    drawPanel(ctx, PANEL, 'Choose Your Master');
    drawText(ctx, this.data.context.toUpperCase(), CENTER_X, 70, CONTEXT, {
      maxWidth: WORLD_W - 140,
    });
    this.buttons.items.forEach((b, i) => {
      const state = this.buttons.state(i, input);
      if (b.action.kind === 'pick') {
        const power = b.action.power;
        const chosen = power === this.chosen;
        drawMasterTile(
          ctx,
          k,
          power,
          b.box.x,
          b.box.y,
          TILE,
          !b.enabled ? 'locked' : chosen ? 'current' : 'normal',
        );
        if (b.enabled && !chosen && state === 'hover') {
          roundRect(ctx, b.box.x - 4, b.box.y - 4, TILE + 8, TILE + 8, 12);
          ctx.lineWidth = 2.5;
          ctx.strokeStyle = 'rgba(255, 200, 70, 0.8)';
          ctx.stroke();
        }
      } else if (b.action.kind === 'play') {
        drawPillButton(ctx, b.box, 'orange', state, 'Play', { lugs: true });
      } else if (b.action.kind === 'back') {
        drawPillButton(ctx, b.box, 'blue', state, 'Back');
      } else {
        drawRoundMenu(ctx, b.box, state);
      }
    });
    this.drawChosen(ctx, k);
  }

  private drawChosen(ctx: Ctx, k: number): void {
    const power = this.chosen;
    const well: Box = {
      x: BIG.x - 20,
      y: BIG.y - 18,
      w: WORLD_W - 2 * (BIG.x - 20),
      h: BIG.size + 36,
    };
    const path: PathFn = (c) => {
      roundRect(c, well.x, well.y, well.w, well.h, 14);
    };
    path(ctx);
    ctx.fillStyle = linear(ctx, 0, well.y, 0, well.y + well.h, [
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
    drawMasterPortrait(ctx, k, power, BIG.x, BIG.y, BIG.size);
    const tx = BIG.x + BIG.size + 34;
    const master = masterOfPower(power);
    drawText(ctx, master.animal.toUpperCase(), tx, BIG.y + 30, NAME);
    drawText(ctx, powerName(power).toUpperCase(), tx, BIG.y + 64, POWER);
    this.lines ??= wrapText(ctx, MASTER_COPY[power].power, well.x + well.w - tx - 30, BODY);
    let y = BIG.y + 100;
    for (const line of this.lines) {
      drawText(ctx, line, tx, y, BODY);
      y += 23;
    }
  }
}
