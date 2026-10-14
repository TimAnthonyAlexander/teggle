// Pointer, wheel and keyboard input, normalized to world coordinates (spec 4 and 14.1).
//
// - Mouse, pen and touch all report a world-space pointer and press/release events.
// - Mouse wheel notches and held arrow keys are exposed for fine aim; touch drags are
//   accumulated as world-space deltas so the game can apply them at reduced sensitivity.
// - "Fast forward held" is true while the right mouse button is down or while any pointer holds
//   an on-screen hold control (the touch equivalent of the right button).

export type PointerKind = 'mouse' | 'pen' | 'touch';

export interface PointerEventInfo {
  readonly x: number;
  readonly y: number;
  readonly kind: PointerKind;
  readonly button: number;
  readonly id: number;
}

export type WorldMapper = (cssX: number, cssY: number) => { x: number; y: number };

interface HoldControl {
  readonly id: string;
  readonly hit: (x: number, y: number) => boolean;
}

const AIM_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

function kindOf(e: PointerEvent): PointerKind {
  return e.pointerType === 'touch' ? 'touch' : e.pointerType === 'pen' ? 'pen' : 'mouse';
}

/** Event queues keep at most this many entries, so a screen that ignores them cannot grow them. */
const MAX_QUEUED = 32;

function enqueue<T>(queue: T[], item: T): void {
  queue.push(item);
  if (queue.length > MAX_QUEUED) queue.shift();
}

export class Input {
  /** Last known pointer position in world units. */
  readonly pointer = { x: 0, y: 0, kind: 'mouse' as PointerKind, inside: false, down: false };
  private canvas: HTMLCanvasElement | null = null;
  private toWorld: WorldMapper = (x, y) => ({ x, y });
  private readonly holdControls: HoldControl[] = [];
  private readonly heldBy = new Map<number, string>();
  private readonly downPointers = new Map<number, { x: number; y: number }>();
  private rightDown = false;
  private wheel = 0;
  private dragX = 0;
  private dragY = 0;
  private readonly keys = new Set<string>();
  private readonly presses: PointerEventInfo[] = [];
  private readonly releases: PointerEventInfo[] = [];
  private readonly keyPresses: string[] = [];
  private readonly firstTouchListeners: (() => void)[] = [];
  private sawTouch = false;

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
    this.canvas = null;
  }

  /** Registers an on-screen control that sets "fast forward held" (or any hold) while pressed. */
  setHoldControl(id: string, hit: (x: number, y: number) => boolean): void {
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

  /** Accumulated touch drag in world units since the last call. */
  consumeDrag(): { dx: number; dy: number } {
    const d = { dx: this.dragX, dy: this.dragY };
    this.dragX = 0;
    this.dragY = 0;
    return d;
  }

  /** Presses that did not land on a hold control, oldest first. */
  consumePresses(): PointerEventInfo[] {
    return this.presses.splice(0, this.presses.length);
  }

  consumeReleases(): PointerEventInfo[] {
    return this.releases.splice(0, this.releases.length);
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
    this.dragX = 0;
    this.dragY = 0;
  }

  private info(e: PointerEvent): PointerEventInfo {
    const c = this.canvas;
    const r = c?.getBoundingClientRect();
    const p = this.toWorld(e.clientX - (r?.left ?? 0), e.clientY - (r?.top ?? 0));
    return { x: p.x, y: p.y, kind: kindOf(e), button: e.button, id: e.pointerId };
  }

  private track(p: PointerEventInfo): void {
    this.pointer.x = p.x;
    this.pointer.y = p.y;
    this.pointer.kind = p.kind;
    this.pointer.inside = true;
  }

  private readonly onPointerDown = (e: PointerEvent): void => {
    const p = this.info(e);
    this.track(p);
    try {
      this.canvas?.setPointerCapture(e.pointerId);
    } catch {
      // Capture is a convenience; some synthetic events cannot be captured.
    }
    if (p.kind === 'mouse' && e.button === 2) {
      this.rightDown = true;
      e.preventDefault();
      return;
    }
    const control = this.holdControls.find((c) => c.hit(p.x, p.y));
    if (control !== undefined) {
      this.heldBy.set(e.pointerId, control.id);
      e.preventDefault();
      return;
    }
    if (e.button !== 0) return;
    this.pointer.down = true;
    this.downPointers.set(e.pointerId, { x: p.x, y: p.y });
    enqueue(this.presses, p);
    e.preventDefault();
  };

  private readonly onPointerMove = (e: PointerEvent): void => {
    const p = this.info(e);
    const last = this.downPointers.get(e.pointerId);
    if (last !== undefined && p.kind === 'touch') {
      this.dragX += p.x - last.x;
      this.dragY += p.y - last.y;
      this.downPointers.set(e.pointerId, { x: p.x, y: p.y });
    }
    if (!this.heldBy.has(e.pointerId)) this.track(p);
  };

  private readonly onPointerUp = (e: PointerEvent): void => {
    const p = this.info(e);
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
      enqueue(this.releases, p);
      this.pointer.down = this.downPointers.size > 0;
    }
  };

  private readonly onPointerLeave = (e: PointerEvent): void => {
    if (kindOf(e) === 'mouse') this.pointer.inside = false;
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
    this.keys.clear();
    this.rightDown = false;
    this.heldBy.clear();
    this.downPointers.clear();
    this.pointer.down = false;
  };
}
