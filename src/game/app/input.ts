// Pointer, wheel and keyboard input, normalized to world coordinates (spec 4 and 14.1).
//
// - Mouse, pen and touch all report a world-space pointer and press/release events.
// - Mouse wheel notches and held arrow keys are exposed for fine aim; touch drags are
//   accumulated per finger as world-space deltas so the game can apply them at reduced
//   sensitivity.
// - "Fast forward held" is true while the right mouse button is down or while any pointer holds
//   an on-screen hold control (the touch equivalent of the right button).
// - Touch screens (spec 14.2, mobile pass): fingers that land within CROWD_MS of each other are
//   one multi-finger gesture, and their presses and releases say so (`crowded`), so a
//   two-finger tap or a pinch never counts as a tap; a contact wider than PALM_CSS is a palm and
//   is ignored. The page itself never scrolls, zooms or bounces under the game.

export type PointerKind = 'mouse' | 'pen' | 'touch';

export interface PointerEventInfo {
  readonly x: number;
  readonly y: number;
  readonly kind: PointerKind;
  readonly button: number;
  readonly id: number;
  /**
   * Touch only: another finger landed within CROWD_MS of this one while both were down (on a
   * release: at any time during this touch).
   */
  readonly crowded: boolean;
  /** Order of arrival among all presses and releases. */
  readonly seq: number;
}

/** A press or a release, for handling both in the order they happened. */
export interface PointerAction {
  readonly press: boolean;
  readonly e: PointerEventInfo;
}

export type WorldMapper = (cssX: number, cssY: number) => { x: number; y: number };

/** Hit test of an on-screen hold control; `kind` lets touch use a larger target. */
export type HoldHit = (x: number, y: number, kind: PointerKind) => boolean;

interface HoldControl {
  readonly id: string;
  readonly hit: HoldHit;
}

interface TouchState {
  readonly downAt: number;
  crowded: boolean;
}

const AIM_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/** Fingers landing this close together in time are one gesture (a tap lasts up to 350 ms). */
export const CROWD_MS = 350;
/** A touch contact at least this wide or tall (CSS px) is a palm or a resting hand, not a finger. */
export const PALM_CSS = 110;

function kindOf(e: PointerEvent): PointerKind {
  return e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
}

/** A touch contact reported at palm size; browsers that report no size (0 or 1) never match. */
export function isPalm(kind: PointerKind, width: number, height: number): boolean {
  return kind === 'touch' && Math.max(width || 0, height || 0) >= PALM_CSS;
}

/** Event queues keep at most this many entries, so a screen that ignores them cannot grow them. */
const MAX_QUEUED = 32;

function enqueue<T>(queue: T[], item: T): void {
  queue.push(item);
  if (queue.length > MAX_QUEUED) queue.shift();
}

function preventDefault(e: Event): void {
  if (e.cancelable) e.preventDefault();
}

/** Page gestures a touch screen must not get: Safari's pinch and rubber-band scroll. */
const PAGE_GESTURES = ['gesturestart', 'gesturechange', 'gestureend', 'touchmove'] as const;

export class Input {
  /** Last known pointer position in world units. */
  readonly pointer = { x: 0, y: 0, kind: 'mouse' as PointerKind, inside: false, down: false };
  private canvas: HTMLCanvasElement | null = null;
  private toWorld: WorldMapper = (x, y) => ({ x, y });
  private readonly holdControls: HoldControl[] = [];
  private readonly heldBy = new Map<number, string>();
  private readonly downPointers = new Map<number, { x: number; y: number }>();
  private readonly touches = new Map<number, TouchState>();
  private readonly palms = new Set<number>();
  private readonly drags = new Map<number, { dx: number; dy: number }>();
  private rightDown = false;
  private wheel = 0;
  private readonly keys = new Set<string>();
  private readonly presses: PointerEventInfo[] = [];
  private readonly releases: PointerEventInfo[] = [];
  private readonly keyPresses: string[] = [];
  private readonly firstTouchListeners: (() => void)[] = [];
  private sawTouch = false;
  private seq = 0;
  private pageGestures = false;

  attach(canvas: HTMLCanvasElement, toWorld: WorldMapper): void {
    this.detach();
    this.canvas = canvas;
    this.toWorld = toWorld;
    canvas.addEventListener('pointerdown', this.onPointerDown);
    canvas.addEventListener('pointermove', this.onPointerMove);
    canvas.addEventListener('pointerup', this.onPointerUp);
    canvas.addEventListener('pointercancel', this.onPointerUp);
    canvas.addEventListener('pointerleave', this.onPointerLeave);
    canvas.addEventListener('wheel', this.onWheel, { passive: false });
    canvas.addEventListener('contextmenu', this.onContextMenu);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
  }

  /**
   * On a touch screen: iPhone Safari ignores user-scalable=no, so its pinch (gesture events)
   * and its rubber-band scroll (touchmove) are refused here too; `touch-action: none` on the
   * page covers the rest. Not on a desktop, where a trackpad pinch stays the browser's zoom.
   */
  blockPageGestures(): void {
    if (this.pageGestures) return;
    this.pageGestures = true;
    for (const type of PAGE_GESTURES) {
      document.addEventListener(type, preventDefault, { passive: false });
    }
  }

  detach(): void {
    const c = this.canvas;
    if (c === null) return;
    c.removeEventListener('pointerdown', this.onPointerDown);
    c.removeEventListener('pointermove', this.onPointerMove);
    c.removeEventListener('pointerup', this.onPointerUp);
    c.removeEventListener('pointercancel', this.onPointerUp);
    c.removeEventListener('pointerleave', this.onPointerLeave);
    c.removeEventListener('wheel', this.onWheel);
    c.removeEventListener('contextmenu', this.onContextMenu);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    if (this.pageGestures) {
      for (const type of PAGE_GESTURES) document.removeEventListener(type, preventDefault);
      this.pageGestures = false;
    }
    this.canvas = null;
  }

  /** Registers an on-screen control that sets "fast forward held" (or any hold) while pressed. */
  setHoldControl(id: string, hit: HoldHit): void {
    this.removeHoldControl(id);
    this.holdControls.push({ id, hit });
  }

  removeHoldControl(id: string): void {
    const i = this.holdControls.findIndex((c) => c.id === id);
    if (i >= 0) this.holdControls.splice(i, 1);
    for (const [pointerId, held] of this.heldBy) if (held === id) this.heldBy.delete(pointerId);
  }

  isHeld(id: string): boolean {
    for (const held of this.heldBy.values()) if (held === id) return true;
    return false;
  }

  /** Right mouse button, or the on-screen fast forward control (spec 4, 14.1). */
  get fastForwardHeld(): boolean {
    return this.rightDown || this.isHeld('fastForward');
  }

  /** Wheel notches since the last call; positive is wheel down. */
  consumeWheel(): number {
    const n = this.wheel;
    this.wheel = 0;
    return n;
  }

  /** -1, 0 or 1 from the held arrow keys (left or up is -1). */
  get arrowAxis(): number {
    const neg = this.keys.has('ArrowLeft') || this.keys.has('ArrowUp') ? 1 : 0;
    const pos = this.keys.has('ArrowRight') || this.keys.has('ArrowDown') ? 1 : 0;
    return pos - neg;
  }

  /**
   * Touch drag in world units since the last call: of finger `id`, or of all fingers together
   * when no id is given. Every finger's drag starts over.
   */
  consumeDrag(id?: number): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    for (const [pointerId, d] of this.drags) {
      if (id !== undefined && pointerId !== id) continue;
      dx += d.dx;
      dy += d.dy;
    }
    this.drags.clear();
    return { dx, dy };
  }

  /** Presses that did not land on a hold control, oldest first. */
  consumePresses(): PointerEventInfo[] {
    return this.presses.splice(0, this.presses.length);
  }

  consumeReleases(): PointerEventInfo[] {
    return this.releases.splice(0, this.releases.length);
  }

  /**
   * Presses and releases together, in the order they happened: two quick taps that arrive in
   * one frame (a slow frame on a phone) stay two clicks.
   */
  consumePointer(): PointerAction[] {
    const out: PointerAction[] = [];
    const presses = this.consumePresses();
    const releases = this.consumeReleases();
    let i = 0;
    let j = 0;
    while (i < presses.length || j < releases.length) {
      const p = presses[i];
      const r = releases[j];
      if (p !== undefined && (r === undefined || p.seq < r.seq)) {
        out.push({ press: true, e: p });
        i++;
      } else if (r !== undefined) {
        out.push({ press: false, e: r });
        j++;
      }
    }
    return out;
  }

  /** Key codes pressed since the last call (KeyboardEvent.code). */
  consumeKeys(): string[] {
    return this.keyPresses.splice(0, this.keyPresses.length);
  }

  isKeyDown(code: string): boolean {
    return this.keys.has(code);
  }

  /** Runs once when the first touch ends, inside the user gesture (fullscreen needs one). */
  onFirstTouch(listener: () => void): void {
    if (this.sawTouch) return;
    this.firstTouchListeners.push(listener);
  }

  /** Drops queued events, for example when the screen changes. */
  clearQueues(): void {
    this.presses.length = 0;
    this.releases.length = 0;
    this.keyPresses.length = 0;
    this.wheel = 0;
    this.drags.clear();
  }

  /** Forgets every held key, button and finger (the window lost focus, the page was hidden). */
  reset(): void {
    this.keys.clear();
    this.rightDown = false;
    this.heldBy.clear();
    this.downPointers.clear();
    this.touches.clear();
    this.palms.clear();
    this.drags.clear();
    this.pointer.down = false;
  }

  private info(e: PointerEvent, crowded: boolean): PointerEventInfo {
    const c = this.canvas;
    const r = c?.getBoundingClientRect();
    const p = this.toWorld(e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
    return {
      x: p.x,
      y: p.y,
      kind: kindOf(e),
      button: e.button,
      id: e.pointerId,
      crowded,
      seq: ++this.seq,
    };
  }

  private track(p: PointerEventInfo): void {
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.kind = p.kind;
    this.pointer.inside = true;
  }

  /** Marks a new finger and every finger that landed shortly before it as one gesture. */
  private landTouch(id: number, at: number): boolean {
    let crowded = false;
    for (const t of this.touches.values()) {
      if (at - t.downAt < CROWD_MS) {
        t.crowded = true;
        crowded = true;
      }
    }
    this.touches.set(id, { downAt: at, crowded });
    return crowded;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const kind = kindOf(e);
    if (isPalm(kind, e.width, e.height)) {
      this.palms.add(e.pointerId);
      e.preventDefault();
      return;
    }
    const p = this.info(e, false);
    this.track(p);
    try {
      this.canvas?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a convenience; some synthetic events cannot be captured.
    }
    if (kind === 'mouse' && e.button === 2) {
      this.rightDown = true;
      e.preventDefault();
      return;
    }
    const control = this.holdControls.find((c) => c.hit(p.x, p.y, kind));
    if (control !== undefined) {
      this.heldBy.set(e.pointerId, control.id);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    const crowded = kind === 'touch' && this.landTouch(e.pointerId, performance.now());
    this.pointer.down = true;
    this.downPointers.set(e.pointerId, { x: p.x, y: p.y });
    enqueue(this.presses, crowded ? { ...p, crowded } : p);
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    if (this.palms.has(e.pointerId)) return;
    const p = this.info(e, false);
    const last = this.downPointers.get(e.pointerId);
    if (last !== undefined && p.kind === 'touch') {
      const d = this.drags.get(e.pointerId) ?? { dx: 0, dy: 0 };
      d.dx += p.x - last.x;
      d.dy += p.y - last.y;
      this.drags.set(e.pointerId, d);
      this.downPointers.set(e.pointerId, { x: p.x, y: p.y });
    }
    if (!this.heldBy.has(e.pointerId)) this.track(p);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    if (this.palms.delete(e.pointerId)) return;
    const touch = this.touches.get(e.pointerId);
    this.touches.delete(e.pointerId);
    const p = this.info(e, touch?.crowded ?? false);
    // A touch's pointerup is the first event that grants user activation, which fullscreen needs.
    if (p.kind === 'touch' && !this.sawTouch && e.type === 'pointerup') {
      this.sawTouch = true;
      for (const l of this.firstTouchListeners.splice(0)) l();
    }
    if (p.kind === 'mouse' && e.button === 2) {
      this.rightDown = false;
      return;
    }
    if (this.heldBy.delete(e.pointerId)) return;
    if (this.downPointers.delete(e.pointerId)) {
      // A cancelled touch (the system took it, or a palm) is no tap: it reports as crowded.
      enqueue(this.releases, e.type === 'pointercancel' ? { ...p, crowded: true } : p);
      this.pointer.down = this.downPointers.size > 0;
    }
  };

  private readonly onPointerLeave = (e: PointerEvent): void => {
    // A pen that lifts or leaves its hover range must not leave a hover state behind, as a mouse
    // that leaves does not. A finger's leave follows every lift; the screens judge it by `down`.
    if (kindOf(e) !== 'touch') this.pointer.inside = false;
  };

  private readonly onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    // One notch is about 100 px in pixel mode and 3 lines in line mode.
    const unit = e.deltaMode === 1 ? 3 : e.deltaMode === 2 ? 1 : 100;
    const notches = e.deltaY / unit;
    this.wheel += Math.abs(notches) < 1 ? Math.sign(notches) : Math.round(notches);
  };

  private readonly onContextMenu = (e: Event): void => {
    e.preventDefault();
  };

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (AIM_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) enqueue(this.keyPresses, e.code);
    this.keys.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private readonly onBlur = (): void => {
    this.reset();
  };
}
