/**
 * Env loading + validation. Reads the repo-root .env (gitignored) when present.
 * ACC_TOKEN is REQUIRED — the server refuses to boot without a shared secret;
 * localhost is not a trust boundary (convention 9).
 */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Env {
  port: number;
  webOrigin: string;
  accToken: string;
  dbPath: string;
  demo: boolean;
  /** Dirs to scan for repos (council S6 amendment: a list, not one dir). */
  projectDirs: string[];
  /** Absolute path to a BUILT web bundle to serve same-origin (desktop app / single-port
   *  deployments). Empty = API-only, the dev default (Vite serves the web separately). */
  serveWebDir?: string;
}

/** Expand a leading ~ to the home dir; trim whitespace. */
export function expandHome(p: string): string {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const t = p.trim();
  if (t === '~') return home;
  if (t.startsWith('~/')) return `${home}/${t.slice(2)}`;
  return t;
}

function parseProjectDirs(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(',').map(expandHome).filter(Boolean);
}

export function loadEnv(overrides: Partial<Env> = {}): Env {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
  const envFile = join(root, '.env');
  if (existsSync(envFile)) {
    // Built-in dotenv (no dependency); never logs values. Added in Node 20.12 / 21.7 —
    // guard so a Node in the declared >=20.12 floor that's actually older fails with a
    // clear, actionable message instead of a cryptic "process.loadEnvFile is not a function".
    if (typeof process.loadEnvFile !== 'function') {
      throw new Error(
        `This server needs Node >=20.12 for the built-in .env loader (process.loadEnvFile); running ${process.version}. ` +
          'Upgrade Node, or export the .env values into the environment before starting.',
      );
    }
    process.loadEnvFile(envFile);
  }

  const accToken = overrides.accToken ?? process.env.ACC_TOKEN ?? '';
  if (!accToken) {
    throw new Error(
      'ACC_TOKEN is not set. Create .env from .env.example (openssl rand -hex 24) — mutating endpoints and the SSE stream are token-gated by design.',
    );
  }

  const demo = overrides.demo ?? process.argv.includes('--demo');
  return {
    port: overrides.port ?? Number(process.env.PORT ?? 8787),
    webOrigin: overrides.webOrigin ?? process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    accToken,
    // Demo is a deterministic FIXTURE world — boot it fresh in memory (unless DB_PATH is set
    // explicitly) so seed changes always take effect and demo data never mixes with real
    // events on disk. Real runs persist to data/acc.sqlite.
    dbPath: overrides.dbPath ?? process.env.DB_PATH ?? (demo ? ':memory:' : join(root, 'data/acc.sqlite')),
    demo,
    projectDirs: overrides.projectDirs ?? parseProjectDirs(process.env.PROJECT_DIRS),
    serveWebDir: overrides.serveWebDir ?? process.env.SERVE_WEB_DIR ?? '',
  };
}
