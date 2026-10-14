// Route table. The dev review routes live under #/dev/ and load lazily, so they stay out of the
// main bundle; no menu links to them.

import type { Route } from './app/router';
import type { Screen } from './app/screens';
import { TitleScreen } from './screens/title';

export async function routeScreen(route: Route): Promise<Screen> {
  const [first, second] = route.segments;
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
  }
  return new TitleScreen();
}
