// Where the editor reads and writes files. There is no backend: with the File System Access API
// (Chromium) the user picks the repository folder once and the editor reads and writes files
// in it directly; the folder handle is kept in IndexedDB, so a reload only asks for the
// permission again. Without it the editor reads what the dev server serves (the repository
// root, public/ included) and saves by downloading.

/** Paths relative to the repository root. */
export const paths = {
  stages: 'campaign/stages.json',
  source: (id: string) => `campaign/levels/${id}.json`,
  lines: (id: string) => `public/levels/campaign/${id}.lines.json`,
  level: (id: string) => `public/levels/campaign/${id}.json`,
  manifest: 'public/levels/campaign/manifest.json',
  picture: (background: string) => `public/backgrounds/${background}.webp`,
};

// The parts of the File System Access API this file uses; Chromium has them, TypeScript's DOM
// library does not declare all of them yet.
interface PermissionHandle {
  queryPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
  requestPermission?(o: { mode: 'readwrite' }): Promise<PermissionState>;
}
type DirectoryPicker = (o: {
  id?: string;
  mode?: 'readwrite';
}) => Promise<FileSystemDirectoryHandle>;

export function canPickFolder(): boolean {
  return (
    typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker ===
    'function'
  );
}

const DB = 'teggle-editor';
const STORE = 'handles';
const KEY = 'repository';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      resolve(req.result);
    };
    req.onerror = () => {
      reject(req.error ?? new Error('IndexedDB is not available'));
    };
  });
}

async function storeHandle(handle: FileSystemDirectoryHandle | null): Promise<void> {
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      if (handle === null) tx.objectStore(STORE).delete(KEY);
      else tx.objectStore(STORE).put(handle, KEY);
      tx.oncomplete = () => {
        resolve();
      };
      tx.onerror = () => {
        reject(tx.error ?? new Error('could not store the folder'));
      };
    });
    db.close();
  } catch {
    // Remembering the folder is a convenience; picking it again always works.
  }
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDb();
    const handle = await new Promise<unknown>((resolve, reject) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      req.onsuccess = () => {
        resolve(req.result);
      };
      req.onerror = () => {
        reject(req.error ?? new Error('could not read the folder'));
      };
    });
    db.close();
    return handle instanceof FileSystemDirectoryHandle ? handle : null;
  } catch {
    return null;
  }
}

export type RepoState = 'unsupported' | 'none' | 'needs-permission' | 'connected';

export class Repository {
  private handle: FileSystemDirectoryHandle | null = null;
  state: RepoState = canPickFolder() ? 'none' : 'unsupported';

  get name(): string | null {
    return this.handle?.name ?? null;
  }

  /** Restores the folder picked earlier; it may still need the user's permission. */
  async restore(): Promise<void> {
    if (this.state === 'unsupported') return;
    const h = await loadHandle();
    if (h === null) return;
    this.handle = h;
    const p = h as unknown as PermissionHandle;
    const state = (await p.queryPermission?.({ mode: 'readwrite' })) ?? 'prompt';
    this.state = state === 'granted' ? 'connected' : 'needs-permission';
  }

  /** Asks again for the folder picked earlier (needs a click). */
  async reconnect(): Promise<boolean> {
    const p = this.handle as unknown as PermissionHandle | null;
    if (p === null) return false;
    const state = (await p.requestPermission?.({ mode: 'readwrite' })) ?? 'denied';
    this.state = state === 'granted' ? 'connected' : 'needs-permission';
    return this.state === 'connected';
  }

  /** Lets the user pick the repository folder (needs a click). Throws when it is not one. */
  async pick(): Promise<void> {
    const picker = (window as unknown as { showDirectoryPicker: DirectoryPicker })
      .showDirectoryPicker;
    const h = await picker({ id: 'teggle-repository', mode: 'readwrite' });
    const probe = await fileIn(h, paths.stages, false).catch(() => null);
    if (probe === null) {
      throw new Error(`"${h.name}" has no ${paths.stages}; pick the repository's root folder.`);
    }
    this.handle = h;
    this.state = 'connected';
    await storeHandle(h);
  }

  async forget(): Promise<void> {
    this.handle = null;
    this.state = canPickFolder() ? 'none' : 'unsupported';
    await storeHandle(null);
  }

  get connected(): boolean {
    return this.state === 'connected' && this.handle !== null;
  }

  /** A file's text from the folder, or from the dev server; null when it does not exist. */
  async readText(path: string): Promise<string | null> {
    if (this.connected && this.handle !== null) {
      const f = await fileIn(this.handle, path, false).catch(() => null);
      return f === null ? null : (await f.getFile()).text();
    }
    const res = await fetch(`${import.meta.env.BASE_URL}${servedPath(path)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    // A dev server answers unknown paths with the app's page.
    if ((res.headers.get('content-type') ?? '').includes('text/html')) return null;
    return res.text();
  }

  /** A picture's URL: from the folder (an object URL) or as served. */
  async pictureUrl(path: string): Promise<string | null> {
    if (this.connected && this.handle !== null) {
      const f = await fileIn(this.handle, path, false).catch(() => null);
      return f === null ? null : URL.createObjectURL(await f.getFile());
    }
    return `${import.meta.env.BASE_URL}${servedPath(path)}`;
  }

  async exists(path: string): Promise<boolean> {
    if (this.connected && this.handle !== null) {
      return (await fileIn(this.handle, path, false).catch(() => null)) !== null;
    }
    return (await this.readText(path)) !== null;
  }

  /** Writes a file in the folder unless it already holds these bytes; says which. */
  async write(path: string, text: string): Promise<'unchanged' | 'new' | 'updated'> {
    if (!this.connected || this.handle === null) throw new Error('no repository folder');
    const before = await this.readText(path);
    if (before === text) return 'unchanged';
    const f = await fileIn(this.handle, path, true);
    const w = await f.createWritable();
    await w.write(text);
    await w.close();
    return before === null ? 'new' : 'updated';
  }
}

/** public/ is served at the root; everything else (campaign/) by its repository path. */
function servedPath(path: string): string {
  return path.startsWith('public/') ? path.slice('public/'.length) : path;
}

async function fileIn(
  root: FileSystemDirectoryHandle,
  path: string,
  create: boolean,
): Promise<FileSystemFileHandle> {
  const parts = path.split('/');
  const name = parts.pop() ?? path;
  let dir = root;
  for (const p of parts) dir = await dir.getDirectoryHandle(p, { create });
  return dir.getFileHandle(name, { create });
}

/** Offers a text as a file download. */
export function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 1000);
}
