// DEV ONLY: #/dev/board. The full play screen at 16:9 with the frame, HUD, cannon, bucket and a
// test grid of pegs and bricks in every color, for visual review. Not linked from any menu.
//
// Controls: the cannon follows the pointer (wheel and arrow keys nudge it); click a peg or brick
// to light it; R pops every lit object; N resets; T cycles the theme; hold the right button or
// the green control to run 8x. Query: theme=0..9, aim=<degrees>, balls, orange, score, still=1.

import {
  BUCKET_REFERENCE_CYCLE,
  BUCKET_REFERENCE_TRAVEL,
  BUCKET_TRAVEL_INSET,
  GRAVITY,
  LAUNCH_SPEED,
} from '../../sim/tuning';
import { numberParam, type Route } from '../app/router';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { BOARD_W, BOARD_X, CANNON_BALL_REACH, CANNON_PIVOT, layout } from '../layout';
import { drawBall, drawBallShadow } from '../render/ball';
import { drawBucket } from '../render/buckets';
import { drawAimGuide } from '../render/cannon';
import { drawFrameShadow } from '../render/frame';
import { drawMachine } from '../render/machine';
import {
  brickWorldVertices,
  drawBrick,
  drawBrickGlow,
  drawBrickHitFlash,
  drawBrickPop,
  drawBrickShadow,
  drawHitFlash,
  drawPeg,
  drawPegGlow,
  drawPegShadow,
  drawRemovalPop,
  popDurationMs,
  type BrickShape,
} from '../render/pegs';
import { drawPegValue } from '../ui/callouts';
import { hitCircle, type ButtonState } from '../ui/controls';
import { motion as motionTokens, PEG_COLORS, THEMES, themeAt, type PegColor } from '../ui/tokens';
import { drawDevBackdrop } from './backdrop';

type Item =
  | { kind: 'peg'; x: number; y: number; color: PegColor }
  | { kind: 'brick'; shape: BrickShape; color: PegColor };

interface ItemState {
  readonly item: Item;
  lit: boolean;
  hitAt: number;
  removedAt: number;
}

const BASE_VALUE: Record<PegColor, number> = { blue: 10, orange: 100, purple: 500, green: 10 };

function buildItems(): Item[] {
  const items: Item[] = [];
  const colors = PEG_COLORS;
  // Two staggered rows of round pegs in every color.
  for (let row = 0; row < 2; row++) {
    for (let i = 0; i < 20; i++) {
      const x = 175 + i * 37 + (row % 2) * 18;
      items.push({ kind: 'peg', x, y: 150 + row * 34, color: colors[(i + row) % 4] ?? 'blue' });
    }
  }
  // Straight bricks lying flat and tilted.
  for (let i = 0; i < 16; i++) {
    const tilt = i < 8 ? 0 : (i % 2 === 0 ? 1 : -1) * 0.35;
    items.push({
      kind: 'brick',
      color: colors[i % 4] ?? 'blue',
      shape: {
        kind: 'brick',
        x: 205 + i * 44,
        y: 245 + (i < 8 ? 0 : 0),
        rotation: Math.PI / 2 + tilt,
        length: 35,
        width: 20,
      },
    });
  }
  // Standing bricks.
  for (let i = 0; i < 4; i++) {
    items.push({
      kind: 'brick',
      color: colors[i] ?? 'blue',
      shape: { kind: 'brick', x: 150 + i * 24, y: 330, rotation: 0, length: 35, width: 20 },
    });
  }
  // A bowl of curved bricks, four points per arc like the original files.
  const cx = 600;
  const cy = 300;
  const rm = 190;
  const n = 15;
  const sector = (2.25 * Math.PI) / 3 / n;
  for (let i = 0; i < n; i++) {
    const theta = Math.PI / 2 - (n / 2 - 0.5 - i) * sector * 1.02;
    const color: PegColor =
      i === 3 || i === 10 ? 'orange' : i === 7 ? 'green' : i === 12 ? 'purple' : 'blue';
    items.push({
      kind: 'brick',
      color,
      shape: {
        kind: 'curvedBrick',
        x: cx + rm * Math.cos(theta),
        y: cy + rm * Math.sin(theta),
        rotation: -theta,
        innerRadius: rm - 10,
        width: 20,
        sector,
        points: 4,
      },
    });
  }
  // Pegs inside the bowl.
  for (let i = 0; i < 7; i++) {
    items.push({
      kind: 'peg',
      x: 480 + i * 40,
      y: 360 + (i % 2) * 22,
      color: i === 3 ? 'purple' : i % 3 === 0 ? 'orange' : 'blue',
    });
  }
  return items;
}

function pointInPolygon(x: number, y: number, pts: readonly { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const a = pts[i];
    const b = pts[j];
    if (a === undefined || b === undefined) continue;
    if (a.y > y !== b.y > y && x < ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

export class DevBoardScreen implements Screen {
  private app: AppServices | null = null;
  private themeIndex = 0;
  private items: ItemState[] = [];
  private tick = 0;
  private aim = 0;
  private fixedAim: number | null = null;
  private still = false;
  private balls = 7;
  private orange = 12;
  private score = 18_000;
  private now = 0;
  private readonly guide = new Float64Array(20);

  enter(app: AppServices, route: Route): void {
    this.app = app;
    this.themeIndex = numberParam(route, 'theme', 0);
    const aimDeg = route.params.get('aim');
    this.fixedAim = aimDeg === undefined ? null : (numberParam(route, 'aim', 0) * Math.PI) / 180;
    this.aim = this.fixedAim ?? 0.35;
    this.still = route.params.get('still') === '1';
    this.balls = numberParam(route, 'balls', 7);
    this.orange = numberParam(route, 'orange', 12);
    this.score = numberParam(route, 'score', 18_000);
    this.tick = this.still ? 140 : 0;
    this.reset();
    const h = layout.holdButton;
    app.input.setHoldControl('fastForward', (x, y) => hitCircle(h.x, h.y, h.r, x, y));
  }

  exit(): void {
    this.app?.input.removeHoldControl('fastForward');
    if (this.app !== null) this.app.clock.fastForward = false;
  }

  letterbox(): string {
    return themeAt(this.themeIndex).dark;
  }

  private reset(): void {
    this.items = buildItems().map((item, i) => ({
      item,
      lit: i % 5 === 2 || i % 7 === 3,
      hitAt: -Infinity,
      removedAt: Infinity,
    }));
  }

  step(): void {
    this.tick++;
  }

  private bucketX(): number {
    // Dev preview of the bucket's cosine glide at the original's peak speed.
    const center = BOARD_X + BOARD_W / 2;
    const amp = BOARD_W / 2 - BUCKET_TRAVEL_INSET;
    const cycle = Math.round((BUCKET_REFERENCE_CYCLE * amp) / BUCKET_REFERENCE_TRAVEL);
    return center + amp * Math.cos((2 * Math.PI * this.tick) / cycle);
  }

  private handleInput(): void {
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    app.clock.fastForward = input.fastForwardHeld;
    for (const code of input.consumeKeys()) {
      if (code === 'KeyT') this.themeIndex = (this.themeIndex + 1) % THEMES.length;
      if (code === 'KeyN') this.reset();
      if (code === 'KeyR') {
        let n = 0;
        for (const s of this.items) {
          if (s.lit && s.removedAt === Infinity)
            s.removedAt = this.now + n++ * motionTokens.pegRemoveStepMs;
        }
      }
    }
    const wheel = input.consumeWheel();
    const nudge = (wheel * 0.1 + input.arrowAxis * 0.5) * (Math.PI / 180);
    if (this.fixedAim === null) {
      if (nudge !== 0) this.aim += nudge;
      else if (input.pointer.inside && input.pointer.y > CANNON_PIVOT.y) {
        this.aim = Math.atan2(input.pointer.x - CANNON_PIVOT.x, input.pointer.y - CANNON_PIVOT.y);
      }
      const max = (97 * Math.PI) / 180;
      this.aim = Math.max(-max, Math.min(max, this.aim));
    }
    for (const p of input.consumePresses()) {
      for (const s of this.items) {
        if (s.removedAt <= this.now) continue;
        const it = s.item;
        const hit =
          it.kind === 'peg'
            ? hitCircle(it.x, it.y, 10, p.x, p.y)
            : pointInPolygon(p.x, p.y, brickWorldVertices(it.shape));
        if (hit) {
          s.lit = !s.lit;
          s.hitAt = s.lit ? this.now : -Infinity;
        }
      }
    }
  }

  private computeGuide(): number {
    // Dev preview only: the plain ballistic arc, sampled at equal time steps from the muzzle.
    const dx = Math.sin(this.aim);
    const dy = Math.cos(this.aim);
    const sx = CANNON_PIVOT.x + dx * CANNON_BALL_REACH;
    const sy = CANNON_PIVOT.y + dy * CANNON_BALL_REACH;
    const count = 8;
    for (let i = 0; i < count; i++) {
      const t = 4.3 * i;
      this.guide[2 * i] = sx + dx * LAUNCH_SPEED * t;
      this.guide[2 * i + 1] = sy + dy * LAUNCH_SPEED * t + 0.5 * GRAVITY * t * t;
    }
    return count;
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    this.now = this.still ? 1200 : f.timeMs;
    this.handleInput();
    const theme = themeAt(this.themeIndex);
    drawDevBackdrop(ctx, k);
    drawFrameShadow(ctx, k);
    const visible = this.items.filter((s) => this.now < s.removedAt);
    for (const s of visible) {
      if (s.item.kind === 'peg') drawPegShadow(ctx, s.item.x, s.item.y);
      else drawBrickShadow(ctx, s.item.shape);
    }
    for (const s of visible) {
      const it = s.item;
      if (it.kind === 'peg') {
        if (s.lit) drawPegGlow(ctx, k, it.x, it.y, it.color);
        drawPeg(ctx, k, it.x, it.y, it.color, s.lit);
        drawHitFlash(ctx, k, it.x, it.y, it.color, this.now - s.hitAt);
      } else {
        if (s.lit) drawBrickGlow(ctx, k, it.shape, it.color);
        drawBrick(ctx, k, it.shape, it.color, s.lit);
        drawBrickHitFlash(ctx, k, it.shape, it.color, this.now - s.hitAt);
      }
    }
    for (const s of this.items) {
      const t = this.now - s.removedAt;
      if (t < 0 || t > popDurationMs(s.item.color)) continue;
      if (s.item.kind === 'peg') drawRemovalPop(ctx, s.item.x, s.item.y, s.item.color, t);
      else drawBrickPop(ctx, s.item.shape, s.item.color, t);
    }
    for (const s of visible) {
      const it = s.item;
      const x = it.kind === 'peg' ? it.x : it.shape.x;
      const y = it.kind === 'peg' ? it.y : it.shape.y;
      drawPegValue(ctx, x, y, BASE_VALUE[it.color] * 2, this.now - s.hitAt);
    }
    drawBallShadow(ctx, 742, 432);
    drawBall(ctx, k, 742, 432);
    drawBucket(ctx, k, { x: this.bucketX() });
    const n = this.computeGuide();
    drawAimGuide(ctx, k, this.guide, n);
    const input = this.app?.input;
    const h = layout.holdButton;
    const m = layout.menuButton;
    const over = (cx: number, cy: number, r: number): boolean =>
      input !== undefined &&
      input.pointer.inside &&
      hitCircle(cx, cy, r, input.pointer.x, input.pointer.y);
    const holdState: ButtonState =
      input?.isHeld('fastForward') === true ? 'down' : over(h.x, h.y, h.r) ? 'hover' : 'normal';
    const menuState: ButtonState = over(m.x, m.y, m.r) ? 'hover' : 'normal';
    drawMachine(ctx, k, {
      theme,
      ballCounter: {
        balls: this.balls,
        columnBalls: Math.max(0, this.balls - 1),
        shotScore: this.score,
        timeMs: this.now,
      },
      fever: { orangeHit: this.orange, timeMs: this.now },
      scoreLeft: { line1: 'Stage', line2: '1-4', value: 12_960 },
      scoreRight: { line1: 'Total', line2: 'Score', value: 853_250 },
      power: { name: theme.power, active: true, turns: 2 },
      cannonAngle: this.aim,
      cannonLoaded: true,
      menuButton: menuState,
      holdButton: holdState,
      timeMs: this.now,
    });
  }
}
