import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdirSync, lstatSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { commonGitIdentity } from '../projects/checkoutIdentity';

const exec = promisify(execFile);
async function git(cwd: string, args: string[], raw = false, isolated = false): Promise<string> {
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.toUpperCase().startsWith('GIT_')));
  env.GIT_OPTIONAL_LOCKS = '0';
  if (isolated) { env.GIT_CONFIG_NOSYSTEM = '1'; env.GIT_CONFIG_GLOBAL = process.platform === 'win32' ? 'NUL' : '/dev/null'; }
  const { stdout } = await exec('git', args, { cwd, env, windowsHide: true, timeout: 60_000, maxBuffer: 8 * 1024 * 1024 });
  return raw ? stdout : stdout.trim();
}
export interface RunWorkspace { path: string; baseSha: string; branch: string; kind: 'isolated_clone'; gitIdentity: string }
export async function prepareWorkspace(root: string, cwd: string, expectedBaseSha?: string): Promise<RunWorkspace> {
  // Dirty source contents are excluded only when the caller explicitly reviewed a base.
  if (!expectedBaseSha && await git(cwd, ['status', '--porcelain'])) throw new Error('Uncommitted source changes require an explicitly reviewed base commit.');
  const baseSha = await git(cwd, ['rev-parse', '--verify', 'HEAD']);
  if (!/^[a-f0-9]{40,64}$/.test(baseSha)) throw new Error('A committed Git revision is required.');
  if (expectedBaseSha && expectedBaseSha !== baseSha) throw new Error('Checkout revision changed since dispatch review; refresh before starting');
  mkdirSync(root, { recursive: true });
  const id = randomUUID(); const branch = `codex/run-${id}`; const path = join(resolve(root), id);
  await git(root, ['init', '--quiet', '--template=', path], false, true);
  // Transport copies objects; no worktree registration, shared refs, hardlinks,
  // alternates, source hooks/config, remote credentials or origin are installed.
  await git(path, ['-c', 'protocol.file.allow=always', 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', '--', resolve(cwd), baseSha], false, true);
  await git(path, ['-c', 'core.hooksPath=', 'checkout', '--quiet', '-b', branch, baseSha], false, true);
  for (const key of ['user.name', 'user.email']) {
    let value: string;
    try { value = await git(cwd, ['config', '--get', key]); }
    catch (error) { if ((error as { code?: number }).code === 1) continue; throw error; }
    await git(path, ['config', '--local', key, value], false, true);
  }
  if (await git(cwd, ['rev-parse', '--verify', 'HEAD']) !== baseSha) throw new Error('Checkout revision changed during workspace preparation');
  return { path, baseSha, branch, kind: 'isolated_clone', gitIdentity: commonGitIdentity(path) };
}
export function assertWorkspaceIdentity(cwd: string, expected?: string | null) {
  if (expected && commonGitIdentity(cwd) !== expected) throw new Error('Workspace Git identity changed; recorded provenance no longer matches');
}
export async function workspaceEvidence(cwd: string, baseSha: string, expectedIdentity?: string | null) {
  assertWorkspaceIdentity(cwd, expectedIdentity);
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
  assertWorkspaceIdentity(cwd, expectedIdentity);
  return { headSha, diffDigest: hash.digest('hex') };
}
