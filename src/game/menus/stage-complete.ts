// The stage complete moment: after the last level of a stage, the stage's levels with the
// scores of their campaign clears, the stage and campaign totals, and the master the next stage
// brings, its thumbnail turning from silhouette to portrait. On the dialog panel of visual
// guide 10.6; Teggle's own medal (guide 15: no original emblems or ribbon text).

import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { masterPortraits } from '../art/masters';
import { audioBus } from '../audio/bus';
import { CENTER_X, WORLD_H, WORLD_W, type Box } from '../layout';
import { STAGE_COUNT } from '../../level/campaign';
import { MASTERS, masterOfStage } from '../../rules/masters';
import { powerName } from '../play/powers';
import { circlePath, linear, radial, type Ctx } from '../render/paint';
import { campaignTotal, levelRecord, stageTotal, type Progress } from '../progress/save';
import { drawListRow, drawPanel, drawPillButton, drawRow } from '../ui/controls';
import { rgba } from '../ui/color';
import { ease } from '../ui/motion';
import { drawText, formatNumber, textStyle, type TextStyle } from '../ui/text';
import { ButtonSet } from './buttons';
import { stageName } from './copy';
import { drawMasterTile } from './faces';
import type { CampaignStage } from '../../level/campaign';

const BOX: Box = { x: CENTER_X - 330, y: 24, w: 660, h: 556 };
const TILE = 96;
const REVEAL_MS = 1400;

const HEAD: TextStyle = {
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
  cap: 16,
  fill: [
    [0, '#fffbd0'],
    [0.5, '#ffd23a'],
    [1, '#ff8a12'],
  ],
  outline: { color: '#2a0c02', width: 2 },
  align: 'center',
  anchor: 'middle',
};
const NOTE: TextStyle = { ...textStyle.body('#d9ecff'), cap: 8.6, align: 'center' };

export class StageCompleteScreen implements Screen {
  private app: AppServices | null = null;
  private t0 = -1;
  private readonly buttons: ButtonSet<'continue'>;

  constructor(
    private readonly stage: CampaignStage,
    private readonly progress: Progress,
    /** The next stage is in the manifest. */
    private readonly nextBuilt: boolean,
  ) {
    this.buttons = new ButtonSet<'continue'>([
      {
        action: 'continue',
        box: { x: CENTER_X - 85, y: BOX.y + BOX.h - 54, w: 171, h: 36 },
        enabled: true,
      },
    ]);
  }

  enter(app: AppServices): void {
    this.app = app;
    for (const m of MASTERS) void masterPortraits.request(m.power, 'neutral');
    audioBus.emit({ type: 'levelWon', fullClear: false });
  }

  exit(): void {
    this.app = null;
  }

  letterbox(): string {
    return '#0d0838';
  }

  private go(): void {
    audioBus.emit({ type: 'uiClick' });
    this.app?.navigate(this.nextBuilt ? '#/adventure' : '#/');
  }

  render(f: FrameInfo): void {
    const { ctx, k, timeMs } = f;
    const app = this.app;
    if (app === null) return;
    if (this.t0 < 0) this.t0 = timeMs;
    const t = timeMs - this.t0;
    const input = app.input;
    for (const code of input.consumeKeys()) {
      if (code === 'Enter' || code === 'Space' || code === 'Escape') this.go();
    }
    if (this.buttons.handle(input).length > 0) this.go();

    ctx.fillStyle = linear(ctx, 0, 0, 0, WORLD_H, [
      [0, '#1f1478'],
      [1, '#0b0630'],
    ]);
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    // Light rays behind the panel.
    ctx.save();
    ctx.translate(CENTER_X, 150);
    ctx.rotate(t / 9000);
    for (let i = 0; i < 16; i++) {
      ctx.rotate(Math.PI / 8);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-60, -700);
      ctx.lineTo(60, -700);
      ctx.closePath();
      ctx.fillStyle = rgba('#7a6cff', 0.08);
      ctx.fill();
    }
    ctx.restore();

    const s = this.stage.stage;
    drawPanel(ctx, BOX, `${stageName(s)} Complete!`);
    this.drawMedal(ctx, BOX.x + 60, BOX.y + 96, t);
    drawText(ctx, this.stage.world.toUpperCase(), CENTER_X, BOX.y + 70, HEAD);

    // The stage's levels with their campaign scores.
    const listX = BOX.x + 110;
    const listW = BOX.w - 220;
    let y = BOX.y + 92;
    this.stage.levels.forEach((l, i) => {
      const score = levelRecord(this.progress, l.id).campaignScore ?? 0;
      drawListRow(
        ctx,
        { x: listX, y, w: listW, h: 22 },
        i + 1,
        l.name,
        formatNumber(score),
        'normal',
      );
      y += 24;
    });
    y += 12;
    drawRow(ctx, listX, y, listW, 'Stage score:', formatNumber(stageTotal(this.progress, s)));
    y += 26;
    drawRow(ctx, listX, y, listW, 'Total score:', formatNumber(campaignTotal(this.progress)));

    this.drawNext(ctx, k, t);
    drawPillButton(
      ctx,
      this.buttons.items[0]?.box ?? BOX,
      'orange',
      this.buttons.state(0, input),
      this.nextBuilt ? 'Continue' : 'Main Menu',
      { lugs: true },
    );
  }

  /** The master the next stage brings, revealed from its silhouette. */
  private drawNext(ctx: Ctx, k: number, t: number): void {
    const s = this.stage.stage;
    const cy = BOX.y + 292;
    if (s >= STAGE_COUNT) {
      drawText(ctx, 'THE ADVENTURE IS COMPLETE!', CENTER_X, cy + 20, NAME);
      drawText(
        ctx,
        'Every level and every master is yours in Quick Play.',
        CENTER_X,
        cy + 54,
        NOTE,
      );
      return;
    }
    const nextStage = s + 1;
    const power = nextStage <= 10 ? (masterOfStage(nextStage)?.power ?? null) : null;
    drawText(ctx, `${stageName(nextStage)} unlocked`.toUpperCase(), CENTER_X, cy - 6, HEAD);
    const x = CENTER_X - TILE / 2;
    const y = cy + 8;
    const r = ease.inOutCubic(Math.min(1, Math.max(0, (t - 500) / REVEAL_MS)));
    drawMasterTile(ctx, k, power, x, y, TILE, 'locked');
    if (r > 0) {
      ctx.save();
      ctx.globalAlpha *= r;
      drawMasterTile(ctx, k, power, x, y, TILE, 'current');
      ctx.restore();
    }
    const title =
      power === null
        ? 'Master levels: any master'
        : `New master: ${masterOfStage(nextStage)?.animal ?? ''}`;
    drawText(ctx, title.toUpperCase(), CENTER_X, y + TILE + 18, NAME, { alpha: r });
    const note =
      power === null
        ? 'Pick any master before each level.'
        : this.nextBuilt
          ? `Power: ${powerName(power)}.`
          : `Power: ${powerName(power)}. The next stage's levels are not in the game yet.`;
    drawText(ctx, note, CENTER_X, y + TILE + 42, NOTE, { alpha: r });
  }

  private drawMedal(ctx: Ctx, x: number, y: number, t: number): void {
    // A gold medal with a peg at its heart: Teggle's own (guide 15).
    const pop = ease.outBack(1.6)(Math.min(1, t / 450));
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(pop, pop);
    for (const [dx, c] of [
      [-9, '#b8231a'],
      [9, '#1c4fb8'],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(dx - 9, 6);
      ctx.lineTo(dx + 9, 6);
      ctx.lineTo(dx + 9, 52);
      ctx.lineTo(dx, 44);
      ctx.lineTo(dx - 9, 52);
      ctx.closePath();
      ctx.fillStyle = c;
      ctx.fill();
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = '#1a0a04';
      ctx.stroke();
    }
    circlePath(ctx, 0, 0, 30);
    ctx.fillStyle = radial(ctx, -10, -12, 2, 0, 0, 30, [
      [0, '#fff6c8'],
      [0.35, '#f2c24a'],
      [0.8, '#b8781c'],
      [1, '#6e4210'],
    ]);
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#3e2410';
    ctx.stroke();
    circlePath(ctx, 0, 0, 21);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(110, 66, 16, 0.7)';
    ctx.stroke();
    circlePath(ctx, 0, 0, 11);
    ctx.fillStyle = radial(ctx, -3, -4, 1, 0, 0, 11, [
      [0, '#fafabc'],
      [0.5, '#f8a44d'],
      [1, '#a03504'],
    ]);
    ctx.fill();
    ctx.restore();
  }
}
