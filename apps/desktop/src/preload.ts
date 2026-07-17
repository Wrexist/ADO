/**
 * Preload (sandboxed, contextIsolation on): hand the renderer its runtime config.
 * The main process passes `--acc-config=<json>` via additionalArguments — read it here
 * and expose it as window.__ACC_DESKTOP__, which apps/web/src/lib/config.ts prefers over
 * its build-time Vite values. serverUrl '' = same-origin (the server serves the bundle).
 */
import { contextBridge } from 'electron';

const raw = process.argv.find((a) => a.startsWith('--acc-config='));
let config: { serverUrl?: string; accToken?: string } = {};
if (raw) {
  try {
    config = JSON.parse(raw.slice('--acc-config='.length)) as typeof config;
  } catch {
    // Malformed config → expose nothing; the web app honestly reports offline.
    config = {};
  }
}

contextBridge.exposeInMainWorld('__ACC_DESKTOP__', config);
