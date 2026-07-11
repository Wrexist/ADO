/**
 * Git facts for a repo dir — thin wrappers over the git CLI. Every call is fenced:
 * a repo with no commits, a detached HEAD, or no git installed degrades to a null/
 * honest value, never a throw that would take down a scan of 20 repos.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: 5000, windowsHide: true });
    return stdout.trim();
  } catch {
    return null;
  }
}

export interface GitInfo {
  branch: string;
  lastCommitTs: string | null; // ISO, or null for a repo with no commits
  dirtyCount: number;
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const out = await git(dir, ['rev-parse', '--is-inside-work-tree']);
  return out === 'true';
}

export async function readGit(dir: string): Promise<GitInfo> {
  const branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'HEAD';
  const iso = await git(dir, ['log', '-1', '--format=%cI']);
  const status = await git(dir, ['status', '--porcelain']);
  const dirtyCount = status ? status.split('\n').filter(Boolean).length : 0;
  return {
    branch,
    lastCommitTs: iso && iso.length > 0 ? new Date(iso).toISOString() : null,
    dirtyCount,
  };
}
