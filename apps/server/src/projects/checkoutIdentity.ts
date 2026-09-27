import { readFileSync, realpathSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

export const pathKey = (path: string) => process.platform === 'win32' ? path.toLowerCase() : path;
export function directoryIdentity(path: string) {
  const stat = statSync(path, { bigint: true });
  if (!stat.isDirectory() || stat.ino === 0n) throw new Error('A stable directory identity is required');
  return `${stat.dev}:${stat.ino}:${stat.birthtimeNs}`;
}

/** Read Git's local indirection files; no shell or subprocess is needed at the spawn gate. */
function pointer(path: string) {
  const stat = statSync(path);
  if (!stat.isFile() || stat.size > 65536) throw new Error('Invalid or oversized Git pointer');
  return readFileSync(path, 'utf8').replace(/\r?\n$/, '');
}
export function commonGitIdentity(path: string) {
  let gitDir = join(path, '.git');
  if (!statSync(gitDir).isDirectory()) {
    const value = pointer(gitDir);
    if (!value.startsWith('gitdir: ')) throw new Error('Invalid checkout Git pointer');
    gitDir = resolve(path, value.slice(8));
  }
  gitDir = realpathSync(gitDir);
  let relative: string | null = null;
  try { relative = pointer(join(gitDir, 'commondir')); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  const common = relative === null ? gitDir : realpathSync(resolve(gitDir, relative));
  return directoryIdentity(common);
}
