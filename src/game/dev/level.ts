// DEV ONLY: #/dev/level/<file>. Loads public/levels/<file>.json and shows it on the full
// machine (frame, HUD, cannon, bucket) with the physics running: moving parts move, a click
// shoots a ball from the cannon toward the pointer, lit pegs and bricks go when the shot ends.
// No rules run here: colors are the game's own draw for a seed (src/rules/colors.ts), and a
// stuck ball loses the lit peg it touches after 500 ticks.
//
// Keys: R restarts the level, F toggles the flag view (blue = can be orange, orange = not,
// green = quick disappear), T cycles the theme, P toggles the last shot's path.
// Query: theme=0..9, aim=<degrees> (fixed aim), still=1 (no motion, for screenshots),
// view=flags, seed=<n> (preview colors), path=1.

import { Rng } from '../../core/rng';
import { parseLevel, type Level, type LevelElement } from '../../level/schema';
import { assignColors } from '../../rules/colors';
import { attemptConfig } from '../../rules/config';
import { aimDirection, clampAim } from '../../sim/aim';
import { compileLevel } from '../../sim/compile';
import { World, type BodyView } from '../../sim/world';
import { numberParam, type Route } from '../app/router';
import type { AppServices, FrameInfo, Screen } from '../app/screens';
import { BOARD_X, BOARD_Y, CANNON_PIVOT, layout } from '../layout';
import { drawBall, drawBallShadow } from '../render/ball';
import { drawBucket } from '../render/buckets';
import { drawFrameShadow } from '../render/frame';
import { drawMachine } from '../render/machine';
import {
  drawBrick,
  drawBrickGlow,
  drawBrickPop,
  drawBrickShadow,
  drawPeg,
  drawPegGlow,
  drawPegShadow,
  drawRemovalPop,
  popDurationMs,
  type BrickShape,
} from '../render/pegs';
import { hitCircle } from '../ui/controls';
import { drawText } from '../ui/text';
import { THEMES, themeAt, type PegColor } from '../ui/tokens';
import { drawDevBackdrop } from './backdrop';

const STUCK_REMOVE = 500;
const MAX_SHOT_TICKS = 6000;

interface Pop {
  readonly x: number;
  readonly y: number;
  readonly shape: BrickShape | null;
  readonly color: PegColor;
  readonly atMs: number;
}

/** The game's own color draw (src/rules/colors.ts) with the default config, by element id. */
function previewColors(level: Level, seed: number): Map<number, PegColor> {
  const compiled = compileLevel(level);
  const config = attemptConfig();
  const colors = new Map<number, PegColor>();
  const flagged = level.elements.filter((e) => 'canBeOrange' in e && e.canBeOrange).length;
  if (flagged < config.orangeCount) return colors;
  const assigned = assignColors(compiled, config, Rng.fromSeed(seed)).colors;
  compiled.bodies.forEach((b, i) => {
    const c = assigned[i];
    if (c !== null && c !== undefined) colors.set(b.id, c);
  });
  return colors;
}

function flagColors(level: Level): Map<number, PegColor> {
  const colors = new Map<number, PegColor>();
  for (const e of level.elements) {
    if (e.kind !== 'peg' && e.kind !== 'brick' && e.kind !== 'curvedBrick') continue;
    colors.set(e.id, e.quickDisappear ? 'green' : e.canBeOrange ? 'blue' : 'orange');
  }
  return colors;
}

function brickShape(e: LevelElement, b: BodyView): BrickShape | null {
  if (e.kind === 'brick') {
    return {
      kind: 'brick',
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      length: e.length,
      width: e.width,
    };
  }
  if (e.kind === 'curvedBrick') {
    return {
      kind: 'curvedBrick',
      x: b.x,
      y: b.y,
      rotation: b.rotation,
      innerRadius: e.innerRadius,
      width: e.width,
      sector: e.sector,
      points: e.points,
    };
  }
  return null;
}

export class DevLevelScreen implements Screen {
  private app: AppServices | null = null;
  private file = '';
  private level: Level | null = null;
  private world: World | null = null;
  private error: string | null = null;
  private colors = new Map<number, PegColor>();
  private flagView = false;
  private showPath = false;
  private seed = 1;
  private themeIndex = 0;
  private aim = 0.2;
  private fixedAim: number | null = null;
  private still = false;
  private shots = 0;
  private now = 0;
  private shotTicks = 0;
  private readonly path: number[] = [];
  private lastPath: number[] = [];
  private readonly pops: Pop[] = [];

  enter(app: AppServices, route: Route): void {
    this.app = app;
    this.file = route.segments.slice(2).join('/');
    this.themeIndex = numberParam(route, 'theme', 0);
    this.seed = numberParam(route, 'seed', 1);
    this.flagView = route.params.get('view') === 'flags';
    this.showPath = route.params.get('path') === '1';
    this.still = route.params.get('still') === '1';
    const aimDeg = route.params.get('aim');
    this.fixedAim = aimDeg === undefined ? null : (numberParam(route, 'aim', 0) * Math.PI) / 180;
    this.aim = this.fixedAim ?? 0.2;
    const h = layout.holdButton;
    app.input.setHoldControl('fastForward', (x, y) => hitCircle(h.x, h.y, h.r, x, y));
    void this.load();
  }

  exit(): void {
    this.app?.input.removeHoldControl('fastForward');
    if (this.app !== null) this.app.clock.fastForward = false;
  }

  letterbox(): string {
    return themeAt(this.themeIndex).dark;
  }

  private async load(): Promise<void> {
    if (this.file === '') {
      this.error = 'No level file given. Use #/dev/level/<file>, e.g. #/dev/level/examples/plinko';
      return;
    }
    try {
      const res = await fetch(`/levels/${this.file}.json`);
      if (!res.ok) throw new Error(`HTTP ${res.status} for /levels/${this.file}.json`);
      const level = parseLevel(await res.json());
      this.level = level;
      this.restart();
    } catch (err) {
      this.error = err instanceof Error ? err.message : String(err);
    }
  }

  private restart(): void {
    const level = this.level;
    if (level === null) return;
    this.world = new World(compileLevel(level));
    this.colors = this.flagView ? flagColors(level) : previewColors(level, this.seed);
    this.shots = 0;
    this.pops.length = 0;
    this.path.length = 0;
    this.lastPath = [];
  }

  step(): void {
    const w = this.world;
    if (w === null || this.still) return;
    w.step();
    if (!w.inShot) return;
    this.shotTicks++;
    for (const b of w.balls) {
      if (b.id === 0) this.path.push(b.x, b.y);
      if (b.stuckTicks >= STUCK_REMOVE) this.unstick(w, b.x, b.y);
    }
    if (w.ballsInPlay === 0 || this.shotTicks >= MAX_SHOT_TICKS) this.finishShot(w);
  }

  private unstick(w: World, x: number, y: number): void {
    let best = -1;
    let bestD = Infinity;
    for (const s of w.bodies) {
      if (!s.def.scoring || !s.active || !s.lit) continue;
      const d = (s.x - x) * (s.x - x) + (s.y - y) * (s.y - y);
      if (d < bestD) {
        bestD = d;
        best = s.def.id;
      }
    }
    if (best >= 0) w.removePeg(best, 'stuck');
  }

  private finishShot(w: World): void {
    for (const b of [...w.balls]) w.removeBall(b.id);
    let n = 0;
    for (const id of w.litElementIds()) {
      const body = w.element(id);
      const e = body.def.element;
      if (e === null) continue;
      this.pops.push({
        x: body.x,
        y: body.y,
        shape: brickShape(e, body),
        color: this.colors.get(id) ?? 'blue',
        atMs: this.now + 60 * n++,
      });
    }
    w.endShot();
    this.lastPath = this.path.slice();
    this.path.length = 0;
  }

  private handleInput(): void {
    const app = this.app;
    if (app === null) return;
    const input = app.input;
    app.clock.fastForward = input.fastForwardHeld;
    for (const code of input.consumeKeys()) {
      if (code === 'KeyR') this.restart();
      if (code === 'KeyT') this.themeIndex = (this.themeIndex + 1) % THEMES.length;
      if (code === 'KeyP') this.showPath = !this.showPath;
      if (code === 'KeyF') {
        this.flagView = !this.flagView;
        if (this.level !== null) {
          this.colors = this.flagView
            ? flagColors(this.level)
            : previewColors(this.level, this.seed);
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
      this.aim = clampAim(this.aim);
    }
    const presses = input.consumePresses();
    const w = this.world;
    if (presses.length > 0 && w !== null && !w.inShot && !this.still) {
      w.launch(aimDirection(this.aim));
      this.shots++;
      this.shotTicks = 0;
      this.path.length = 0;
    }
  }

  render(f: FrameInfo): void {
    const { ctx, k } = f;
    this.now = this.still ? 1200 : f.timeMs;
    this.handleInput();
    const theme = themeAt(this.themeIndex);
    drawDevBackdrop(ctx, k);
    drawFrameShadow(ctx, k);
    const w = this.world;
    ctx.save();
    ctx.translate(BOARD_X, BOARD_Y);
    if (w !== null) this.drawBoard(ctx, k, w);
    ctx.restore();
    const bucketX = w === null ? BOARD_X + 458 : BOARD_X + w.bucketX;
    drawBucket(ctx, k, { x: bucketX });
    const level = this.level;
    const scoring = level === null ? 0 : this.countScoring(level);
    drawMachine(ctx, k, {
      theme,
      ballCounter: {
        balls: Math.max(0, 10 - this.shots),
        columnBalls: Math.max(0, 9 - this.shots),
        shotScore: 0,
        timeMs: this.now,
      },
      fever: { orangeHit: 0, timeMs: this.now },
      scoreLeft: { line1: 'Shots', line2: 'Fired', value: this.shots },
      scoreRight: { line1: 'Pegs', line2: 'Left', value: scoring },
      power: { name: level?.name ?? 'Level', active: false },
      cannonAngle: this.aim,
      cannonLoaded: w === null || !w.inShot,
      menuButton: 'normal',
      holdButton: this.app?.input.isHeld('fastForward') === true ? 'down' : 'normal',
      timeMs: this.now,
    });
    if (this.error !== null) {
      drawText(
        ctx,
        this.error,
        533,
        300,
        {
          face: 'body',
          cap: 11,
          fill: '#ffffff',
          align: 'center',
          anchor: 'middle',
          outline: { color: '#000000', width: 2 },
        },
        { maxWidth: 820 },
      );
    }
  }

  private countScoring(level: Level): number {
    const w = this.world;
    if (w === null) return 0;
    let n = 0;
    for (const e of level.elements) {
      if (e.kind !== 'peg' && e.kind !== 'brick' && e.kind !== 'curvedBrick') continue;
      if (w.isActive(e.id)) n++;
    }
    return n;
  }

  private drawBoard(ctx: CanvasRenderingContext2D, k: number, w: World): void {
    const bodies = w.bodies.filter((b) => b.def.role === 'element' && b.active);
    // Shadows, then solids and triggers, then pegs and bricks.
    for (const b of bodies) {
      const e = b.def.element;
      if (e === null || !e.visible) continue;
      if (e.kind === 'peg') drawPegShadow(ctx, b.x, b.y, e.radius);
      const shape = brickShape(e, b);
      if (shape !== null) drawBrickShadow(ctx, shape);
    }
    for (const b of bodies) {
      const e = b.def.element;
      if (e === null || !e.visible) continue;
      this.drawSolid(ctx, e, b);
    }
    for (const b of bodies) {
      const e = b.def.element;
      if (e === null || !e.visible) continue;
      const color = this.colors.get(e.id) ?? 'blue';
      if (e.kind === 'peg') {
        if (b.lit) drawPegGlow(ctx, k, b.x, b.y, color);
        drawPeg(ctx, k, b.x, b.y, color, b.lit, e.radius);
        continue;
      }
      const shape = brickShape(e, b);
      if (shape === null) continue;
      if (b.lit) drawBrickGlow(ctx, k, shape, color);
      if (b.def.motion === 'static') {
        drawBrick(ctx, k, shape, color, b.lit);
      } else {
        // Moving bricks turn every tick: draw the unrotated sprite under a rotated transform
        // instead of caching a sprite per angle.
        ctx.save();
        ctx.translate(shape.x, shape.y);
        ctx.rotate(-shape.rotation);
        drawBrick(ctx, k, { ...shape, x: 0, y: 0, rotation: 0 }, color, b.lit);
        ctx.restore();
      }
    }
    for (const p of this.pops) {
      const t = this.now - p.atMs;
      if (t < 0 || t > popDurationMs(p.color)) continue;
      if (p.shape === null) drawRemovalPop(ctx, p.x, p.y, p.color, t);
      else drawBrickPop(ctx, p.shape, p.color, t);
    }
    if (this.showPath) {
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      const pts = this.lastPath;
      for (let i = 0; i + 1 < pts.length; i += 8) {
        ctx.fillRect((pts[i] ?? 0) - 1, (pts[i + 1] ?? 0) - 1, 2, 2);
      }
    }
    for (const ball of w.balls) {
      if (ball.hiddenTicks > 0) continue;
      drawBallShadow(ctx, ball.x, ball.y, ball.radius);
      drawBall(ctx, k, ball.x, ball.y, ball.radius);
    }
  }

  private drawSolid(ctx: CanvasRenderingContext2D, e: LevelElement, b: BodyView): void {
    switch (e.kind) {
      case 'circle': {
        if (!e.collision) return;
        ctx.beginPath();
        ctx.arc(b.x, b.y, e.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#56606e';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#1c2026';
        ctx.stroke();
        return;
      }
      case 'polygon': {
        const c = Math.cos(b.rotation);
        const s = Math.sin(b.rotation);
        ctx.beginPath();
        e.vertices.forEach((v, i) => {
          const x = b.x + v.x * c + v.y * s;
          const y = b.y - v.x * s + v.y * c;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.fillStyle = '#56606e';
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#1c2026';
        ctx.stroke();
        return;
      }
      case 'rod': {
        const c = Math.cos(b.rotation);
        const s = Math.sin(b.rotation);
        ctx.beginPath();
        ctx.moveTo(b.x + e.a.x * c + e.a.y * s, b.y - e.a.x * s + e.a.y * c);
        ctx.lineTo(b.x + e.b.x * c + e.b.y * s, b.y - e.b.x * s + e.b.y * c);
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.strokeStyle = '#c9d2dc';
        ctx.stroke();
        return;
      }
      case 'teleport': {
        // Portal: a dark well with a turning rim.
        const r = Math.min(e.width, e.height) / 2;
        const turn = (this.now / 600) % (Math.PI * 2);
        ctx.save();
        ctx.translate(b.x, b.y);
        const g = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
        g.addColorStop(0, 'rgba(10,0,30,0.95)');
        g.addColorStop(0.7, 'rgba(70,20,140,0.85)');
        g.addColorStop(1, 'rgba(160,110,255,0.0)');
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = g;
        ctx.fill();
        ctx.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          ctx.beginPath();
          ctx.arc(0, 0, r * 0.85, turn + (i * Math.PI * 2) / 3, turn + (i * Math.PI * 2) / 3 + 1.1);
          ctx.strokeStyle = 'rgba(200,170,255,0.9)';
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      default:
        return;
    }
  }
}
