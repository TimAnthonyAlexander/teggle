// Everything in front of the playfield, in the guide's draw order (2.3): frame pieces, HUD
// columns, launcher housing, cannon. The playfield (background, frame shadow, objects, ball,
// effects) is drawn before this, callouts and dialogs after.

import type { PortraitImage } from '../art/masters';
import { CANNON_PIVOT, layout } from '../layout';
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
}

export function drawMachine(ctx: Ctx, k: number, s: MachineState): void {
  drawFrame(ctx, k, s.theme);
  drawLauncherBack(ctx, k, s.theme);
  drawScoreWindow(ctx, k, 'left', s.scoreLeft);
  drawScoreWindow(ctx, k, 'right', s.scoreRight);
  drawFrameKnobs(ctx);
  drawBallCounter(ctx, k, s.ballCounter);
  drawFeverMeter(ctx, k, s.fever);
  const m = layout.menuButton;
  drawRoundButton(ctx, m.x, m.y, m.r, 'purple', s.menuButton, 'Menu');
  const h = layout.holdButton;
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
