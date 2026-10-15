// Frame times on a phone-sized screen with a slowed CPU (Chromium's 4x CPU throttling), for the
// scenes that cost the most: the main menu, a busy shot, Space Blast, the Lucky Spin wheel and
// the Fever. Each scene's numbers come from the page itself: every requestAnimationFrame
// callback is timed (the loop's ticks and the render, i.e. the script work of a frame) and the
// gaps between frames give the frame rate. The canvas backing store and the layer cache are read
// from the page as well.
//
// Runs its own Vite dev server on port 47913 (never the shared one on 47823) unless TEGGLE_BASE
// names a running server, and stops a server it started.
//
// The browser is full Chromium in its new headless mode, which draws canvases on the GPU as a
// phone's browser does; MOBILE_PERF_GPU=0 uses the headless shell instead, whose software
// raster is a worst case.
//
// Usage: npx tsx tools/mobile-perf.ts [scene ...]
//   MOBILE_PERF_DEVICE  a Playwright device name (default "Galaxy S24 landscape", DPR 3)
//   MOBILE_PERF_RATE    CPU slowdown (default 4; 1 for none)
//   MOBILE_PERF_GPU     0 for the software-raster headless shell

import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';
import { chromium, devices, type Page } from '@playwright/test';

const PORT = 47913;
const ROOT = path.resolve(import.meta.dirname, '..');
const DEVICE = process.env.MOBILE_PERF_DEVICE ?? 'Galaxy S24 landscape';
const RATE = Number(process.env.MOBILE_PERF_RATE ?? '4');
const GPU = process.env.MOBILE_PERF_GPU !== '0';

interface Frames {
  work: number[];
  at: number[];
}

interface Debug {
  snapshot(): Record<string, unknown>;
  pickAim(goal?: 'best' | 'coin' | 'green'): number;
  fire(angle: number, wait?: number): boolean;
}

/** What the page exposes to this tool (the DEV handles and the frame timer). */
interface PerfWindow {
  __frames?: Frames;
  __teggle?: Debug;
  __teggleLayers?: () => { count: number; pixels: number };
}

/** Times every animation frame callback; installed before the page's own scripts run. */
function installFrameTimer(): void {
  const raf = window.requestAnimationFrame.bind(window);
  const frames: Frames = { work: [], at: [] };
  (window as unknown as PerfWindow).__frames = frames;
  window.requestAnimationFrame = (cb: FrameRequestCallback): number =>
    raf((t) => {
      const a = performance.now();
      cb(t);
      frames.work.push(performance.now() - a);
      frames.at.push(a);
      if (frames.work.length > 4000) {
        frames.work.splice(0, 1000);
        frames.at.splice(0, 1000);
      }
    });
}

function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))] ?? 0;
}

interface Result {
  scene: string;
  frames: number;
  fps: number;
  workAvg: number;
  workP95: number;
  workMax: number;
  gapP95: number;
  slow: number;
}

async function measure(page: Page, scene: string, ms: number): Promise<Result> {
  await page.evaluate(() => {
    const f = (window as unknown as PerfWindow).__frames;
    if (f !== undefined) {
      f.work.length = 0;
      f.at.length = 0;
    }
  });
  await page.waitForTimeout(ms);
  const f = await page.evaluate(
    () => (window as unknown as PerfWindow).__frames ?? { work: [], at: [] },
  );
  const gaps = f.at.slice(1).map((t, i) => t - (f.at[i] ?? t));
  const span = (f.at[f.at.length - 1] ?? 0) - (f.at[0] ?? 0);
  const n = f.work.length;
  return {
    scene,
    frames: n,
    fps: span > 0 ? ((n - 1) * 1000) / span : 0,
    workAvg: n > 0 ? f.work.reduce((a, b) => a + b, 0) / n : 0,
    workP95: percentile(f.work, 95),
    workMax: Math.max(0, ...f.work),
    gapP95: percentile(gaps, 95),
    slow: gaps.filter((g) => g > 34).length,
  };
}

async function waitReady(page: Page): Promise<void> {
  await page.waitForFunction(() => document.documentElement.dataset.ready === '1', null, {
    timeout: 60_000,
  });
}

async function waitAim(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const s = (window as unknown as PerfWindow).__teggle?.snapshot();
      return s !== undefined && s.phase === 'aim' && s.ready === true && s.holding !== true;
    },
    null,
    { timeout: 60_000 },
  );
}

/** Opens a play route, finds an aim on a trial copy (unthrottled) and returns it. */
async function playAt(page: Page, base: string, hash: string, goal: 'best' | 'green') {
  await page.goto(`${base}/?s=${Date.now()}${hash}`);
  await waitReady(page);
  await waitAim(page);
  await page.waitForTimeout(800);
  return page.evaluate((g) => {
    const d = (window as unknown as PerfWindow).__teggle;
    if (d === undefined) return 0;
    const a = d.pickAim(g);
    return Number.isNaN(a) ? d.pickAim('best') : a;
  }, goal);
}

async function fire(page: Page, angle: number): Promise<void> {
  await page.evaluate((a) => (window as unknown as PerfWindow).__teggle?.fire(a, 0), angle);
}

/** Waits until the play screen's snapshot field `key` is `value` (or above 0 for 'positive'). */
async function until(page: Page, key: string, value: unknown): Promise<void> {
  await page.waitForFunction(
    ([k, v]) => {
      const s = (window as unknown as PerfWindow).__teggle?.snapshot();
      if (s === undefined) return false;
      return v === 'positive' ? Number(s[k]) > 0 : s[k] === v;
    },
    [key, value] as const,
    { timeout: 30_000 },
  );
}

type Scene = (
  page: Page,
  base: string,
  throttle: (on: boolean) => Promise<void>,
) => Promise<Result>;

const LEVEL = '#/play/campaign/1-1.json?seed=7';
/**
 * Time on the slowed CPU before a scene starts: the steady state, after the phone resolution cap
 * (src/game/app/quality.ts: 3 s to settle, 1.5 s to judge) has had its chance to act.
 */
const WARM_MS = 6000;

const SCENES: Record<string, Scene> = {
  menu: async (page, base, throttle) => {
    await page.goto(`${base}/?s=${Date.now()}`);
    await waitReady(page);
    await page.waitForTimeout(1500);
    await throttle(true);
    await page.waitForTimeout(WARM_MS);
    return measure(page, 'menu', 5000);
  },
  shot: async (page, base, throttle) => {
    const a = await playAt(page, base, LEVEL, 'best');
    await throttle(true);
    await page.waitForTimeout(WARM_MS);
    await fire(page, a);
    return measure(page, 'busy shot', 4000);
  },
  spaceBlast: async (page, base, throttle) => {
    const a = await playAt(page, base, `${LEVEL}&power=spaceBlast`, 'green');
    await throttle(true);
    await page.waitForTimeout(WARM_MS);
    await fire(page, a);
    await until(page, 'greenHits', 'positive');
    return measure(page, 'space blast', 3000);
  },
  luckySpin: async (page, base, throttle) => {
    const a = await playAt(page, base, `${LEVEL}&power=luckySpin`, 'green');
    await throttle(true);
    await page.waitForTimeout(WARM_MS);
    await fire(page, a);
    await until(page, 'wheel', true);
    return measure(page, 'lucky spin', 2600);
  },
  fever: async (page, base, throttle) => {
    const a = await playAt(page, base, `${LEVEL}&orange=1`, 'best');
    await throttle(true);
    await page.waitForTimeout(WARM_MS);
    await fire(page, a);
    await until(page, 'slowMotion', true);
    return measure(page, 'fever', 7000);
  },
};

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

function row(r: Result): string {
  const f = (v: number) => v.toFixed(1).padStart(6);
  return `${r.scene.padEnd(12)} ${String(r.frames).padStart(6)} ${f(r.fps)} ${f(r.workAvg)} ${f(r.workP95)} ${f(r.workMax)} ${f(r.gapP95)} ${String(r.slow).padStart(6)}`;
}

async function main(): Promise<void> {
  const filters = process.argv.slice(2);
  const base = process.env.TEGGLE_BASE ?? `http://127.0.0.1:${PORT}`;
  let server: ChildProcess | null = null;
  if (process.env.TEGGLE_BASE === undefined && !(await isUp(base))) {
    server = await startServer(base);
  }
  const descriptor = devices[DEVICE];
  if (descriptor === undefined) throw new Error(`Unknown device "${DEVICE}".`);
  const browser = await chromium.launch(GPU ? { channel: 'chromium' } : {});
  try {
    console.log(`${DEVICE}, CPU slowdown ${RATE}x, ${GPU ? 'GPU canvas' : 'software raster'}`);
    console.log('scene        frames    fps  work   p95    max  gap95  >34ms   (ms)');
    for (const [name, scene] of Object.entries(SCENES)) {
      if (filters.length > 0 && !filters.includes(name)) continue;
      const context = await browser.newContext({ ...descriptor });
      await context.addInitScript(installFrameTimer);
      const page = await context.newPage();
      page.on('pageerror', (e) => {
        console.error(`  page error: ${e.message}`);
      });
      const cdp = await context.newCDPSession(page);
      const throttle = async (on: boolean): Promise<void> => {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: on ? RATE : 1 });
      };
      const r = await scene(page, base, throttle);
      const memory = await page.evaluate(() => {
        const c = document.getElementById('game');
        const canvas = c instanceof HTMLCanvasElement ? `${c.width}x${c.height}` : '?';
        const l = (window as unknown as PerfWindow).__teggleLayers?.();
        return l === undefined
          ? canvas
          : `${canvas}, ${l.count} layers ${(l.pixels / 1e6).toFixed(1)} Mpx`;
      });
      console.log(`${row(r)}   ${memory}`);
      await context.close();
    }
  } finally {
    await browser.close();
    server?.kill();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
