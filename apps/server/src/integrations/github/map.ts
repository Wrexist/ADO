/**
 * Pure mappers GitHub → domain. No I/O, fully unit-tested — the risky external
 * shapes are normalized here so the sync stays simple.
 */
import type { CiState, Language, RepoCategory } from '@ado/shared';
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

/**
 * Latest Actions run → CI bar (DATA_MAP mapping):
 *   queued 10% · in_progress 50% (both amber) · success 100% green · failure red.
 * A failed run renders a full RED bar (state=failed drives the danger tone).
 */
export function ciFromRun(run: GhRun): { label: string; pct: number; state: CiState } {
  if (run.status === 'queued') return { label: run.workflowName, pct: 10, state: 'queued' };
  if (run.status === 'in_progress') return { label: run.workflowName, pct: 50, state: 'running' };
  // completed
  if (run.conclusion === 'success') return { label: run.workflowName, pct: 100, state: 'success' };
  return { label: run.workflowName, pct: 100, state: 'failed' };
}
