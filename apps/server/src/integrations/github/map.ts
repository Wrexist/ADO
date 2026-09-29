/**
 * Pure mappers GitHub → domain. No I/O, fully unit-tested — the risky external
 * shapes are normalized here so the sync stays simple.
 */
import type { CiState, Language, RepoCategory, RepoCI } from '@ado/shared';
import type { GhRun } from './types';

export function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/** GitHub `language` string → our Language enum, or undefined (honest: no dot). */
export function toLanguage(lang: string | null): Language | undefined {
  switch ((lang ?? '').toLowerCase()) {
    case 'typescript':
    case 'javascript':
      return 'typescript';
    case 'swift':
      return 'swift';
    case 'liquid':
      return 'liquid';
    case 'python':
      return 'python';
    default:
      return undefined;
  }
}

/** Infer a category from language when the scanner didn't set one. */
export function categoryFromLanguage(lang: string | null): RepoCategory {
  switch ((lang ?? '').toLowerCase()) {
    case 'swift':
    case 'kotlin':
      return 'app';
    case 'python':
    case 'go':
    case 'rust':
      return 'service';
    default:
      return 'web';
  }
}

const SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

/**
 * Latest Actions run → CI bar (DATA_MAP mapping):
 *   Pending progress is unknown; only terminal success/failure receives a full bar.
 * A failed run renders a full RED bar (state=failed drives the danger tone).
 * The run's commit and the branch head read alongside it travel with the result, so a
 * run for an older commit is never presented as a check of the current code (T03).
 */
export function ciFromRun(run: GhRun, branchHeadSha?: string | null): RepoCI {
  const revision: Pick<RepoCI, 'headSha' | 'runTs' | 'branchHeadSha'> = {};
  if (run.headSha && SHA.test(run.headSha)) revision.headSha = run.headSha;
  const started = run.startedAt ? Date.parse(run.startedAt) : NaN;
  if (Number.isFinite(started)) revision.runTs = new Date(started).toISOString();
  if (branchHeadSha && SHA.test(branchHeadSha)) revision.branchHeadSha = branchHeadSha;
  return { ...stateFromRun(run), ...revision };
}

function stateFromRun(run: GhRun): { label: string; pct: number; state: CiState } {
  if (run.status === 'queued') return { label: run.workflowName, pct: 0, state: 'queued' };
  if (run.status === 'in_progress') return { label: run.workflowName, pct: 0, state: 'running' };
  // completed
  if (run.conclusion === 'success') return { label: run.workflowName, pct: 100, state: 'success' };
  if (run.conclusion === 'failure' || run.conclusion === 'timed_out')
    return { label: run.workflowName, pct: 100, state: 'failed' };
  // cancelled / skipped / neutral / null — terminal but NOT a failure; show a neutral
  // state instead of a false red "failed" bar.
  return { label: run.workflowName, pct: 0, state: run.conclusion === 'cancelled' ? 'cancelled' : 'unknown' };
}
