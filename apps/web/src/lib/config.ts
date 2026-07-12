/** Client config — from the repo-root .env via Vite (envDir), never hardcoded. */
export const SERVER_URL: string =
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? 'http://127.0.0.1:8787';

/** Shared secret for SSE + mutating calls. Empty → the connect layer reports offline. */
export const ACC_TOKEN: string = (import.meta.env.VITE_ACC_TOKEN as string | undefined) ?? '';
