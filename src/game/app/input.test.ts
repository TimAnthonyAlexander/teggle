import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CROWD_MS, Input, PALM_CSS } from './input';

// The input layer driven by synthetic pointer events in Node: no DOM, just EventTargets with the
// fields Input reads. iOS Safari gives touches negative pointer ids (seen on an iPhone, spec 14.2,
// play screen); Chromium's are large and Firefox's small, so ids here are anything but 1, 2, 3.

interface PointerInit {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly kind?: 'touch' | 'mouse' | 'pen';
  readonly button?: number;
  readonly size?: number;
}

function pointer(type: string, p: PointerInit): Event {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, {
    pointerId: p.id,
    pointerType: p.kind ?? 'touch',
    clientX: p.x,
    clientY: p.y,
    button: p.button ?? (type === 'pointermove' ? -1 : 0),
    width: p.size ?? 40,
    height: p.size ?? 40,
  });
  return e;
}

class FakeCanvas extends EventTarget {
  readonly captured: number[] = [];
  getBoundingClientRect(): { left: number; top: number } {
    return { left: 0, top: 0 };
  }
  setPointerCapture(id: number): void {
    this.captured.push(id);
  }
}

let now = 1000;
let canvas: FakeCanvas;
let input: Input;

function send(type: string, p: PointerInit): void {
  canvas.dispatchEvent(pointer(type, p));
}

beforeEach(() => {
  vi.stubGlobal('window', new EventTarget());
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  now = 1000;
  canvas = new FakeCanvas();
  input = new Input();
  input.attach(canvas as unknown as HTMLCanvasElement, (x, y) => ({ x, y }));
});

afterEach(() => {
  input.detach();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Input with iOS Safari pointer ids', () => {
  it('tracks a finger whose id is negative from press to release', () => {
    const id = -1257;
    send('pointerdown', { id, x: 100, y: 200 });
    expect(canvas.captured).toEqual([id]);
    expect(input.pointer.down).toBe(true);
    send('pointermove', { id, x: 112, y: 195 });
    send('pointermove', { id, x: 130, y: 190 });
    expect(input.consumeDrag(id)).toEqual({ dx: 30, dy: -10 });
    send('pointermove', { id, x: 131, y: 190 });
    send('pointerup', { id, x: 131, y: 190 });
    const actions = input.consumePointer();
    expect(actions.map((a) => [a.press, a.e.id, a.e.kind, a.e.crowded])).toEqual([
      [true, id, 'touch', false],
      [false, id, 'touch', false],
    ]);
    expect(input.pointer.down).toBe(false);
    expect(input.consumeDrag(id)).toEqual({ dx: 1, dy: 0 });
  });

  it('keeps two negative ids apart: one finger aims, a resting thumb does not crowd it', () => {
    send('pointerdown', { id: -40, x: 20, y: 300 });
    now += CROWD_MS + 200;
    send('pointerdown', { id: -41, x: 500, y: 300 });
    send('pointermove', { id: -40, x: 25, y: 300 });
    send('pointermove', { id: -41, x: 520, y: 310 });
    // Only the aiming finger's drag, and every finger's drag starts over.
    expect(input.consumeDrag(-41)).toEqual({ dx: 20, dy: 10 });
    expect(input.consumeDrag(-40)).toEqual({ dx: 0, dy: 0 });
    send('pointerup', { id: -41, x: 520, y: 310 });
    const actions = input.consumePointer();
    expect(actions.map((a) => [a.press, a.e.id, a.e.crowded])).toEqual([
      [true, -40, false],
      [true, -41, false],
      [false, -41, false],
    ]);
    // The thumb still rests.
    expect(input.pointer.down).toBe(true);
  });

  it('marks negative-id fingers that land together as one gesture', () => {
    send('pointerdown', { id: -7, x: 100, y: 100 });
    now += 40;
    send('pointerdown', { id: -8, x: 200, y: 100 });
    send('pointerup', { id: -7, x: 100, y: 100 });
    send('pointerup', { id: -8, x: 200, y: 100 });
    const actions = input.consumePointer();
    expect(actions.map((a) => [a.press, a.e.id, a.e.crowded])).toEqual([
      [true, -7, false],
      [true, -8, true],
      [false, -7, true],
      [false, -8, true],
    ]);
  });

  it('treats a reused id as a new finger', () => {
    send('pointerdown', { id: -3, x: 10, y: 10 });
    send('pointerup', { id: -3, x: 10, y: 10 });
    now += 2000;
    send('pointerdown', { id: -3, x: 50, y: 60 });
    send('pointermove', { id: -3, x: 55, y: 60 });
    expect(input.consumeDrag(-3)).toEqual({ dx: 5, dy: 0 });
    const actions = input.consumePointer();
    expect(actions.map((a) => [a.press, a.e.x, a.e.crowded])).toEqual([
      [true, 10, false],
      [false, 10, false],
      [true, 50, false],
    ]);
  });

  it('accepts id 0 and huge ids alike', () => {
    for (const id of [0, 2 ** 31 - 1, -(2 ** 31)]) {
      now += 2000;
      send('pointerdown', { id, x: 1, y: 2 });
      send('pointermove', { id, x: 4, y: 6 });
      expect(input.consumeDrag(id)).toEqual({ dx: 3, dy: 4 });
      send('pointerup', { id, x: 4, y: 6 });
    }
    expect(input.consumePointer().map((a) => a.e.id)).toEqual([
      0,
      0,
      2 ** 31 - 1,
      2 ** 31 - 1,
      -(2 ** 31),
      -(2 ** 31),
    ]);
  });

  it('ignores a palm with a negative id, and its release', () => {
    send('pointerdown', { id: -90, x: 300, y: 300, size: PALM_CSS + 10 });
    send('pointermove', { id: -90, x: 340, y: 300, size: PALM_CSS + 10 });
    send('pointerup', { id: -90, x: 340, y: 300, size: PALM_CSS + 10 });
    expect(input.consumePointer()).toEqual([]);
    expect(input.consumeDrag()).toEqual({ dx: 0, dy: 0 });
    expect(input.pointer.down).toBe(false);
  });

  it('reports a canceled negative-id touch as no tap', () => {
    send('pointerdown', { id: -12, x: 300, y: 300 });
    send('pointercancel', { id: -12, x: 300, y: 300 });
    const actions = input.consumePointer();
    expect(actions.map((a) => [a.press, a.e.crowded])).toEqual([
      [true, false],
      [false, true],
    ]);
    expect(input.pointer.down).toBe(false);
  });

  it('holds the fast forward control with a negative id until that finger lifts', () => {
    input.setHoldControl('fastForward', (x) => x > 900);
    send('pointerdown', { id: -5, x: 950, y: 500 });
    expect(input.fastForwardHeld).toBe(true);
    send('pointerdown', { id: -6, x: 100, y: 100 });
    send('pointerup', { id: -6, x: 100, y: 100 });
    expect(input.fastForwardHeld).toBe(true);
    send('pointerup', { id: -5, x: 950, y: 500 });
    expect(input.fastForwardHeld).toBe(false);
    // The control's finger never presses or releases anything else.
    expect(input.consumePointer().map((a) => a.e.id)).toEqual([-6, -6]);
  });
});

describe('Input hover by pointer kind', () => {
  it('drops the hover of a pen that lifts or leaves, as of a mouse, and not of a finger', () => {
    send('pointermove', { id: 3, x: 10, y: 10, kind: 'pen' });
    expect(input.pointer.inside).toBe(true);
    send('pointerleave', { id: 3, x: 10, y: 10, kind: 'pen' });
    expect(input.pointer.inside).toBe(false);
    send('pointermove', { id: 1, x: 10, y: 10, kind: 'mouse' });
    send('pointerleave', { id: 1, x: 10, y: 10, kind: 'mouse' });
    expect(input.pointer.inside).toBe(false);
    send('pointerdown', { id: -2, x: 10, y: 10 });
    send('pointerup', { id: -2, x: 10, y: 10 });
    send('pointerleave', { id: -2, x: 10, y: 10 });
    expect(input.pointer.inside).toBe(true);
    expect(input.pointer.down).toBe(false);
  });
});
