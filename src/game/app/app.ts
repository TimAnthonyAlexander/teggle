// The browser app: one canvas filling the viewport, the 16:9 world fit inside it, input, the
// fixed-step loop and the screen stack. Screens come from a route table keyed by the hash.
//
// Phones (spec 14.1, 14.2): the world fits inside the safe area; a hidden page stops the loop
// and pauses the game; a phone held upright shows the rotate prompt, pauses the game and drops
// the touches made meanwhile.

import { WORLD_H, WORLD_W } from '../layout';
import { layers, setScreenScale } from '../render/cache';
import { brickLayerStats } from '../render/pegs';
import { themeAt } from '../ui/tokens';
import { setDisplay } from './display';
import { loadFonts } from './fonts';
import { Input } from './input';
import { FixedStepClock, Loop } from './loop';
import { routeShown, type PageState } from './offline';
import {
  drawRotatePrompt,
  enterFullscreen,
  installedApp,
  isTouchPrimary,
  needsRotate,
} from './orientation';
import { parseRoute, type Route } from './router';
import { ScreenManager, type AppServices, type Screen } from './screens';
import { ResolutionGovernor } from './quality';
import { clientToWorld, cssPixels, fitWorld, MAX_DPR, type Fit, type Insets } from './viewport';

export type RouteTable = (route: Route) => Screen | Promise<Screen>;

/** Orientation changes settle (size and safe area) a moment after the event on some phones. */
const SETTLE_MS = 350;

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
  private safeArea: HTMLElement | null = null;
  /** Lowers a phone's backing store if its frames stay slow (quality.ts); desktops never. */
  private readonly governor = new ResolutionGovernor(MAX_DPR);
  private touch = false;

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
    this.safeArea = createSafeAreaProbe();
    this.resize();
    this.watchPixelRatio();
    window.addEventListener('resize', this.resize);
    window.addEventListener('orientationchange', this.onOrientation);
    window.addEventListener('hashchange', this.onHashChange);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('pagehide', this.onPageHide);
    this.input.attach(this.canvas, (x, y) => clientToWorld(this.fit, x, y));
    if (isTouchPrimary()) {
      this.input.blockPageGestures();
      // An installed app already runs full screen (or standalone, where the browser has none).
      if (!installedApp()) this.input.onFirstTouch(enterFullscreen);
    }
    if (import.meta.env.DEV) {
      Object.assign(window, {
        __teggleLayers: () => ({
          ...layers.stats(),
          bricks: brickLayerStats().pixels,
          dpr: this.fit.dpr,
          k: this.fit.k,
        }),
      });
    }
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
  private shownToken = 0;

  /** Whether a newer build may take over now (app/offline.ts). */
  pageState(): PageState {
    return { navigating: this.shownToken !== this.routeToken, busy: this.screens.busy() };
  }

  private async showRoute(): Promise<void> {
    const token = ++this.routeToken;
    const route = parseRoute(window.location.hash);
    try {
      const screen = await this.routes(route);
      // A later navigation may have finished first; only the newest one wins.
      if (token === this.routeToken) this.screens.replace(screen, route);
    } finally {
      if (token === this.routeToken) {
        this.shownToken = token;
        routeShown();
      }
    }
  }

  private readonly onHashChange = (): void => {
    // A new screen loads and builds its layers: its first frames say nothing about the device.
    this.governor.restart();
    void this.showRoute();
  };

  private readonly onVisibility = (): void => {
    if (document.visibilityState === 'hidden') {
      // No frames run while hidden anyway; stopping the loop makes it explicit, and the game
      // waits behind its pause dialog for the player's return.
      this.loop.stop();
      this.input.reset();
      this.screens.interrupt();
    } else {
      this.clock.reset();
      this.governor.restart();
      this.loop.start();
    }
  };

  private readonly onPageHide = (): void => {
    this.screens.interrupt();
  };

  /**
   * The device pixel ratio can change without a resize event (a window dragged to a screen of
   * another density); a media query on the current ratio reports it.
   */
  private watchPixelRatio(): void {
    const query = window.matchMedia(`(resolution: ${String(window.devicePixelRatio)}dppx)`);
    query.addEventListener(
      'change',
      () => {
        this.resize();
        this.watchPixelRatio();
      },
      { once: true },
    );
  }

  private readonly onOrientation = (): void => {
    this.resize();
    setTimeout(this.resize, SETTLE_MS);
  };

  private readonly resize = (): void => {
    const rect = this.canvas.getBoundingClientRect();
    const w = rect.width > 0 ? rect.width : window.innerWidth;
    const h = rect.height > 0 ? rect.height : window.innerHeight;
    const touch = isTouchPrimary();
    this.touch = touch;
    const dpr = touch
      ? Math.min(window.devicePixelRatio, this.governor.cap)
      : window.devicePixelRatio;
    this.fit = fitWorld(w, h, dpr, readSafeArea(this.safeArea));
    setDisplay(this.fit.scale, touch);
    if (this.canvas.width !== this.fit.pixelWidth) this.canvas.width = this.fit.pixelWidth;
    if (this.canvas.height !== this.fit.pixelHeight) this.canvas.height = this.fit.pixelHeight;
    if (Math.abs(this.fit.k - this.lastK) > 1e-6) {
      // Cached layers are drawn for one resolution; drop them instead of letting them pile up.
      setScreenScale(this.fit.k);
      layers.clear();
      this.lastK = this.fit.k;
      this.governor.restart();
    }
    const rotating = needsRotate(w, h);
    if (rotating !== this.rotating) {
      this.rotating = rotating;
      // Touches made around the turn, or on the prompt, must not reach the game afterwards.
      this.input.reset();
      this.input.clearQueues();
      if (rotating) this.screens.interrupt();
    }
    this.clock.paused = this.rotating;
  };

  private render(alpha: number, frameMs: number): void {
    const ctx = this.ctx;
    const f = this.fit;
    const timeMs = performance.now() - this.startMs;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (this.rotating) {
      this.input.clearQueues();
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
    // A phone that cannot keep up draws fewer pixels from the next frame on.
    if (this.touch && this.fit.dpr > 1 && this.governor.frame(frameMs)) this.resize();
  }
}

/**
 * A hidden element padded by the safe-area insets: its computed padding is the insets in CSS
 * pixels, where env() is supported (0 elsewhere).
 */
function createSafeAreaProbe(): HTMLElement {
  const el = document.createElement('div');
  el.setAttribute('aria-hidden', 'true');
  el.style.cssText =
    'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
    'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) ' +
    'env(safe-area-inset-left)';
  document.body.appendChild(el);
  return el;
}

function readSafeArea(probe: HTMLElement | null): Insets {
  if (probe === null) return { top: 0, right: 0, bottom: 0, left: 0 };
  const s = getComputedStyle(probe);
  return {
    top: cssPixels(s.paddingTop),
    right: cssPixels(s.paddingRight),
    bottom: cssPixels(s.paddingBottom),
    left: cssPixels(s.paddingLeft),
  };
}
