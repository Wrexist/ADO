#!/usr/bin/env node
/**
 * Zero-config bootstrap — make `npm run dev` work on a fresh clone with NO manual steps.
 *
 * The server refuses to boot without ACC_TOKEN (convention 9: localhost is not a trust
 * boundary), and the web needs the SAME secret in VITE_ACC_TOKEN to reach it. Onboarding
 * used to mean: hand-create .env, generate a token, paste it in two places. This ensures
 * the repo-root .env has a strong ACC_TOKEN and a matching VITE_ACC_TOKEN automatically.
 *
 * Idempotent + non-destructive: an existing NON-EMPTY ACC_TOKEN is never changed — we only
 * fill blanks and keep VITE_ACC_TOKEN in sync. The token is generated locally with crypto
 * and NEVER printed. Runs automatically via the root `predev` hook and `install.sh`.
 *
 * Test hook: set ACC_ENV_DIR to point at a scratch dir instead of the repo root.
 */
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.ACC_ENV_DIR || join(dirname(fileURLToPath(import.meta.url)), '..');
const envPath = join(root, '.env');
const examplePath = join(root, '.env.example');

const DEFAULT_TEMPLATE = [
  '# AI Control Center — local config (auto-generated; gitignored).',
  '# The server binds 127.0.0.1 only; this token gates the SSE stream + mutating calls.',
  'ACC_TOKEN=',
  'VITE_ACC_TOKEN=',
  '',
  '# Optional — point the scanner at dirs holding your repos (comma-separated). Empty = none yet.',
  '# PROJECT_DIRS=~/code,~/projects',
  '# Optional — override the server port / web origin if 8787 / 5173 are taken.',
  '# PORT=8787',
  '# WEB_ORIGIN=http://localhost:5173',
  '',
].join('\n');

/** Replace KEY=… in place, or append it (keeping every other line + comment intact). */
function upsert(text, key, value) {
  const re = new RegExp(`^${key}=.*$`, 'm');
  if (re.test(text)) return text.replace(re, `${key}=${value}`);
  const base = text.endsWith('\n') || text === '' ? text : text + '\n';
  return base + `${key}=${value}\n`;
}

const existed = existsSync(envPath);
const original = existed
  ? readFileSync(envPath, 'utf8')
  : existsSync(examplePath)
    ? readFileSync(examplePath, 'utf8')
    : DEFAULT_TEMPLATE;

const currentAcc = (original.match(/^ACC_TOKEN=(.*)$/m)?.[1] ?? '').trim();
const acc = currentAcc || randomBytes(24).toString('hex');

let out = upsert(original, 'ACC_TOKEN', acc);
out = upsert(out, 'VITE_ACC_TOKEN', acc); // must equal ACC_TOKEN or the web can't reach the server

if (out !== original || !existed) {
  writeFileSync(envPath, out);
  try {
    chmodSync(envPath, 0o600); // owner-only — a secret on disk
  } catch {
    /* non-POSIX — best effort */
  }
  console.log(
    !existed
      ? '✓ bootstrap: created .env with a fresh local token (gitignored). You can just run `npm run dev`.'
      : '✓ bootstrap: filled in the missing ACC_TOKEN / synced VITE_ACC_TOKEN in .env.',
  );
} else {
  console.log('✓ bootstrap: .env already configured — nothing to do.');
}
