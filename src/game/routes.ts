// Route table. The main menu is the default route; Adventure and Quick Play load their screens
// lazily (src/game/modes/routes.ts). #/play/<path> plays a level file directly for testing. The
// dev review routes live under #/dev/ and load lazily, so they stay out of the main bundle; no
// menu links to them.

import type { Route } from './app/router';
import type { Screen } from './app/screens';
import { MainMenuScreen } from './menus/main';

export async function routeScreen(route: Route): Promise<Screen> {
  const [first, second] = route.segments;
  if (first === 'adventure') {
    const { adventureRoute } = await import('./modes/routes');
    return adventureRoute(route);
  }
  if (first === 'quickplay') {
    const { quickPlayRoute } = await import('./modes/routes');
    return quickPlayRoute(route);
  }
  if (first === 'play') {
    const { playRoute } = await import('./play/route');
    return playRoute(route);
  }
  if (first === 'dev') {
    // DEV ONLY review routes.
    if (second === 'kit') {
      const { DevKitScreen } = await import('./dev/kit');
      return new DevKitScreen();
    }
    if (second === 'board') {
      const { DevBoardScreen } = await import('./dev/board');
      return new DevBoardScreen();
    }
    if (second === 'level') {
      const { DevLevelScreen } = await import('./dev/level');
      return new DevLevelScreen();
    }
    if (second === 'masters') {
      const { DevMastersScreen } = await import('./dev/masters');
      return new DevMastersScreen();
    }
  }
  return new MainMenuScreen();
}
