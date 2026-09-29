import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Agent workspaces live outside both the profile directory and the ControlOS source
 * tree. A run's cwd ancestors must not contain the dashboard's database, credential
 * store, `.env` or its own CLAUDE.md, which agents would otherwise read or inherit
 * (T10/T11). Each profile gets its own folder, keyed by its database path.
 */
export function agentWorkspaceRoot(dbPath: string, env: NodeJS.ProcessEnv = process.env, home = homedir()): string {
  const base = process.platform === 'win32'
    ? join(env.LOCALAPPDATA || join(home, 'AppData', 'Local'), 'ControlOS', 'workspaces')
    : join(env.XDG_CACHE_HOME || join(home, '.cache'), 'controlos', 'workspaces');
  const profile = createHash('sha256').update(resolve(dbPath)).digest('hex').slice(0, 16);
  return join(base, profile);
}
