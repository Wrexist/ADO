import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, lstatSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';

const exec = promisify(execFile);
async function git(cwd: string, args: string[], raw = false): Promise<string> {
  const { stdout } = await exec('git', args, { cwd, windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  return raw ? stdout : stdout.trim();
}
export interface RunWorkspace { path: string; baseSha: string; branch: string }
export async function prepareWorkspace(root: string, cwd: string): Promise<RunWorkspace> {
  // A snapshot of committed code is explicit: never silently omit the owner's edits.
  if (await git(cwd, ['status', '--porcelain'])) throw new Error('Commit or stash local changes before starting an isolated agent job.');
  const baseSha = await git(cwd, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40,64}$/.test(baseSha)) throw new Error('A committed Git revision is required.');
  mkdirSync(root, { recursive: true });
  const id = randomUUID(); const branch = `codex/run-${id}`; const path = join(root, id);
  await git(cwd, ['-c', 'core.hooksPath=', 'worktree', 'add', '-b', branch, '--', path, baseSha]);
  return { path, baseSha, branch };
}
export async function workspaceEvidence(cwd: string, baseSha: string) {
  const headSha = await git(cwd, ['rev-parse', 'HEAD']);
  const diff = await git(cwd, ['diff', '--no-ext-diff', '--no-textconv', '--binary', baseSha, '--'], true);
  const status = await git(cwd, ['status', '--porcelain']);
  const hash = createHash('sha256').update(diff).update('\n').update(status);
  const untracked = await git(cwd, ['ls-files', '--others', '--exclude-standard', '-z'], true);
  for (const name of untracked.split('\0').filter(Boolean).sort()) {
    const file = join(cwd, name); const stat = lstatSync(file);
    if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error('Cannot fingerprint a linked or oversized untracked result; review the working copy directly.');
    hash.update('\0').update(name).update('\0').update(readFileSync(file));
  }
  return { headSha, diffDigest: hash.digest('hex') };
}
