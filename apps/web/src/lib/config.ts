/**
 * Client config. Two sources, in priority order:
 * 1. `window.__ACC_DESKTOP__` — injected at runtime by the desktop app's preload
 *    (serverUrl '' = same-origin: the desktop serves the built bundle from the server itself).
 * 2. Build-time Vite env from the repo-root .env (the dev/browser path).
 * Never hardcoded secrets; an empty token → the connect layer reports offline.
 */
interface DesktopConfig {
  serverUrl?: string;
  accToken?: string;
}

const desktop: DesktopConfig | undefined =
  typeof window !== 'undefined' ? (window as { __ACC_DESKTOP__?: DesktopConfig }).__ACC_DESKTOP__ : undefined;

export const SERVER_URL: string =
  desktop?.serverUrl ?? (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://127.0.0.1:8787';

/** Shared secret for SSE + mutating calls. Empty → the connect layer reports offline. */
export const ACC_TOKEN: string = desktop?.accToken ?? ((import.meta.env.VITE_ACC_TOKEN as string | undefined) ?? '');
