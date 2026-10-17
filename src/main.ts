import { App } from './game/app/app';
import { registerOffline } from './game/app/offline';
import { startAudio } from './game/audio/engine';
import { routeScreen } from './game/routes';

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.');
  const app = new App(canvas, routeScreen);
  registerOffline(() => app.pageState());
  startAudio();
  if (window.location.hash.includes('touchdebug=1')) {
    // The touch timeline for debugging input on a real phone (src/game/dev/touch-debug.ts). Also
    // in production builds, as a lazy chunk, so it works on the deployed site; nothing loads
    // without the query.
    void import('./game/dev/touch-debug').then((m) => {
      m.installTouchDebug();
    });
  }
  app.start().catch((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    document.body.dataset.error = message;
    const note = document.getElementById('boot-error');
    if (note !== null) {
      note.textContent = `Teggle could not start: ${message}`;
      note.hidden = false;
    }
  });
}

boot();
