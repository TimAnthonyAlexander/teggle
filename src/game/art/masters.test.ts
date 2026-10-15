import { describe, expect, it } from 'vitest';
import type { PowerId } from '../audio/bus';
import { THEMES } from '../ui/tokens';
import {
  EXPRESSIONS,
  MASTER_POWERS,
  MasterPortraits,
  masterIndex,
  portraitPath,
  type PortraitImage,
} from './masters';

const camel = (name: string) =>
  name
    .split(' ')
    .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1)))
    .join('');

describe('portrait paths', () => {
  it('maps a power id and expression to its file under public/art/masters', () => {
    expect(portraitPath('guide', 'neutral')).toBe('/art/masters/guide/neutral.webp');
    expect(portraitPath('spaceBlast', 'power')).toBe('/art/masters/spaceBlast/power.webp');
    expect(portraitPath('zenBall', 'sad')).toBe('/art/masters/zenBall/sad.webp');
  });

  it('respects the base URL with or without a trailing slash', () => {
    expect(portraitPath('flippers', 'happy', '/teggle/')).toBe(
      '/teggle/art/masters/flippers/happy.webp',
    );
    expect(portraitPath('flippers', 'happy', '/teggle')).toBe(
      '/teggle/art/masters/flippers/happy.webp',
    );
  });

  it('gives forty distinct paths', () => {
    const all = MASTER_POWERS.flatMap((p) => EXPRESSIONS.map((x) => portraitPath(p, x)));
    expect(all).toHaveLength(40);
    expect(new Set(all).size).toBe(40);
  });
});

describe('master order', () => {
  it('lists ten distinct powers in stage order, matching the themes', () => {
    expect(MASTER_POWERS).toHaveLength(10);
    expect(new Set(MASTER_POWERS).size).toBe(10);
    THEMES.forEach((theme, i) => {
      expect(camel(theme.power)).toBe(MASTER_POWERS[i]);
      expect(masterIndex(camel(theme.power) as PowerId)).toBe(i);
    });
  });
});

describe('MasterPortraits', () => {
  const fake = (w: number): PortraitImage => ({ width: w, height: w }) as unknown as PortraitImage;

  it('loads once, caches, and reports status', async () => {
    const urls: string[] = [];
    const cache = new MasterPortraits('/', (url) => {
      urls.push(url);
      return Promise.resolve(fake(896));
    });
    expect(cache.status('guide', 'neutral')).toBe('idle');
    expect(cache.get('guide', 'neutral')).toBeNull();
    expect(cache.status('guide', 'neutral')).toBe('loading');
    await cache.request('guide', 'neutral');
    expect(cache.status('guide', 'neutral')).toBe('ready');
    expect(cache.get('guide', 'neutral')?.width).toBe(896);
    await cache.request('guide', 'neutral');
    expect(urls).toEqual(['/art/masters/guide/neutral.webp']);
  });

  it('marks a failed load as missing without throwing, and falls back to neutral', async () => {
    const cache = new MasterPortraits('/', (url) =>
      url.endsWith('/neutral.webp') ? Promise.resolve(fake(896)) : Promise.reject(new Error('404')),
    );
    await cache.preload('pyramid');
    expect(cache.status('pyramid', 'happy')).toBe('missing');
    expect(cache.get('pyramid', 'happy')).toBeNull();
    expect(cache.best('pyramid', 'happy')?.width).toBe(896);
  });

  it('returns null from best when nothing loaded', async () => {
    const cache = new MasterPortraits('/', () => Promise.reject(new Error('offline')));
    await cache.preloadAll();
    for (const p of MASTER_POWERS) {
      for (const x of EXPRESSIONS) expect(cache.status(p, x)).toBe('missing');
      expect(cache.best(p, 'sad')).toBeNull();
    }
  });
});
