import { describe, expect, it } from 'vitest';
import { numberParam, parseRoute, routeKey } from './router';

describe('parseRoute', () => {
  it('splits the path and reads the query', () => {
    const r = parseRoute('#/dev/kit/pegs?theme=3&still=1');
    expect(r.segments).toEqual(['dev', 'kit', 'pegs']);
    expect(r.params.get('theme')).toBe('3');
    expect(numberParam(r, 'theme', 0)).toBe(3);
    expect(routeKey(r)).toBe('dev/kit/pegs');
  });

  it('treats an empty hash as the root route', () => {
    expect(parseRoute('').segments).toEqual([]);
    expect(parseRoute('#').segments).toEqual([]);
    expect(parseRoute('#/').segments).toEqual([]);
  });

  it('falls back on missing or invalid numbers', () => {
    const r = parseRoute('#/dev/board?aim=abc');
    expect(numberParam(r, 'aim', 7)).toBe(7);
    expect(numberParam(r, 'missing', -1)).toBe(-1);
  });
});
