import { describe, expect, it } from 'vitest';
import { BuildSwitch, levelBusy, maySwitch, type PageState } from './offline';

function harness(initial: PageState) {
  let state = initial;
  const posted: unknown[] = [];
  let reloads = 0;
  const gate = new BuildSwitch(
    () => state,
    () => {
      reloads++;
    },
  );
  const worker = {
    postMessage: (m: unknown) => {
      posted.push(m);
    },
  };
  return {
    gate,
    worker,
    posted,
    reloads: () => reloads,
    set: (s: PageState) => {
      state = s;
    },
  };
}

const IDLE: PageState = { navigating: false, busy: false };
const BUSY: PageState = { navigating: false, busy: true };
const LOADING: PageState = { navigating: true, busy: false };

describe('maySwitch', () => {
  it('allows a switch only with no route loading and nothing on show to lose', () => {
    expect(maySwitch(IDLE)).toBe(true);
    expect(maySwitch(BUSY)).toBe(false);
    expect(maySwitch(LOADING)).toBe(false);
    expect(maySwitch({ navigating: true, busy: true })).toBe(false);
  });
});

describe('levelBusy', () => {
  it('is idle before the first shot: a fresh deep link, a reload, the next level', () => {
    expect(levelBusy(false, false)).toBe(false);
  });

  it('is busy from the first shot on, through the pause and end dialogs', () => {
    expect(levelBusy(true, false)).toBe(true);
  });

  it('is busy on a challenge level after the first, which a reload would end', () => {
    expect(levelBusy(false, true)).toBe(true);
    expect(levelBusy(true, true)).toBe(true);
  });
});

describe('BuildSwitch', () => {
  it('lets a waiting build take over at once when the page is idle (a fresh deep link)', () => {
    const h = harness(IDLE);
    h.gate.offer(h.worker);
    expect(h.posted).toEqual(['activate']);
    expect(h.reloads()).toBe(0);
    h.gate.controllerChanged();
    expect(h.reloads()).toBe(1);
  });

  it('waits through a level in play and switches on the next screen that holds nothing', () => {
    const h = harness(BUSY);
    h.gate.offer(h.worker);
    h.gate.check();
    expect(h.posted).toEqual([]);
    // The end dialog's button: the next route loads, the old screen is still on show.
    h.set(LOADING);
    h.gate.check();
    expect(h.posted).toEqual([]);
    // The next level is shown before its first shot.
    h.set(IDLE);
    h.gate.check();
    expect(h.posted).toEqual(['activate']);
  });

  it('asks the waiting build once', () => {
    const h = harness(IDLE);
    h.gate.offer(h.worker);
    h.gate.check();
    h.gate.check();
    expect(h.posted).toEqual(['activate']);
  });

  it('asks the newest of two waiting builds', () => {
    const h = harness(BUSY);
    const older: unknown[] = [];
    h.gate.offer({
      postMessage: (m: unknown) => {
        older.push(m);
      },
    });
    h.gate.offer(h.worker);
    h.set(IDLE);
    h.gate.check();
    expect(older).toEqual([]);
    expect(h.posted).toEqual(['activate']);
  });

  it('does nothing without a waiting build', () => {
    const h = harness(IDLE);
    h.gate.check();
    expect(h.posted).toEqual([]);
    expect(h.reloads()).toBe(0);
  });

  it('defers the reload when another tab let the new build take over mid-level', () => {
    const h = harness(BUSY);
    h.gate.controllerChanged();
    expect(h.reloads()).toBe(0);
    h.set(LOADING);
    h.gate.check();
    expect(h.reloads()).toBe(0);
    h.set(IDLE);
    h.gate.check();
    h.gate.check();
    expect(h.reloads()).toBe(1);
  });

  it('reloads only once the page is idle even after it asked', () => {
    const h = harness(IDLE);
    h.gate.offer(h.worker);
    // A shot left the cannon between asking and the new build taking over.
    h.set(BUSY);
    h.gate.controllerChanged();
    expect(h.reloads()).toBe(0);
    h.set(IDLE);
    h.gate.check();
    expect(h.reloads()).toBe(1);
  });
});
