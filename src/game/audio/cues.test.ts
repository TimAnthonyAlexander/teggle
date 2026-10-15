import { afterEach, describe, expect, it } from 'vitest';
import { audioBus, type AudioEvent } from './bus';
import { gamePaused, hoverCue, onGamePaused, setGamePaused } from './cues';

describe('hoverCue', () => {
  const heard: AudioEvent[] = [];
  const off = audioBus.on((e) => heard.push(e));
  afterEach(() => {
    heard.length = 0;
  });

  it('fires once when the pointer moves onto a target, not every frame', () => {
    const button = {};
    hoverCue(button, false);
    hoverCue(button, true);
    hoverCue(button, true);
    hoverCue(button, true);
    expect(heard).toEqual([{ type: 'uiHover' }]);
    hoverCue(button, false);
    hoverCue(button, true);
    expect(heard).toHaveLength(2);
  });

  it('tracks targets separately', () => {
    const a = {};
    const b = {};
    hoverCue(a, true);
    hoverCue(b, true);
    hoverCue(a, true);
    expect(heard).toHaveLength(2);
    off();
  });
});

describe('pause state', () => {
  it('tells listeners about changes only', () => {
    const seen: boolean[] = [];
    const off = onGamePaused((p) => seen.push(p));
    setGamePaused(false);
    setGamePaused(true);
    setGamePaused(true);
    expect(gamePaused()).toBe(true);
    setGamePaused(false);
    expect(seen).toEqual([true, false]);
    off();
    setGamePaused(true);
    expect(seen).toEqual([true, false]);
    setGamePaused(false);
  });
});
