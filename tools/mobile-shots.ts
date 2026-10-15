// The mobile pass check (spec 14.2): drives Teggle with real touch input on emulated phones and
// a tablet (Playwright device descriptors; no simulators), checks what each touch did, and saves
// screenshots into reference/teggle-shots/mobile/<device>/ (gitignored).
//
// Taps are the browsers' own touch events in both engines (page.touchscreen). Drags, holds and
// two-finger touches go through Chromium's DevTools protocol (Input.dispatchTouchEvent), which
// WebKit has no equivalent of, so those checks run on the Chromium devices. Aiming at an exact
// angle uses the DEV handle (window.__teggle); the shots themselves are fired by touch, with a
// tap on the cannon.
//
// Runs its own Vite dev server on port 47912 (never the shared one on 47823) unless TEGGLE_BASE
// names a running server, and stops a server it started.
//
// Usage: npm run shots:mobile [-- step ...]   (MOBILE_DEVICES=iphone-se,galaxy-s24 picks devices)

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import {
  chromium,
  devices,
  webkit,
  type BrowserType,
  type CDPSession,
  type Page,
} from '@playwright/test';

const PORT = 47912;
const ROOT = path.resolve(import.meta.dirname, '..');
const OUT = path.join(ROOT, 'reference', 'teggle-shots', 'mobile');
const SAVE_KEY = 'teggle.save.v1';
const WORLD_W = 3200 / 3;
const WORLD_H = 600;
const CENTER_X = WORLD_W / 2;

interface Device {
  readonly engine: 'webkit' | 'chromium';
  readonly descriptor: string;
  /** Steps to run; the full set on the two smallest phones. */
  readonly steps: readonly string[];
}

const FULL = [
  'portrait',
  'notch',
  'menu',
  'options',
  'adventure',
  'win',
  'loss',
  'lucky',
  'quickplay',
];

const DEVICES: Record<string, Device> = {
  'iphone-se': { engine: 'webkit', descriptor: 'iPhone SE (3rd gen) landscape', steps: FULL },
  'galaxy-s24': { engine: 'chromium', descriptor: 'Galaxy S24 landscape', steps: FULL },
  'iphone-13': {
    engine: 'webkit',
    descriptor: 'iPhone 13 landscape',
    steps: ['portrait', 'menu', 'options', 'adventure'],
  },
  'pixel-7': {
    engine: 'chromium',
    descriptor: 'Pixel 7 landscape',
    steps: ['portrait', 'menu', 'options', 'adventure'],
  },
  'ipad-mini': {
    engine: 'webkit',
    descriptor: 'iPad Mini landscape',
    steps: ['menu', 'options', 'adventure', 'quickplay'],
  },
};

// ---------------------------------------------------------------------------------------------
// Page helpers

type Snap = Record<string, unknown>;

interface Debug {
  snapshot(): Snap;
  setAim(angle: number): void;
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
}

interface TestWindow {
  __teggle?: Debug;
  __teggleAudio?: { snapshot(): Snap };
}

class Ctx {
  readonly failures: string[] = [];
  private touchId = 0;
  /** Safe-area insets the page is told about (Chromium only), CSS px. */
  insets = { top: 0, right: 0, bottom: 0, left: 0 };

  constructor(
    readonly page: Page,
    readonly device: string,
    readonly base: string,
    readonly cdp: CDPSession | null,
  ) {}

  /** World coordinates to CSS pixels, as src/game/app/viewport.ts fits the world. */
  css(x: number, y: number): { x: number; y: number } {
    const v = this.page.viewportSize() ?? { width: 1600, height: 900 };
    const i = this.insets;
    const w = v.width - i.left - i.right;
    const h = v.height - i.top - i.bottom;
    const s = this.scale();
    return { x: i.left + (w - WORLD_W * s) / 2 + x * s, y: i.top + (h - WORLD_H * s) / 2 + y * s };
  }

  /** CSS pixels per world unit. */
  scale(): number {
    const v = this.page.viewportSize() ?? { width: 1600, height: 900 };
    const i = this.insets;
    return Math.min(
      (v.width - i.left - i.right) / WORLD_W,
      (v.height - i.top - i.bottom) / WORLD_H,
    );
  }

  async tap(x: number, y: number, dxCss = 0, dyCss = 0): Promise<void> {
    const p = this.css(x, y);
    await this.page.touchscreen.tap(p.x + dxCss, p.y + dyCss);
  }

  /** Touches down at world points (Chromium only), returns their ids. */
  async touchDown(points: readonly { x: number; y: number }[]): Promise<number[]> {
    const ids = points.map(() => ++this.touchId);
    await this.touch('touchStart', points, ids);
    return ids;
  }

  async touchMove(points: readonly { x: number; y: number }[], ids: readonly number[]) {
    await this.touch('touchMove', points, ids);
  }

  async touchUp(): Promise<void> {
    await this.cdp?.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  }

  private async touch(
    type: 'touchStart' | 'touchMove',
    points: readonly { x: number; y: number }[],
    ids: readonly number[],
  ): Promise<void> {
    if (this.cdp === null) throw new Error('multi-touch needs Chromium');
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => {
        const c = this.css(p.x, p.y);
        return { x: c.x, y: c.y, id: ids[i] ?? i, radiusX: 6, radiusY: 6, force: 1 };
      }),
    });
  }

  async shot(name: string): Promise<void> {
    const dir = path.join(OUT, this.device);
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, `${name}.png`);
    await this.page.screenshot({ path: file });
    console.log(`  ${path.relative(ROOT, file)}`);
  }

  check(ok: boolean, what: string): void {
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}`);
    if (!ok) this.failures.push(`${this.device}: ${what}`);
  }

  async wait(ms: number): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  async hash(): Promise<string> {
    return this.page.evaluate(() => window.location.hash);
  }

  /** Loads the app fresh at `hash` with `save` in storage (null clears it). */
  async open(hash: string, save: string | null, settleMs = 1200): Promise<void> {
    await this.page.goto(`${this.base}/?s=${Date.now()}`);
    await this.page.evaluate(
      ([key, value]) => {
        if (value === null) localStorage.removeItem(key);
        else localStorage.setItem(key, value);
      },
      [SAVE_KEY, save] as const,
    );
    await this.page.goto(`${this.base}/?s=${Date.now()}${hash}`);
    await this.page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
      timeout: 30_000,
    });
    await this.wait(settleMs);
  }

  async snap(): Promise<Snap | null> {
    return this.page.evaluate(() => {
      const t = (window as unknown as TestWindow).__teggle;
      return t === undefined ? null : t.snapshot();
    });
  }

  async audio(): Promise<Snap | null> {
    return this.page.evaluate(() => {
      const a = (window as unknown as TestWindow).__teggleAudio;
      return a === undefined ? null : a.snapshot();
    });
  }

  async waitPlay(): Promise<void> {
    await this.page.waitForFunction(
      () => (window as unknown as TestWindow).__teggle !== undefined,
      null,
      { timeout: 30_000 },
    );
    await this.wait(600);
  }

  /** Waits until the screen can fire again or a dialog is open; returns the snapshot. */
  async waitReady(timeoutMs = 90_000): Promise<Snap> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.snap();
      if (s !== null) {
        if (s.dialog !== null) return s;
        if (s.phase === 'aim' && s.ready === true && s.holding !== true) return s;
      }
      if (Date.now() > deadline) throw new Error(`Timed out waiting to aim: ${JSON.stringify(s)}`);
      await this.wait(200);
    }
  }

  async until(test: (s: Snap) => boolean, timeoutMs = 30_000): Promise<Snap | null> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const s = await this.snap();
      if (s !== null && test(s)) return s;
      if (Date.now() > deadline) return null;
      await this.wait(100);
    }
  }

  /** Aims with the DEV handle, then fires with a real tap on the cannon. */
  async fireAt(angle: number | 'best' | 'green'): Promise<void> {
    await this.page.evaluate((a) => {
      const t = (window as unknown as TestWindow).__teggle;
      if (t === undefined) return;
      let angle = typeof a === 'number' ? a : t.pickAim(a);
      if (Number.isNaN(angle)) angle = t.pickAim('best');
      t.setAim(angle);
    }, angle);
    await this.wait(350);
    // The launcher: a tap there fires without re-aiming (spec 14.2, play screen).
    await this.tap(CENTER_X, 78);
    await this.wait(300);
  }

  /** Makes the page report hidden (or visible again) and fires visibilitychange. */
  async setHidden(hidden: boolean): Promise<void> {
    // A string, so the bundler's helpers for named functions never reach the page.
    await this.page.evaluate(
      `Object.defineProperty(document, 'visibilityState', { configurable: true, value: '${
        hidden ? 'hidden' : 'visible'
      }' }); document.dispatchEvent(new Event('visibilitychange'));`,
    );
  }

  /** How often the page asked for element full screen (see recordFullscreen). */
  async fullscreenRequests(): Promise<number> {
    return this.page.evaluate(
      () => (window as unknown as { __fullscreenAsks?: number }).__fullscreenAsks ?? 0,
    );
  }

  async rotate(portrait: boolean): Promise<void> {
    const v = this.page.viewportSize();
    if (v === null) return;
    const isPortrait = v.height > v.width;
    if (isPortrait !== portrait)
      await this.page.setViewportSize({ width: v.height, height: v.width });
    await this.wait(700);
  }
}

/**
 * Counts element full screen requests instead of entering full screen: an emulated phone window
 * cannot turn between portrait and landscape while it is full screen. Runs before the page.
 */
function recordFullscreen(): void {
  const w = window as unknown as { __fullscreenAsks?: number };
  w.__fullscreenAsks = 0;
  Element.prototype.requestFullscreen = (): Promise<void> => {
    w.__fullscreenAsks = (w.__fullscreenAsks ?? 0) + 1;
    return Promise.resolve();
  };
}

// ---------------------------------------------------------------------------------------------
// Saves

/** A save with campaign levels 1-1 up to (not including) number `next` cleared on try 1. */
function saveThrough(next: number): string {
  const levels: Record<string, unknown> = {};
  const scores = [184310, 226540, 151280, 298770, 241900];
  for (let n = 1; n < next; n++) {
    const stage = Math.ceil(n / 5);
    const id = `${stage}-${n - (stage - 1) * 5}`;
    const score = scores[(n - 1) % scores.length] ?? 100000;
    levels[id] = {
      tries: 1,
      wins: 1,
      fullClear: n === 3,
      best: score,
      campaignScore: score,
      top: [{ score, master: 'guide', date: '2026-10-15' }],
    };
  }
  return JSON.stringify({ version: 1, campaign: { next, try: 1, pick: null }, levels });
}

// ---------------------------------------------------------------------------------------------
// Steps (world coordinates from the screens' own layouts)

const MENU = {
  adventure: { x: WORLD_W - 22 - 98, y: 30 + 73 },
  quickplay: { x: WORLD_W - 22 - 98, y: 222 + 73 },
  challenges: { x: WORLD_W - 22 - 98, y: 414 + 73 },
  options: { x: 40 + 750 / 3, y: 534 + 23 },
  help: { x: 40 + 1500 / 3, y: 534 + 23 },
};

/** Where an options control sits: the dialog lays its rows out from the screen (options.ts). */
async function optionsBox(c: Ctx, action: string): Promise<{ x: number; y: number } | null> {
  // Found by scanning down the dialog's middle column for the control's color is fragile; the
  // dialog's touch layout is deterministic, so this mirrors optionsLayout() for a touch screen.
  const target = 44 / c.scale();
  const pitch = (d: number) => Math.max(d, Math.min(2 * d, target));
  const g1 = pitch(42);
  const g2 = pitch(50);
  const g3 = pitch(50);
  const g4 = pitch(52) + 18;
  const grown = g1 > 42;
  const hint = await c.page.evaluate(
    () =>
      !(
        document.fullscreenEnabled &&
        typeof document.documentElement.requestFullscreen === 'function'
      ),
  );
  const hintH = hint ? 40 : 0;
  const w = grown ? 520 : 440;
  const doneH = grown ? 40 : 34;
  const h = grown || hint ? 70 + g1 + g2 + g3 + hintH + g4 + doneH + 56 : 372;
  const y = grown || hint ? Math.round((WORLD_H - h) / 2) : 104;
  const x = CENTER_X - w / 2 + 32;
  const right = CENTER_X + w / 2 - 32;
  const y0 = y + 70;
  const sliderX = x + 150 + 22;
  const sliderW = right - sliderX - 8;
  const toggles = y0 + g1 + g2;
  const help = toggles + g3 + hintH;
  switch (action) {
    case 'music':
      return { x: sliderX + sliderW * 0.3, y: y0 + 13 };
    case 'sfx':
      return { x: sliderX + sliderW * 0.5, y: y0 + g1 + 13 };
    case 'mute':
      return { x: x + 60, y: toggles + 15 };
    case 'help':
      return { x: CENTER_X, y: help + 14 };
    case 'done':
      return { x: CENTER_X, y: help + g4 + doneH / 2 };
    default:
      return null;
  }
}

type Step = (c: Ctx) => Promise<void>;

const STEPS: Record<string, Step> = {
  portrait: async (c) => {
    await c.rotate(true);
    await c.open('', null, 1500);
    await c.shot('portrait-rotate-prompt');
    await c.tap(CENTER_X, 300);
    await c.rotate(false);
    await c.shot('portrait-back-to-landscape');
    c.check((await c.hash()) === '', 'a tap on the rotate prompt does nothing');
  },

  notch: async (c) => {
    if (c.cdp === null) return;
    // A phone with a notch and a home indicator, held landscape: 844 x 390 with 47 px insets at
    // the sides and 21 px at the bottom (an iPhone 13's), told to the page as env() insets.
    const v = c.page.viewportSize();
    await c.page.setViewportSize({ width: 844, height: 390 });
    c.insets = { top: 0, right: 47, bottom: 21, left: 47 };
    await c.cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: c.insets });
    await c.open('', null, 1500);
    await c.shot('notch-menu');
    await c.tap(MENU.adventure.x, MENU.adventure.y);
    await c.wait(1500);
    c.check((await c.hash()) === '#/adventure', 'taps land where the inset frame is drawn');
    await c.tap(CENTER_X, 220);
    await c.tap(CENTER_X, WORLD_H - 62 + 18);
    await c.waitPlay();
    await c.waitReady();
    await c.shot('notch-level');
    await c.cdp.send('Emulation.setSafeAreaInsetsOverride', {
      insets: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    c.insets = { top: 0, right: 0, bottom: 0, left: 0 };
    if (v !== null) await c.page.setViewportSize(v);
  },

  menu: async (c) => {
    await c.open('', null, 1500);
    await c.shot('menu');
    // Audio unlocks on the first touch.
    await c.tap(CENTER_X - 200, 200);
    await c.wait(400);
    const a = await c.audio();
    c.check(a?.context === 'running', `the first touch unlocks audio (${String(a?.context)})`);
    if (c.cdp !== null) {
      c.check((await c.fullscreenRequests()) === 1, 'the first touch asks for full screen once');
    }
    await c.tap(MENU.challenges.x, MENU.challenges.y);
    await c.wait(400);
    await c.shot('menu-challenges-notice');
    if (c.cdp !== null) {
      // Holding a finger on a slab shows what it does; sliding off and lifting does nothing.
      await c.wait(5200);
      const ids = await c.touchDown([MENU.quickplay]);
      await c.wait(400);
      await c.shot('menu-touch-hold-quickplay');
      await c.touchMove([{ x: 500, y: 300 }], ids);
      await c.touchUp();
      await c.wait(400);
      c.check((await c.hash()) === '', 'sliding off a slab before lifting does not open it');
      await c.shot('menu-after-hold');
    }
  },

  options: async (c) => {
    await c.open('', null, 1200);
    // Just below the pill's bottom edge (the pill is 36 units tall): still the pill for a
    // finger, whose target reaches 22 CSS px from the pill's center.
    await c.tap(MENU.options.x, MENU.options.y + 18, 0, Math.max(1, 20 - 18 * c.scale()));
    await c.wait(700);
    await c.shot('options');
    const before = (await c.audio())?.settings as { musicVolume?: number } | undefined;
    const music = await optionsBox(c, 'music');
    if (music !== null) await c.tap(music.x, music.y);
    await c.wait(300);
    const after = (await c.audio())?.settings as { musicVolume?: number } | undefined;
    c.check(
      Math.abs((after?.musicVolume ?? 0) - 0.3) < 0.03,
      `a tap on the music slider sets it (${String(before?.musicVolume)} -> ${String(after?.musicVolume)})`,
    );
    const sfx = await optionsBox(c, 'sfx');
    if (c.cdp !== null && sfx !== null) {
      const ids = await c.touchDown([sfx]);
      for (let i = 1; i <= 6; i++) {
        await c.touchMove([{ x: sfx.x - i * 25, y: sfx.y + 4 }], ids);
        await c.wait(30);
      }
      await c.touchUp();
      await c.wait(200);
      const s = (await c.audio())?.settings as { sfxVolume?: number } | undefined;
      c.check((s?.sfxVolume ?? 1) < 0.35, `dragging the effects slider (${String(s?.sfxVolume)})`);
    }
    await c.shot('options-after-sliders');
    const mute = await optionsBox(c, 'mute');
    if (mute !== null) {
      await c.tap(mute.x, mute.y);
      await c.wait(200);
      const m = (await c.audio())?.settings as { muted?: boolean } | undefined;
      c.check(m?.muted === true, 'the mute toggle by touch');
      await c.tap(mute.x, mute.y);
    }
    const help = await optionsBox(c, 'help');
    if (help !== null) await c.tap(help.x, help.y);
    await c.wait(800);
    await c.shot('help');
    // Done at the bottom of the help panel: the wide panel where 7 CSS px of text needs more
    // than its 9.2 units (help.ts), the original's panel elsewhere; 38 units tall on touch.
    const wide = 7 / c.scale() > 9.2;
    await c.tap(CENTER_X, wide ? 14 + (WORLD_H - 28) - 18 - 19 : 70 + 460 - 18 - 19);
    await c.wait(600);
    const done = await optionsBox(c, 'done');
    if (done !== null) await c.tap(done.x, done.y);
    await c.wait(600);
    await c.shot('options-closed');
  },

  adventure: async (c) => {
    await c.open('', null, 1200);
    await c.tap(MENU.adventure.x, MENU.adventure.y);
    await c.wait(2000);
    await c.shot('intro-typing');
    await c.tap(CENTER_X, 220);
    await c.wait(400);
    await c.shot('intro');
    await c.tap(CENTER_X, WORLD_H - 62 + 18);
    await c.waitPlay();
    await c.waitReady();
    await c.shot('level-start');
    let s = await c.snap();
    const shots0 = Number(s?.shotsTaken ?? 0);
    if (c.cdp !== null) {
      // Fine aim: a drag turns the cannon and does not fire.
      const aim0 = Number(s?.aim);
      const ids = await c.touchDown([{ x: 700, y: 300 }]);
      for (let i = 1; i <= 8; i++) {
        await c.touchMove([{ x: 700 + i * 6, y: 300 }], ids);
        await c.wait(30);
      }
      await c.touchUp();
      await c.wait(500);
      s = await c.snap();
      c.check(Number(s?.shotsTaken) === shots0, 'a drag does not fire');
      c.check(Math.abs(Number(s?.aim) - aim0) > 0.01, 'a drag turns the cannon');
      // Two fingers at once: no shot.
      await c.touchDown([
        { x: 400, y: 300 },
        { x: 700, y: 320 },
      ]);
      await c.wait(80);
      await c.touchUp();
      await c.wait(800);
      s = await c.snap();
      c.check(Number(s?.shotsTaken) === shots0, 'a two-finger tap does not fire');
      // The fast forward button held by a finger runs the game 8x between shots.
      const t0 = Number(s?.ticks);
      await c.wait(1000);
      const t1 = Number((await c.snap())?.ticks);
      await c.touchDown([{ x: 763 + 266.67, y: 566 }]);
      await c.wait(1000);
      const t2 = Number((await c.snap())?.ticks);
      await c.touchUp();
      c.check(
        (t2 - t1) / Math.max(1, t1 - t0) > 4,
        `holding the fast forward button speeds the game up (${t1 - t0} -> ${t2 - t1} ticks/s)`,
      );
    }
    // A tap on the board aims there and fires.
    await c.tap(533, 330);
    s = await c.until((x) => Number(x.shotsTaken) > shots0, 5000);
    c.check(s !== null, 'a tap on the board fires');
    await c.wait(700);
    await c.shot('level-shot');
    // Pause with the menu button, tapped 19 CSS px from its center: outside its round face
    // (radius 25.5 units), inside the finger's 22 CSS px.
    await c.tap(37, 566, 18, -6);
    await c.wait(500);
    s = await c.snap();
    c.check(s?.dialog === 'pause', 'a tap just outside the round menu button pauses');
    await c.shot('pause');
    const pauseY = pauseLayout(c);
    await c.tap(pauseY.options.x, pauseY.options.y);
    await c.wait(700);
    await c.shot('pause-options');
    const done = await optionsBox(c, 'done');
    if (done !== null) await c.tap(done.x, done.y);
    await c.wait(500);
    // Turning the phone upright mid-level pauses; the touches made meanwhile are dropped.
    await c.tap(pauseY.resume.x, pauseY.resume.y);
    await c.wait(400);
    c.check((await c.snap())?.dialog === null, 'Resume by touch');
    await c.rotate(true);
    await c.shot('rotated-upright-mid-level');
    await c.tap(CENTER_X, 300);
    const music = await c.audio();
    await c.rotate(false);
    s = await c.snap();
    c.check(s?.dialog === 'pause', 'turning upright mid-level opens the pause dialog');
    c.check(music?.paused === true, 'and pauses the game audio');
    await c.shot('rotated-back');
    await c.tap(pauseY.resume.x, pauseY.resume.y);
    await c.wait(300);
    // A hidden page pauses as well; audio is suspended until it shows again.
    await c.setHidden(true);
    await c.wait(300);
    const hidden = await c.audio();
    await c.setHidden(false);
    await c.wait(400);
    s = await c.snap();
    c.check(s?.dialog === 'pause', 'a hidden page leaves the level paused');
    c.check(
      hidden?.context === 'suspended',
      `audio suspends while hidden (${String(hidden?.context)})`,
    );
    await c.tap(pauseY.resume.x, pauseY.resume.y);
    await c.wait(500);
    const back = await c.audio();
    c.check(
      back?.context === 'running',
      `audio runs again after a touch (${String(back?.context)})`,
    );
    // A device that keeps up keeps its full resolution (quality.ts steps down only when not).
    const res = await c.page.evaluate(() => {
      const l = (window as unknown as { __teggleLayers?: () => { dpr: number } }).__teggleLayers;
      return { dpr: l?.().dpr ?? 0, device: Math.min(3, window.devicePixelRatio) };
    });
    console.log(`  info resolution: DPR ${res.dpr} of ${res.device}`);
  },

  win: async (c) => {
    await c.open('#/play/campaign/1-1.json?seed=7&orange=3', null, 600);
    await c.waitPlay();
    let slowShot = false;
    for (let n = 0; n < 20; n++) {
      const s = await c.waitReady();
      if (s.dialog === 'complete' || s.dialog === 'failed') break;
      await c.fireAt('best');
      if (!slowShot) {
        const slow = await c.until((x) => x.slowMotion === true || x.phase !== 'shot', 20_000);
        if (slow?.slowMotion === true) {
          slowShot = true;
          await c.wait(500);
          await c.shot('fever-slow-motion');
          await c.tap(CENTER_X, 330);
          await c.wait(150);
          // The camera then zooms back out over 0.26 s; the speed is back at once.
          const after = await c.snap();
          c.check(
            Number(after?.speed) === 1,
            `a tap skips the slow motion (${String(after?.speed)})`,
          );
          await c.wait(1800);
          await c.shot('fever');
        }
      }
    }
    const end = await c.until((x) => x.dialog === 'complete' || x.dialog === 'failed', 60_000);
    c.check(end?.dialog === 'complete', 'the level is won');
    await c.wait(3200);
    await c.shot('level-complete');
    // Play Again, the dialog's one button.
    await c.tap(187 + 133.33 + 425 / 2, 147 + 305 - 52 + 17);
    await c.wait(1000);
    const again = await c.snap();
    c.check(again?.dialog === null && Number(again.tries) === 2, 'Play Again by touch');
  },

  loss: async (c) => {
    await c.open('#/play/campaign/1-1.json?seed=7&balls=2', null, 600);
    await c.waitPlay();
    for (let n = 0; n < 6; n++) {
      const s = await c.waitReady();
      if (s.dialog !== null) break;
      // Nearly flat to one side: lights little and rarely an orange peg.
      await c.fireAt(1.52);
    }
    const end = await c.until((x) => x.dialog === 'failed', 60_000);
    c.check(end !== null, 'the level is lost');
    await c.wait(3200);
    await c.shot('level-failed');
    await c.tap(187 + 133.33 + 425 / 2, 147 + 305 - 52 + 17);
    await c.wait(1000);
    const again = await c.snap();
    c.check(again?.dialog === null && Number(again.tries) === 2, 'Try Again by touch');
  },

  lucky: async (c) => {
    await c.open('#/play/campaign/1-1.json?seed=7&power=luckySpin', null, 600);
    await c.waitPlay();
    for (let n = 0; n < 6; n++) {
      const s = await c.waitReady();
      const before = Number(s.greenHits ?? 0);
      await c.fireAt('green');
      const lit = await c.until((x) => Number(x.greenHits) > before || x.phase !== 'shot', 20_000);
      if (lit !== null && Number(lit.greenHits) > before) {
        await c.until((x) => x.wheel === true, 3000);
        await c.wait(900);
        await c.shot('lucky-spin');
        await c.wait(1700);
        await c.shot('lucky-spin-result');
        return;
      }
    }
    c.check(false, 'a green peg lit for the Lucky Spin');
  },

  quickplay: async (c) => {
    await c.open('#/quickplay', saveThrough(6), 1500);
    await c.tap(26 + 158, 62 + 113);
    await c.wait(400);
    await c.shot('quickplay-selected');
    c.check((await c.hash()) === '#/quickplay', 'the first tap on a level only selects it');
    await c.tap(26 + 158, 62 + 113);
    await c.wait(1500);
    await c.shot('quickplay-picker');
    await c.tap(WORLD_W - 290 + 85, WORLD_H - 70 + 18);
    await c.waitPlay();
    await c.shot('quickplay-level');
    c.check((await c.hash()).startsWith('#/quickplay/'), 'the second tap plays it');
  },
};

/** The pause dialog's touch layout (play/dialogs.ts). */
function pauseLayout(c: Ctx) {
  const target = 44 / c.scale();
  const grown = Math.max(42, Math.min(84, target)) > 42;
  if (!grown) {
    return { resume: { x: CENTER_X, y: 208 + 17 }, options: { x: CENTER_X, y: 266 + 13 } };
  }
  const rowGap = Math.max(target, (40 + 36) / 2 + 24);
  const h = 30 + 20 + rowGap + 18 + 30;
  const y = Math.round(295 - h / 2);
  const w = 3 * 158 + 2 * 14 + 60;
  return {
    resume: { x: CENTER_X, y: y + 50 },
    options: { x: CENTER_X - w / 2 + 30 + 79, y: y + 50 + rowGap },
  };
}

// ---------------------------------------------------------------------------------------------

async function isUp(base: string): Promise<boolean> {
  try {
    const res = await fetch(`${base}/`, { signal: AbortSignal.timeout(1500) });
    return res.ok;
  } catch {
    return false;
  }
}

async function startServer(base: string): Promise<ChildProcess> {
  const child = spawn(
    'npx',
    ['vite', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'],
    { cwd: ROOT, stdio: 'ignore' },
  );
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (await isUp(base)) return child;
    await new Promise((r) => setTimeout(r, 300));
  }
  child.kill();
  throw new Error(`Vite did not come up on port ${PORT} within 30 s.`);
}

async function main(): Promise<void> {
  const filters = process.argv.slice(2);
  const only = (process.env.MOBILE_DEVICES ?? '').split(',').filter((d) => d !== '');
  const base = process.env.TEGGLE_BASE ?? `http://127.0.0.1:${PORT}`;
  let server: ChildProcess | null = null;
  if (process.env.TEGGLE_BASE === undefined && !(await isUp(base))) {
    server = await startServer(base);
  }
  const failures: string[] = [];
  const engines: Record<Device['engine'], BrowserType> = { webkit, chromium };
  try {
    for (const [name, d] of Object.entries(DEVICES)) {
      if (only.length > 0 && !only.includes(name)) continue;
      const descriptor = devices[d.descriptor];
      if (descriptor === undefined) throw new Error(`Unknown device ${d.descriptor}`);
      // Full Chromium in its new headless mode draws canvases on the GPU, as a phone does; the
      // headless shell's software raster would be slow enough at DPR 3 to make the game lower
      // its resolution (src/game/app/quality.ts) in the middle of the screenshots.
      const browser = await engines[d.engine].launch(
        d.engine === 'chromium' ? { channel: 'chromium' } : {},
      );
      const context = await browser.newContext({ ...descriptor });
      await context.addInitScript(recordFullscreen);
      const page = await context.newPage();
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => {
        if (m.type() === 'error' && !m.text().includes('404')) errors.push(m.text());
      });
      const cdp = d.engine === 'chromium' ? await context.newCDPSession(page) : null;
      const c = new Ctx(page, name, base, cdp);
      for (const step of d.steps) {
        if (filters.length > 0 && !filters.includes(step)) continue;
        console.log(`${name}: ${step}`);
        try {
          const run = STEPS[step];
          if (run !== undefined) await run(c);
        } catch (err) {
          c.check(false, `${step} threw: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      for (const e of errors) c.check(false, `page error: ${e}`);
      failures.push(...c.failures);
      await browser.close();
    }
  } finally {
    server?.kill();
  }
  if (failures.length > 0) {
    console.error(`\n${failures.length} failed:\n  ${failures.join('\n  ')}`);
    process.exitCode = 1;
  } else {
    console.log('\nAll touch checks passed.');
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
