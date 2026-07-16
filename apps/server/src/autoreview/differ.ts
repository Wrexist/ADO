/**
 * Diff collection for Auto-Review — READ-ONLY git facts, safely.
 *
 * Every command is `execFile('git', [fixed args], { cwd })`: no shell, no client-supplied
 * arguments, cwd only ever comes from the scanner allow-list. Output is BOUNDED (byte cap with
 * an explicit truncation marker) and noisy generated files are excluded via pathspecs, so a
 * lockfile churn can't drown the real change or blow the request. Failures degrade to a typed
 * error string — never a throw that would crash the engine.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const exec = promisify(execFile);

const GIT_TIMEOUT_MS = 15_000;
const MAX_BUFFER = 32 * 1024 * 1024; // read generously, then cap ourselves
export const DIFF_CHAR_CAP = 90_000; // ~22K tokens of patch — plenty for a review, bounded for cost

/** Generated/vendored noise a reviewer should never burn budget on. */
const EXCLUDES = [
  ':(exclude)package-lock.json',
  ':(exclude)yarn.lock',
  ':(exclude)pnpm-lock.yaml',
  ':(exclude)*.min.js',
  ':(exclude)*.map',
  ':(exclude)dist/**',
  ':(exclude)build/**',
  ':(exclude)node_modules/**',
];

export interface CollectedDiff {
  /** Commit sha reviewed, or 'working-tree' when uncommitted changes were reviewed. */
  ref: string;
  refLabel: string;
  branch: string;
  diff: string;
  truncated: boolean;
  stats: { files: number; additions: number; deletions: number };
}

export type DiffResult = CollectedDiff | { error: string };

async function git(cwd: string, args: string[]): Promise<string | null> {
  try {
    const { stdout } = await exec('git', args, { cwd, timeout: GIT_TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true });
    return stdout;
  } catch {
    return null;
  }
}

/** Parse `--numstat` output ("adds\tdels\tpath", '-' for binary) into totals. */
function parseNumstat(out: string): { files: number; additions: number; deletions: number } {
  let files = 0;
  let additions = 0;
  let deletions = 0;
  for (const line of out.split('\n')) {
    const m = line.match(/^(\d+|-)\t(\d+|-)\t/);
    if (!m) continue;
    files++;
    if (m[1] !== '-') additions += Number(m[1]);
    if (m[2] !== '-') deletions += Number(m[2]);
  }
  return { files, additions, deletions };
}

function cap(diff: string): { text: string; truncated: boolean } {
  if (diff.length <= DIFF_CHAR_CAP) return { text: diff, truncated: false };
  return { text: `${diff.slice(0, DIFF_CHAR_CAP)}\n\n…[diff truncated at ${DIFF_CHAR_CAP} chars — review what is shown]`, truncated: true };
}

/** Current HEAD sha, or null (no commits / not a repo / git missing). */
export async function headSha(cwd: string): Promise<string | null> {
  const out = await git(cwd, ['rev-parse', 'HEAD']);
  const sha = out?.trim();
  return sha && /^[0-9a-f]{40}$/.test(sha) ? sha : null;
}

/**
 * Collect what should be reviewed right now:
 * - dirty working tree → the uncommitted changes vs HEAD (what the user is about to commit);
 * - clean tree → the last commit's patch (what just landed).
 * Untracked files aren't in `git diff HEAD` — noted honestly in the label, never guessed at.
 */
export async function collectDiff(cwd: string): Promise<DiffResult> {
  const sha = await headSha(cwd);
  if (!sha) return { error: 'no commits found (or git is unavailable) — nothing to review' };
  const branch = (await git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']))?.trim() ?? 'HEAD';

  const porcelain = (await git(cwd, ['status', '--porcelain'])) ?? '';
  const dirty = porcelain.trim().length > 0;

  if (dirty) {
    const [patch, numstat] = await Promise.all([
      git(cwd, ['diff', 'HEAD', '--', '.', ...EXCLUDES]),
      git(cwd, ['diff', 'HEAD', '--numstat', '--', '.', ...EXCLUDES]),
    ]);
    if (patch == null) return { error: 'git diff failed' };
    if (patch.trim().length === 0) return { error: 'only untracked/excluded files changed — nothing reviewable yet (add/commit them first)' };
    const { text, truncated } = cap(patch);
    return {
      ref: 'working-tree',
      refLabel: `uncommitted changes on ${branch}`,
      branch,
      diff: text,
      truncated,
      stats: parseNumstat(numstat ?? ''),
    };
  }

  const [subject, patch, numstat] = await Promise.all([
    git(cwd, ['log', '-1', '--format=%s']),
    git(cwd, ['show', 'HEAD', '--format=', '--patch', '--', '.', ...EXCLUDES]),
    git(cwd, ['show', 'HEAD', '--format=', '--numstat', '--', '.', ...EXCLUDES]),
  ]);
  if (patch == null) return { error: 'git show failed' };
  if (patch.trim().length === 0) return { error: 'the last commit touched only excluded files (locks/dist) — nothing reviewable' };
  const { text, truncated } = cap(patch);
  return {
    ref: sha,
    refLabel: `${sha.slice(0, 7)} · ${(subject ?? '').trim() || '(no subject)'}`,
    branch,
    diff: text,
    truncated,
    stats: parseNumstat(numstat ?? ''),
  };
}
