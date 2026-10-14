// The browser app: one canvas filling the viewport, the 16:9 world fit inside it, input, the
// fixed-step loop and the screen stack. Screens come from a route table keyed by the hash.

import { WORLD_H, WORLD_W } from '../layout';
import { layers } from '../render/cache';
import { themeAt } from '../ui/tokens';
import { loadFonts } from './fonts';
import { Input } from './input';
import { FixedStepClock, Loop } from './loop';
import { enterFullscreen, needsRotate, drawRotatePrompt, isTouchPrimary } from './orientation';
import { parseRoute, type Route } from './router';
import { ScreenManager, type AppServices, type Screen } from './screens';
import { clientToWorld, fitWorld, type Fit } from './viewport';

export type RouteTable = (route: Route) => Screen | Promise<Screen>;

export class App implements AppServices {
  readonly input = new Input();
  readonly clock = new FixedStepClock();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly screens: ScreenManager;
  private readonly loop: Loop;
  private fit: Fit;
  private readonly startMs = performance.now();
  private rotating = false;
  private lastK = 0;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly routes: RouteTable,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (ctx === null) throw new Error('Canvas 2D is not available in this browser.');
    this.ctx = ctx;
    this.fit = fitWorld(1, 1, 1);
    this.screens = new ScreenManager(this);
    this.loop = new Loop(this.clock, {
      step: () => {
        this.screens.step();
      },
      render: (alpha, frameMs) => {
        this.render(alpha, frameMs);
      },
    });
  }

  async start(): Promise<void> {
    this.resize();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.resize);
    window.addEventListener('hashchange', this.onHashChange);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.input.attach(this.canvas, (x, y) => clientToWorld(this.fit, x, y));
    if (isTouchPrimary()) this.input.onFirstTouch(enterFullscreen);
    await loadFonts();
    layers.clear();
    await this.showRoute();
    this.loop.start();
    // Lets tools (screenshots, tests) know the first real frame is on screen.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        document.documentElement.dataset.ready = '1';
      });
    });
  }

  navigate(hash: string): void {
    if (window.location.hash === hash) this.onHashChange();
    else window.location.hash = hash;
  }

  private routeToken = 0;

  private async showRoute(): Promise<void> {
    const token = ++this.routeToken;
    const route = parseRoute(window.location.hash);
    const screen = await this.routes(route);
    // A later navigation may have finished first; only the newest one wins.
    if (token === this.routeToken) this.screens.replace(screen, route);
  }

  private readonly onHashChange = (): void => {
    void this.showRoute();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'visible') this.clock.reset();
  };

  private readonly resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : window.innerWidth;
    const h = rect.height > 0 ? rect.height : window.innerHeight;
    this.fit = fitWorld(w, h, window.devicePixelRatio);
    if (this.canvas.width !== this.fit.pixelWidth) this.canvas.width = this.fit.pixelWidth;
    if (this.canvas.height !== this.fit.pixelHeight) this.canvas.height = this.fit.pixelHeight;
    if (Math.abs(this.fit.k - this.lastK) > 1e-6) {
      // Cached layers are drawn for one resolution; drop them instead of letting them pile up.
      layers.clear();
      this.lastK = this.fit.k;
    }
    this.rotating = needsRotate(w, h);
    this.clock.paused = this.rotating;
  };

  private render(alpha: number, frameMs: number): void {
    const ctx = this.ctx;
    const f = this.fit;
    const timeMs = performance.now() - this.startMs;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.rotating) {
      drawRotatePrompt(ctx, f.cssWidth, f.cssHeight, f.dpr, timeMs, themeAt(0));
      return;
    }
    ctx.fillStyle = this.screens.letterbox() ?? themeAt(0).dark;
    ctx.fillRect(0, 0, f.pixelWidth, f.pixelHeight);
    ctx.setTransform(f.k, 0, 0, f.k, f.originX, f.originY);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, WORLD_W, WORLD_H);
    ctx.clip();
    this.screens.render({ ctx, k: f.k, timeMs, frameMs, alpha });
    ctx.restore();
  }
}
