// Undo and redo over immutable document values. A drag records one step: the value before it
// starts, pushed once, however many moves follow.

export class History<T> {
  private readonly past: T[] = [];
  private readonly future: T[] = [];

  constructor(private readonly limit = 300) {}

  /** Records `before` as the state to return to; clears the redo list. */
  push(before: T): void {
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
    this.future.length = 0;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** The state before `current`, or null; `current` becomes redoable. */
  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}
