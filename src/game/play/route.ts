// The play route: #/play/<level path under public/levels/>, with optional query parameters
// seed (first attempt's seed), theme (0 to 9), balls, orange (orange pegs to clear),
// campaign=1 (tries count for the campaign clear bonus), stage (1 to 10: that stage's master,
// its power and frame theme) and power (a power id, e.g. power=fireball, for testing).
// Loads and checks the level, makes the first attempt, and hands both to the play screen; any
// failure shows a message instead.

import { AttemptSetupError } from '../../rules/colors';
import { isPowerId } from '../../rules/powers';
import { numberParam, type Route } from '../app/router';
import type { Screen } from '../app/screens';
import { WORLD_H, WORLD_W } from '../layout';
import { MessageScreen } from '../screens/message';
import { PlayScreen, type PlayOptions } from '../screens/play';
import { loadBackdrop, type BackdropPainter } from './backdrop';
import { checkLevelPath, loadLevel, LevelLoadError } from './load';
import { routeMaster } from './powers';

function options(route: Route): PlayOptions {
  const seed = route.params.get('seed');
  const balls = numberParam(route, 'balls', 0);
  const orange = numberParam(route, 'orange', 0);
  const stage = numberParam(route, 'stage', 0);
  const power = route.params.get('power') ?? '';
  const master = routeMaster(
    Number.isInteger(stage) && stage >= 1 && stage <= 10 ? stage : null,
    isPowerId(power) ? power : null,
  );
  return {
    seed: seed === undefined || !/^\d+$/.test(seed) ? null : Number(seed) >>> 0,
    theme: Math.trunc(numberParam(route, 'theme', master.theme ?? 0)),
    campaign: route.params.get('campaign') === '1',
    balls: Number.isInteger(balls) && balls >= 1 && balls <= 99 ? balls : null,
    orange: Number.isInteger(orange) && orange >= 1 && orange <= 55 ? orange : null,
    power: master.power,
  };
}

/**
 * Picks the painter for a level's background id: the dev picture, or the level's picture from
 * public/backgrounds/ with the plain field as the fallback.
 */
async function backdropFor(id: string): Promise<BackdropPainter> {
  if (id === 'dev-backdrop') {
    // DEV picture for dev and example levels; loaded lazily so it stays out of the main bundle.
    const { drawDevBackdrop } = await import('../dev/backdrop');
    return (ctx, k) => {
      ctx.fillStyle = '#1d1f5c';
      ctx.fillRect(0, 0, WORLD_W, WORLD_H);
      drawDevBackdrop(ctx, k);
    };
  }
  return loadBackdrop(id, import.meta.env.BASE_URL);
}

export async function playRoute(route: Route): Promise<Screen> {
  try {
    const path = checkLevelPath(route.segments.slice(1));
    const loaded = await loadLevel(path, import.meta.env.BASE_URL);
    const opts = options(route);
    const first = PlayScreen.firstAttempt(loaded, opts);
    return new PlayScreen(loaded, await backdropFor(loaded.level.background), opts, first);
  } catch (err) {
    if (err instanceof LevelLoadError || err instanceof AttemptSetupError) {
      return new MessageScreen('Level Not Playable', err.message, 'Back to Title', '#/');
    }
    throw err;
  }
}
