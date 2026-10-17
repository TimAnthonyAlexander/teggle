// Route table. The main menu is the default route; Adventure, Quick Play and the challenges load
// their screens lazily (src/game/modes/routes.ts, challenges.ts). #/play/<path> plays a level
// file directly for testing. The
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
  if (first === 'challenges') {
    const { challengesRoute } = await import('./modes/challenges');
    return challengesRoute(route);
  }
  if (first === 'play') {
    const { playRoute } = await import('./play/route');
    return playRoute(route);
  }
  if (first === 'editor') {
    // The hidden background line editor (spec 12): #/editor/<level id>.
    const { EditorScreen } = await import('../editor/screen');
    return new EditorScreen(second ?? null);
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
    // Save export for the self-play calibration; the dev server only, never in a build.
    if (second === 'save' && import.meta.env.DEV) {
      const { DevSaveScreen } = await import('./dev/save');
      return new DevSaveScreen();
    }
  }
  return new MainMenuScreen();
}
