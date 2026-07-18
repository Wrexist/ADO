/**
 * GitHub project flow — clone a repo into the tracked projects folder, and read the git
 * facts the project page's GitHub buttons need (branch, remote, PR URLs).
 *
 * Safety: every git call is execFile with fixed args (no shell). The clone URL is always the
 * clean public https URL — a connected token rides in ENV (http.extraheader via GIT_CONFIG_*),
 * so it never appears in argv, in .git/config, or in an error message. GIT_TERMINAL_PROMPT=0
 * guarantees a private repo without credentials fails fast instead of hanging on a prompt.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const CLONE_TIMEOUT_MS = 180_000;
const GIT_TIMEOUT_MS = 10_000;

export interface GithubRef {
  owner: string;
  repo: string;
}

const OWNER = '[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})';
const REPO = '[A-Za-z0-9._-]{1,100}';
const FORMS = [
  new RegExp(`^https?://(?:www\\.)?github\\.com/(${OWNER})/(${REPO}?)(?:\\.git)?/?$`),
  new RegExp(`^git@github\\.com:(${OWNER})/(${REPO}?)(?:\\.git)?$`),
  new RegExp(`^(${OWNER})/(${REPO})$`),
];

/** Accepts "owner/repo", a github.com https URL, or a git@ SSH URL. Null for anything else. */
export function parseGithubRepo(input: string): GithubRef | null {
  const s = input.trim();
  for (const re of FORMS) {
    const m = s.match(re);
    if (!m) continue;
    let repo = m[2];
    if (repo.endsWith('.git')) repo = repo.slice(0, -4);
    if (!repo || repo === '.' || repo === '..') return null;
    return { owner: m[1], repo };
  }
  return null;
}

export type ExecFn = (cmd: string, args: string[], opts: { env?: NodeJS.ProcessEnv; timeout?: number; cwd?: string }) => Promise<{ stdout: string }>;

export class GithubCloner {
  constructor(private execImpl: ExecFn = exec) {}

  /**
   * Clone owner/repo into parentDir/repo. Refuses an existing destination (never clobbers).
   * Returns the destination dir. Throws with a clean, token-free message on failure.
   */
  async clone(parentDir: string, ref: GithubRef, token?: string): Promise<string> {
    const dest = join(parentDir, ref.repo);
    if (existsSync(dest)) throw new Error(`a folder named '${ref.repo}' already exists in ${parentDir}`);

    const url = `https://github.com/${ref.owner}/${ref.repo}.git`;
    const env: NodeJS.ProcessEnv = { ...process.env, GIT_TERMINAL_PROMPT: '0' };
    if (token) {
      // Auth via a per-invocation config ENTIRELY in env: never in argv (visible in ps),
      // never in the URL (would persist into .git/config as the origin remote).
      const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
      env.GIT_CONFIG_COUNT = '1';
      env.GIT_CONFIG_KEY_0 = 'http.https://github.com/.extraheader';
      env.GIT_CONFIG_VALUE_0 = `AUTHORIZATION: basic ${basic}`;
    }

    try {
      await this.execImpl('git', ['clone', '--', url, dest], { env, timeout: CLONE_TIMEOUT_MS });
    } catch (err) {
      const raw = (err as Error).message ?? 'clone failed';
      const line = raw.split('\n').find((l) => l.trim().length > 0) ?? 'clone failed';
      throw new Error(
        /terminal prompts disabled|authentication|could not read|403|404|not found/i.test(raw)
          ? `could not clone ${ref.owner}/${ref.repo} — it may be private (connect GitHub in Settings) or not exist`
          : `clone failed: ${line.slice(0, 200)}`,
      );
    }
    return dest;
  }
}

// —— git link facts (project page buttons) ————————————————————————————————————

export interface GitLink {
  branch: string;
  remoteUrl: string | null;
  github: GithubRef | null;
}

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: GIT_TIMEOUT_MS });
    return stdout.trim();
  } catch {
    return null;
  }
}

/** Drop URL userinfo (`https://user:token@host/…` → `https://host/…`) — a remote configured
 *  with an embedded credential must never reach the client/DOM (conv. 9/10 spirit). */
export function redactRemoteUrl(url: string): string {
  return url.replace(/^(https?:\/\/)[^@/]+@/i, '$1');
}

/** Branch + origin URL + parsed GitHub ref for a scanned repo dir. Degrades to nulls, never throws.
 *  Reads the CONFIGURED remote (`git config`), not the resolved one (`remote get-url`), so a
 *  machine-level `url.insteadOf` rewrite (mirrors/proxies) doesn't hide the real GitHub origin. */
export async function readGitLink(cwd: string): Promise<GitLink> {
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD'])) ?? 'HEAD';
  const raw = await git(cwd, ['config', '--get', 'remote.origin.url']);
  const remoteUrl = raw ? redactRemoteUrl(raw) : raw;
  return { branch, remoteUrl, github: remoteUrl ? parseGithubRepo(remoteUrl) : null };
}
