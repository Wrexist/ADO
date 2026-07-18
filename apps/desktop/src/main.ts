/**
 * Desktop main process — the "download and it just works" wrapper (docs/DESKTOP.md).
 *
 * Boot order matters and each step is deliberate:
 * 1. fixPath()      — GUI-launched apps on macOS/Linux get a minimal PATH; the runner
 *                     needs the user's `claude` CLI, so capture the shell PATH first.
 * 2. free port      — probed BEFORE buildServer so the Host allow-list + CORS origin are
 *                     exact (the server derives both from env.port; no wildcards ever).
 * 3. token          — generated once into the OS user-data dir (0600), passed to the
 *                     server as an override and to the renderer via the preload. The
 *                     packaged app never needs a .env file.
 * 4. same-origin    — the server serves the BUILT web bundle (SERVE_WEB_DIR), so the
 *                     window loads http://127.0.0.1:<port> and every fetch/SSE call is
 *                     same-origin — identical security behavior to dev, one port total.
 * 5. auto-update    — packaged builds check GitHub Releases; failures only log (offline
 *                     is normal, and unsigned macOS builds can't auto-update — DESKTOP.md).
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fixPath from 'fix-path';
import { buildServer, type AccServer } from '../../server/src/app';
import { loadEnv } from '../../server/src/env';

/** Ask the OS for a free localhost port (close it immediately; the server rebinds it). */
function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, '127.0.0.1', () => {
      const addr = probe.address();
      const port = typeof addr === 'object' && addr !== null ? addr.port : 0;
      probe.close(() => (port > 0 ? resolve(port) : reject(new Error('no free port'))));
    });
  });
}

/** The shared secret lives in userData (0600) — created once, reused across launches. */
function loadOrCreateToken(dir: string): string {
  const file = join(dir, 'acc-token');
  if (existsSync(file)) {
    const existing = readFileSync(file, 'utf8').trim();
    if (existing) return existing;
  }
  const token = randomBytes(24).toString('hex');
  writeFileSync(file, `${token}\n`, { mode: 0o600 });
  chmodSync(file, 0o600);
  return token;
}

let server: AccServer | null = null;

async function start(): Promise<void> {
  fixPath();
  await app.whenReady();

  const userData = app.getPath('userData');
  mkdirSync(userData, { recursive: true });
  const accToken = loadOrCreateToken(userData);
  const port = await freePort();

  // Packaged: web bundle + drizzle migrations ride in resources/ (electron-builder
  // extraResources). Dev (`npm run build && npx electron dist/main.cjs`): sibling workspaces.
  const webDir = app.isPackaged ? join(process.resourcesPath, 'web') : join(__dirname, '../../web/dist');
  process.env.ACC_MIGRATIONS_DIR = app.isPackaged
    ? join(process.resourcesPath, 'drizzle')
    : join(__dirname, '../../server/drizzle');

  const env = loadEnv({
    port,
    accToken,
    webOrigin: `http://127.0.0.1:${port}`,
    dbPath: join(userData, 'acc.sqlite'),
    demo: false,
    serveWebDir: webDir,
  });
  server = await buildServer(env);
  await server.app.listen({ port, host: '127.0.0.1' });

  // One-shot sync IPC hands the renderer its config — the token never rides in argv
  // (process args are readable by other local processes) or in the URL.
  ipcMain.on('acc:config', (e) => {
    e.returnValue = { serverUrl: '', accToken };
  });

  const win = new BrowserWindow({
    width: 1536,
    height: 1000,
    minWidth: 1100,
    minHeight: 700,
    backgroundColor: '#08080d',
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  const appOrigin = `http://127.0.0.1:${port}`;
  // The window may only ever show the local app — any other top-level navigation is
  // blocked, so remote content can never load into a renderer holding the injected config.
  win.webContents.on('will-navigate', (e, url) => {
    if (url !== appOrigin && !url.startsWith(`${appOrigin}/`)) e.preventDefault();
  });
  // External links open in the real browser — http(s) only, never custom schemes.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  await win.loadURL(appOrigin);

  if (app.isPackaged) {
    try {
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.on('error', (err) => console.warn('updater:', err.message));
      await autoUpdater.checkForUpdatesAndNotify();
    } catch (err) {
      // Offline, rate-limited, or unsigned-macOS — all non-fatal by design.
      console.warn('updater skipped:', (err as Error).message);
    }
  }
}

app.on('window-all-closed', () => {
  app.quit();
});
app.on('before-quit', () => {
  void server?.close();
});

start().catch((err: Error) => {
  console.error('desktop boot failed:', err);
  // Surface the real reason instead of a silent zombie process.
  dialog.showErrorBox('AI Control Center failed to start', err.message);
  app.quit();
});
