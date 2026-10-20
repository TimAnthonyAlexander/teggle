// Everything in front of the playfield, in the guide's draw order (2.3): frame pieces, HUD
// columns, launcher housing, cannon. The playfield (background, frame shadow, objects, ball,
// effects) is drawn before this, callouts and dialogs after.

import type { PortraitImage } from '../art/masters';
import { CANNON_PIVOT, TEGGLE_BOARD_W, machineLayout, type MachineLayout } from '../layout';
import { drawRoundButton, fastForwardIcon, type ButtonState } from '../ui/controls';
import type { Theme } from '../ui/tokens';
import { drawCannon } from './cannon';
import { drawFrame, drawFrameKnobs } from './frame';
import {
  drawBallCounter,
  drawFeverMeter,
  drawScoreWindow,
  type BallCounterState,
  type FeverMeterState,
  type ScoreWindowContent,
} from './hud';
import { drawLauncher, drawLauncherBack } from './launcher';
import type { Ctx } from './paint';

export interface MachineState {
  readonly theme: Theme;
  readonly ballCounter: BallCounterState;
  readonly fever: FeverMeterState;
  readonly scoreLeft: ScoreWindowContent;
  readonly scoreRight: ScoreWindowContent;
  /** Power banner text and state. */
  readonly power: { readonly name: string; readonly active: boolean; readonly turns?: number };
  /** Aim angle in radians from straight down, positive toward +x. */
  readonly cannonAngle: number;
  readonly cannonLoaded: boolean;
  readonly menuButton: ButtonState;
  readonly holdButton: ButtonState;
  readonly timeMs: number;
  /** The master's portrait in the launcher window; empty glass when null or omitted. */
  readonly portrait?: PortraitImage | null;
  /** The machine around a narrower board (layout.machineLayout); Teggle's when omitted. */
  readonly machine?: MachineLayout;
}

const TEGGLE = machineLayout(TEGGLE_BOARD_W);

/** Draws `draw` moved right by `dx`; as it is when `dx` is 0. */
function shifted(ctx: Ctx, dx: number, draw: () => void): void {
  if (dx === 0) {
    draw();
    return;
  }
  ctx.save();
  ctx.translate(dx, 0);
  draw();
  ctx.restore();
}

export function drawMachine(ctx: Ctx, k: number, s: MachineState): void {
  const g = s.machine ?? TEGGLE;
  const narrow = g.inset > 0;
  drawFrame(ctx, k, s.theme, g);
  drawLauncherBack(ctx, k, s.theme);
  drawScoreWindow(ctx, k, 'left', s.scoreLeft, narrow ? g.scoreLeft : undefined);
  drawScoreWindow(ctx, k, 'right', s.scoreRight, narrow ? g.scoreRight : undefined);
  drawFrameKnobs(ctx, g);
  // The side columns are drawn in Teggle's places and moved in with a narrower frame.
  shifted(ctx, g.inset, () => {
    drawBallCounter(ctx, k, s.ballCounter);
  });
  shifted(ctx, -g.inset, () => {
    drawFeverMeter(ctx, k, s.fever);
  });
  const m = g.menuButton;
  drawRoundButton(ctx, m.x, m.y, m.r, 'purple', s.menuButton, 'Menu');
  const h = g.holdButton;
  drawRoundButton(ctx, h.x, h.y, h.r, 'green', s.holdButton, '', fastForwardIcon);
  drawLauncher(ctx, k, {
    theme: s.theme,
    power: s.power.name,
    active: s.power.active,
    timeMs: s.timeMs,
    ...(s.power.turns === undefined ? {} : { turns: s.power.turns }),
    ...(s.portrait === undefined ? {} : { portrait: s.portrait }),
  });
  drawCannon(ctx, k, CANNON_PIVOT.x, CANNON_PIVOT.y, s.cannonAngle, s.cannonLoaded);
}
