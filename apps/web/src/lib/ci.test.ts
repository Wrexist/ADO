import { describe, expect, it } from 'vitest';
import type { Repo, RepoCI } from '@ado/shared';
import { ciView } from './ci';
import { projectStatus } from './selectors';

const OLD = 'a'.repeat(40), NEW = 'b'.repeat(40);
const NOW = Date.parse('2026-09-29T10:00:00Z');
const base: RepoCI = { label: 'CI', pct: 100, state: 'success', runTs: '2026-09-29T07:00:00Z' };
const repo = (ci: RepoCI): Repo => ({ id: 'r', name: 'R', category: 'web', status: 'active', description: '', branch: 'main', updatedTs: '2026-09-29T09:00:00Z', ci });

describe('CI revision display (T03)', () => {
  it('shows a matching run as a check of the current code', () => {
    const ci = { ...base, headSha: NEW, branchHeadSha: NEW };
    expect(ciView(ci, NOW)).toMatchObject({ current: true, tone: 'gradient', slot: '100%', note: null });
    expect(projectStatus(repo(ci))?.kind).toBe('passing');
  });

  it('shows an older green run with its SHA and age, never as passing', () => {
    const ci = { ...base, headSha: OLD, branchHeadSha: NEW };
    expect(ciView(ci, NOW)).toEqual({ revision: 'older', current: false, tone: 'muted', slot: 'older', note: 'Run for aaaaaaa · 3h ago · not head bbbbbbb (success)' });
    expect(projectStatus(repo(ci))).toEqual({ kind: 'older', label: 'Older commit', detail: 'aaaaaaa' });
  });

  it('treats a missing head or run revision as unverified, including failures', () => {
    for (const ci of [{ ...base, headSha: OLD }, { ...base, branchHeadSha: NEW }, { ...base, state: 'failed' as const }]) {
      expect(ciView(ci, NOW)).toMatchObject({ current: false, tone: 'muted', slot: 'unverified' });
      expect(projectStatus(repo(ci))?.kind).toBe('unverified');
    }
  });
});
