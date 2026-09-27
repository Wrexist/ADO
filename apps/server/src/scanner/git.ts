/**
 * Git facts for a repo dir — thin wrappers over the git CLI. Every call is fenced:
 * a repo with no commits, a detached HEAD, or no git installed degrades to a null/
 * honest value, never a throw that would take down a scan of 20 repos.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { realpath } from 'node:fs/promises';

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
}

export async function isGitRepo(dir: string): Promise<boolean> {
  const root = await git(dir, ['rev-parse', '--show-toplevel']);
  if (!root) return false;
  try {
    const [actual, expected] = await Promise.all([realpath(dir), realpath(root)]);
    return process.platform === 'win32'
      ? actual.toLowerCase() === expected.toLowerCase()
      : actual === expected;
  } catch { return false; }
}

export async function readGit(dir: string): Promise<GitInfo> {
  const branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'HEAD';
  const iso = await git(dir, ['log', '-1', '--format=%cI']);
  return {
    branch,
    lastCommitTs: iso && iso.length > 0 ? new Date(iso).toISOString() : null,
  };
}
