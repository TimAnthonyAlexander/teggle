import { describe, expect, it } from 'vitest';
import { AudioBus, type AudioEventType } from '../audio/bus';
import { FeverShow } from './fever';
import { MISS_SIGH_SPEED, SLOW_MOTION_HOLD_MS, SLOW_MOTION_SCALE } from './timing';

function show(): { fever: FeverShow; heard: AudioEventType[] } {
  const bus = new AudioBus();
  const heard: AudioEventType[] = [];
  bus.on((e) => heard.push(e.type));
  return { fever: new FeverShow(bus), heard };
}

describe('Fever slow motion and the near miss', () => {
  it('ramps back after a miss and sighs once as it passes 0.9x', () => {
    const { fever, heard } = show();
    fever.approach(0);
    expect(fever.speed).toBe(SLOW_MOTION_SCALE);
    expect(fever.closingIn).toBe(true);
    fever.miss(500);
    expect(fever.closingIn).toBe(false);
    let sighAt = -1;
    for (let i = 0; i < 100; i++) {
      fever.tick();
      if (sighAt < 0 && heard.includes('feverMissed')) sighAt = fever.speed;
    }
    expect(fever.speed).toBe(1);
    expect(heard.filter((t) => t === 'feverMissed')).toHaveLength(1);
    expect(sighAt).toBeGreaterThanOrEqual(MISS_SIGH_SPEED);
    expect(sighAt).toBeLessThan(MISS_SIGH_SPEED + 0.03);
    // Zoomed back out, and over 400 ms after the end the show is off again.
    expect(fever.zoom(500 + 300)).toBe(1);
    fever.frame(1000, true);
    expect(fever.active).toBe(false);
  });

  it('never sighs after the hit', () => {
    const { fever, heard } = show();
    fever.approach(0);
    fever.hit(400, false);
    fever.miss(450); // too late: the hit came
    fever.frame(400 + SLOW_MOTION_HOLD_MS, true);
    for (let i = 0; i < 100; i++) fever.tick();
    expect(heard).not.toContain('feverMissed');
    expect(heard).toContain('feverStart');
  });

  it('sighs when a predicted hit never comes', () => {
    const { fever, heard } = show();
    fever.approach(0);
    fever.frame(5000, true);
    for (let i = 0; i < 100; i++) fever.tick();
    expect(heard.filter((t) => t === 'feverMissed')).toHaveLength(1);
  });
});
