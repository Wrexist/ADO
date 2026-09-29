/**
 * Client config. Two sources, in priority order:
 * 1. `window.__ACC_DESKTOP__` — injected at runtime by the desktop app's preload
 *    (serverUrl '' = same-origin: the desktop serves the built bundle from the server itself).
 * 2. Runtime browser pairing. Credentials never enter the web build.
 */
interface DesktopConfig {
  serverUrl?: string;
  accToken?: string;
  pickFolder?: () => Promise<string | null>;
}

const desktop: DesktopConfig | undefined =
  typeof window !== 'undefined' ? (window as { __ACC_DESKTOP__?: DesktopConfig }).__ACC_DESKTOP__ : undefined;

export const SERVER_URL: string =
  desktop?.serverUrl ?? (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://127.0.0.1:8787';

/** Shared secret for SSE + mutating calls. Empty → the connect layer reports offline. */
export let ACC_TOKEN: string = desktop?.accToken ?? '';
export const IS_DESKTOP = Boolean(desktop?.accToken);
/** Native folder chooser — desktop app only; null in a browser. */
export const pickFolder: (() => Promise<string | null>) | null = typeof desktop?.pickFolder === 'function' ? desktop.pickFolder : null;
const IS_WINDOWS = typeof navigator !== 'undefined' && /Win/i.test(navigator.userAgent);
/** Example path in the user's own platform style. */
export const EXAMPLE_FOLDER = IS_WINDOWS ? 'C:\\Users\\you\\code' : '~/code';

export function setBrowserToken(token: string): void {
  if (!IS_DESKTOP) ACC_TOKEN = token;
}
