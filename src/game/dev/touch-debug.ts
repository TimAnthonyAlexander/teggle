// A touch timeline for debugging input on a real phone. Enabled by `touchdebug=1` in
// the hash query, in any build (src/main.ts). It listens on the window in the capture phase,
// so it sees every event before the game does and changes nothing, and counts animation frames
// separately from the game's loop. Each finger's hold is summarized when it lifts, in a small
// text box that ignores touches: how long the hold was, how many pointer and touch events came
// during it and when, and how many animation frames ran, so a browser that stops drawing or
// holds back events while a finger is down shows up in the numbers.

interface Hold {
  readonly id: number;
  readonly downAt: number;
  readonly framesAtDown: number;
  readonly pointerType: string;
  moves: number;
  firstMoveAt: number;
  lastMoveAt: number;
  touchMoves: number;
  resizes: number;
  maxFrameGap: number;
  lastFrameAt: number;
}

export function installTouchDebug(): void {
  const box = document.createElement('pre');
  box.style.cssText =
    'position:fixed;left:6px;top:6px;z-index:10;margin:0;padding:6px 8px;max-width:60vw;' +
    'font:11px/1.35 ui-monospace,Menlo,monospace;color:#fff;background:rgba(0,0,0,0.72);' +
    'pointer-events:none;white-space:pre-wrap;border-radius:6px';
  box.textContent = 'touch debug: hold a finger on the board, move it, lift it';
  document.body.appendChild(box);

  let frames = 0;
  let lastFrame = performance.now();
  const holds = new Map<number, Hold>();
  const counts: Record<string, number> = {};
  const lines: string[] = [];

  const frame = (t: number): void => {
    frames++;
    for (const h of holds.values()) {
      h.maxFrameGap = Math.max(h.maxFrameGap, t - h.lastFrameAt);
      h.lastFrameAt = t;
    }
    lastFrame = t;
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  const count = (type: string): void => {
    counts[type] = (counts[type] ?? 0) + 1;
  };

  const show = (): void => {
    const totals = Object.entries(counts)
      .map(([k, v]) => `${k} ${String(v)}`)
      .join(', ');
    box.textContent = [...lines.slice(-6), `totals: ${totals}`].join('\n');
  };

  const opts = { capture: true, passive: true } as const;
  window.addEventListener(
    'pointerdown',
    (e) => {
      count(`pointerdown:${e.pointerType}`);
      const now = performance.now();
      holds.set(e.pointerId, {
        id: e.pointerId,
        downAt: now,
        framesAtDown: frames,
        pointerType: e.pointerType,
        moves: 0,
        firstMoveAt: -1,
        lastMoveAt: -1,
        touchMoves: 0,
        resizes: 0,
        maxFrameGap: now - lastFrame,
        lastFrameAt: lastFrame,
      });
      lines.push(
        `down #${String(e.pointerId)} ${e.pointerType} at ${now.toFixed(0)} size ` +
          `${e.width.toFixed(0)}x${e.height.toFixed(0)} (event ${(now - e.timeStamp).toFixed(0)} ms late)`,
      );
      show();
    },
    opts,
  );
  window.addEventListener(
    'pointermove',
    (e) => {
      count(`pointermove:${e.pointerType}`);
      const h = holds.get(e.pointerId);
      if (h === undefined) return;
      const t = performance.now() - h.downAt;
      h.moves++;
      if (h.firstMoveAt < 0) h.firstMoveAt = t;
      h.lastMoveAt = t;
    },
    opts,
  );
  const end = (e: PointerEvent): void => {
    count(`${e.type}:${e.pointerType}`);
    const h = holds.get(e.pointerId);
    if (h === undefined) return;
    holds.delete(e.pointerId);
    const now = performance.now();
    lines.push(
      `${e.type} #${String(h.id)} after ${(now - h.downAt).toFixed(0)} ms: ` +
        `${String(h.moves)} pointermoves (first ${h.firstMoveAt.toFixed(0)}, last ` +
        `${h.lastMoveAt.toFixed(0)} ms), ${String(h.touchMoves)} touchmoves, ` +
        `${String(frames - h.framesAtDown)} frames (longest gap ${h.maxFrameGap.toFixed(0)} ms), ` +
        `${String(h.resizes)} resizes`,
    );
    show();
  };
  window.addEventListener('pointerup', end, opts);
  window.addEventListener('pointercancel', end, opts);
  for (const type of ['touchstart', 'touchend', 'touchcancel'] as const) {
    window.addEventListener(
      type,
      () => {
        count(type);
      },
      opts,
    );
  }
  window.addEventListener(
    'touchmove',
    () => {
      count('touchmove');
      for (const h of holds.values()) h.touchMoves++;
    },
    opts,
  );
  const resized = (): void => {
    count('resize');
    for (const h of holds.values()) h.resizes++;
  };
  window.addEventListener('resize', resized, opts);
  window.visualViewport?.addEventListener('resize', resized);
  window.visualViewport?.addEventListener('scroll', () => {
    count('viewportScroll');
  });
}
