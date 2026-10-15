// What the play screen tells the audio layer besides bus events: hover edges (a sound when the
// pointer moves onto a button, not every frame it stays there) and whether the game is paused.
// Both are called every frame with the current state, so the screen needs no bookkeeping.

import { audioBus } from './bus';

const hovered = new WeakMap<object, boolean>();

/** Call every frame with whether the pointer is over `target`; fires uiHover as it moves on. */
export function hoverCue(target: object, over: boolean): void {
  if (over && hovered.get(target) !== true) audioBus.emit({ type: 'uiHover' });
  hovered.set(target, over);
}

type PauseListener = (paused: boolean) => void;

let paused = false;
const pauseListeners: PauseListener[] = [];

/** The play screen's pause state; listeners hear only changes. */
export function setGamePaused(value: boolean): void {
  if (value === paused) return;
  paused = value;
  for (const l of pauseListeners.slice()) l(value);
}

export function gamePaused(): boolean {
  return paused;
}

/** Subscribes to pause changes; returns the function that unsubscribes. */
export function onGamePaused(listener: PauseListener): () => void {
  pauseListeners.push(listener);
  return () => {
    const i = pauseListeners.indexOf(listener);
    if (i >= 0) pauseListeners.splice(i, 1);
  };
}
