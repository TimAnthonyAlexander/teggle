// Click handling shared by the menus: a button fires when a press and its release both land on
// it, hover shows only for a mouse or pen, and moving onto a button plays the hover sound once.

import type { Input } from '../app/input';
import { hoverCue } from '../audio/cues';
import type { Box } from '../layout';
import type { ButtonState } from '../ui/controls';

export interface UiButton<A> {
  readonly action: A;
  readonly box: Box;
  /** Hit as the circle inscribed in the box instead of the box. */
  readonly round?: boolean;
  enabled: boolean;
}

function inside(b: UiButton<unknown>, x: number, y: number): boolean {
  const { box } = b;
  if (b.round === true) {
    const r = Math.min(box.w, box.h) / 2;
    const dx = x - (box.x + box.w / 2);
    const dy = y - (box.y + box.h / 2);
    return dx * dx + dy * dy <= r * r;
  }
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

export class ButtonSet<A> {
  private pressed = -1;

  constructor(readonly items: UiButton<A>[]) {}

  /** The enabled button under (x, y), or -1. */
  at(x: number, y: number): number {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const b = this.items[i];
      if (b !== undefined && b.enabled && inside(b, x, y)) return i;
    }
    return -1;
  }

  /** The button under (x, y), enabled or not, or -1 (for showing why one is disabled). */
  any(x: number, y: number): number {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const b = this.items[i];
      if (b !== undefined && inside(b, x, y)) return i;
    }
    return -1;
  }

  find(action: A): UiButton<A> | undefined {
    return this.items.find((b) => b.action === action);
  }

  press(x: number, y: number): void {
    this.pressed = this.at(x, y);
  }

  /** The action of a click released on the button it was pressed on, or null. */
  release(x: number, y: number): A | null {
    const i = this.at(x, y);
    const p = this.pressed;
    this.pressed = -1;
    if (i < 0 || i !== p) return null;
    return this.items[i]?.action ?? null;
  }

  /** Feeds this frame's presses and releases; returns the actions clicked, oldest first. */
  handle(input: Input, dx = 0, dy = 0): A[] {
    const out: A[] = [];
    for (const p of input.consumePresses()) this.press(p.x - dx, p.y - dy);
    for (const r of input.consumeReleases()) {
      const a = this.release(r.x - dx, r.y - dy);
      if (a !== null) out.push(a);
    }
    return out;
  }

  /** The state to draw button `i` in, with the hover sound as the pointer moves onto it. */
  state(i: number, input: Input, dx = 0, dy = 0): ButtonState {
    const b = this.items[i];
    if (b === undefined) return 'normal';
    if (!b.enabled) return 'disabled';
    const p = input.pointer;
    const touch = p.kind === 'touch';
    const over = p.inside && inside(b, p.x - dx, p.y - dy);
    hoverCue(b, over && !touch);
    if (this.pressed === i && p.down) return over ? 'down' : 'normal';
    return over && !touch ? 'hover' : 'normal';
  }

  /** True while the pointer rests on an enabled button (a mouse, not a finger). */
  hovering(input: Input, dx = 0, dy = 0): boolean {
    const p = input.pointer;
    return p.kind !== 'touch' && p.inside && this.at(p.x - dx, p.y - dy) >= 0;
  }
}
