/**
 * Preload (sandboxed, contextIsolation on): hand the renderer its runtime config.
 * Fetched from the main process via one-shot sync IPC — never via argv (readable by other
 * local processes) or the URL. Shape-validated here; a malformed reply exposes nothing and
 * the web app honestly reports offline. apps/web/src/lib/config.ts prefers these values
 * over its build-time Vite env; serverUrl '' = same-origin (the server serves the bundle).
 */
import { contextBridge, ipcRenderer } from 'electron';

const raw: unknown = ipcRenderer.sendSync('acc:config');
const obj = raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
const config: { serverUrl?: string; accToken?: string } = {
  ...(typeof obj.serverUrl === 'string' ? { serverUrl: obj.serverUrl } : {}),
  ...(typeof obj.accToken === 'string' ? { accToken: obj.accToken } : {}),
};

contextBridge.exposeInMainWorld('__ACC_DESKTOP__', config);
