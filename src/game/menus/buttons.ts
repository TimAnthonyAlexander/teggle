// Click handling shared by the menus: a button fires when a press and its release both land on
// it, hover shows only for a mouse or pen, and moving onto a button plays the hover sound once.
// A finger hits a button anywhere within 44 CSS px of its center, the nearest button winning
// where two of those areas overlap; a multi-finger touch presses nothing.

import { minTarget } from '../app/display';
import type { Input } from '../app/input';
import { hoverCue } from '../audio/cues';
import type { Box } from '../layout';
import { pickTarget, type ButtonState } from '../ui/controls';

export interface UiButton<A> {
  readonly action: A;
  readonly box: Box;
  /** Hit as the circle inscribed in the box instead of the box. */
  readonly round?: boolean;
  enabled: boolean;
}

export class ButtonSet<A> {
  private pressed = -1;

  constructor(readonly items: UiButton<A>[]) {}

  /** The enabled button under (x, y), or -1; `touch` uses the finger-sized targets. */
  at(x: number, y: number, touch = false): number {
    return pickTarget(
      this.items,
      x,
      y,
      touch ? minTarget() : 0,
      (i) => this.items[i]?.enabled === true,
    );
  }

  /** The button under (x, y), enabled or not, or -1 (for showing why one is disabled). */
  any(x: number, y: number, touch = false): number {
    return pickTarget(this.items, x, y, touch ? minTarget() : 0);
  }

  find(action: A): UiButton<A> | undefined {
    return this.items.find((b) => b.action === action);
  }

  press(x: number, y: number, touch = false): void {
    this.pressed = this.at(x, y, touch);
  }

  /** Forgets a press, so its release clicks nothing (a second finger joined it). */
  cancel(): void {
    this.pressed = -1;
  }

  /** The action of a click released on the button it was pressed on, or null. */
  release(x: number, y: number, touch = false): A | null {
    const i = this.at(x, y, touch);
    const p = this.pressed;
    this.pressed = -1;
    if (i < 0 || i !== p) return null;
    return this.items[i]?.action ?? null;
  }

  /** Feeds this frame's presses and releases; returns the actions clicked, oldest first. */
  handle(input: Input, dx = 0, dy = 0): A[] {
    const out: A[] = [];
    for (const { press, e } of input.consumePointer()) {
      const touch = e.kind === 'touch';
      if (e.crowded) this.cancel();
      else if (press) this.press(e.x - dx, e.y - dy, touch);
      else {
        const a = this.release(e.x - dx, e.y - dy, touch);
        if (a !== null) out.push(a);
      }
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
    const over = p.inside && this.at(p.x - dx, p.y - dy, touch) === i;
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
