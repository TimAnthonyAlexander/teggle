// Offline play for production builds: registers the service worker that tools/build-sw.ts
// writes into dist/ (the whole game in one cache per build). The Vite dev server never runs it.
//
// When a newer build has installed in the background, it takes over only while the main menu
// shows (never during a level), and the page reloads into it, so the scripts of two builds
// never meet in one page.

/** Routes where switching to a new build is harmless: the main menu. */
function onMainMenu(): boolean {
  const h = window.location.hash;
  return h === '' || h === '#' || h === '#/';
}

function activateWhenIdle(worker: ServiceWorker): void {
  const go = (): void => {
    if (!onMainMenu()) return;
    window.removeEventListener('hashchange', go);
    worker.postMessage('activate');
  };
  window.addEventListener('hashchange', go);
  go();
}

export function registerOffline(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const sw = navigator.serviceWorker;
  let reloading = false;
  sw.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    sw.register(`${import.meta.env.BASE_URL}sw.js`).then(
      (reg) => {
        // A page that a worker already controls is an update; the first install is not.
        if (reg.waiting !== null && sw.controller !== null) activateWhenIdle(reg.waiting);
        reg.addEventListener('updatefound', () => {
          const next = reg.installing;
          next?.addEventListener('statechange', () => {
            if (next.state === 'installed' && sw.controller !== null) activateWhenIdle(next);
          });
        });
      },
      () => undefined,
    );
  });
}
