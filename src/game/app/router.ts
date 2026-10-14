// Hash routes: "#/dev/kit/pegs?theme=3" -> { segments: ['dev', 'kit', 'pegs'], params }.

export interface Route {
  readonly segments: readonly string[];
  readonly params: ReadonlyMap<string, string>;
}

export function parseRoute(hash: string): Route {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = raw.indexOf('?');
  const path = q >= 0 ? raw.slice(0, q) : raw;
  const query = q >= 0 ? raw.slice(q + 1) : '';
  const segments = path
    .split('/')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s) => decodeURIComponent(s));
  const params = new Map<string, string>();
  for (const [k, v] of new URLSearchParams(query)) params.set(k, v);
  return { segments, params };
}

export function numberParam(route: Route, name: string, fallback: number): number {
  const v = route.params.get(name);
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export function routeKey(route: Route): string {
  return route.segments.join('/');
}
