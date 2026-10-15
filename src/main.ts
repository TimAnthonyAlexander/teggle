import { App } from './game/app/app';
import { registerOffline } from './game/app/offline';
import { startAudio } from './game/audio/engine';
import { routeScreen } from './game/routes';

function boot(): void {
  const canvas = document.getElementById('game');
  if (!(canvas instanceof HTMLCanvasElement)) throw new Error('Missing #game canvas.');
  registerOffline();
  startAudio();
  const app = new App(canvas, routeScreen);
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
