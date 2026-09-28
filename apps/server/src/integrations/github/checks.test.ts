import { expect, it } from 'vitest';
import { OctokitClient } from './client';

const sha = 'a'.repeat(40);
const success = { id: 1, head_sha: sha, status: 'completed', conclusion: 'success' };
it.each([
  { label: 'complete success', total: 1, checks: [success], expected: 'passing' },
  { label: 'partial success page', total: 51, checks: [success], expected: null },
  { label: 'no checks', total: 0, checks: [], expected: null },
  { label: 'missing conclusion', total: 1, checks: [{ ...success, conclusion: null }], expected: null },
  { label: 'new conclusion', total: 1, checks: [{ ...success, conclusion: 'future_result' }], expected: null },
  { label: 'skipped check', total: 1, checks: [{ ...success, conclusion: 'skipped' }], expected: null },
  { label: 'neutral check', total: 1, checks: [{ ...success, conclusion: 'neutral' }], expected: null },
  { label: 'different revision', total: 1, checks: [{ ...success, head_sha: 'b'.repeat(40) }], expected: null },
  { label: 'failure for different revision', total: 1, checks: [{ ...success, head_sha: 'b'.repeat(40), conclusion: 'failure' }], expected: null },
  { label: 'duplicate check identity', total: 2, checks: [success, success], expected: null },
  { label: 'new status', total: 1, checks: [{ ...success, status: 'future_status' }], expected: null },
  { label: 'in-progress check', total: 1, checks: [{ ...success, status: 'in_progress', conclusion: null }], expected: 'pending' },
  { label: 'failed check on partial page', total: 51, checks: [{ ...success, conclusion: 'failure' }], expected: 'failing' },
  { label: 'action required', total: 1, checks: [{ ...success, conclusion: 'action_required' }], expected: 'failing' },
])('does not invent passing check evidence: $label', async fixture => {
  const requests: string[] = [];
  const fake = (async (input: string | URL | Request) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    requests.push(url);
    const data = url.includes('/check-runs') ? { total_count: fixture.total, check_runs: fixture.checks }
      : url.includes('/pulls/1') ? { mergeable: true }
      : [{ number: 1, title: 'Fixture PR', html_url: 'https://github.com/fixture/repo/pull/1', head: { sha } }];
    return new Response(JSON.stringify(data), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;
  const result = await new OctokitClient('fixture-token', fake).openPrForBranch('fixture', 'repo', 'main');
  expect(result?.checks).toBe(fixture.expected);
  expect(requests).toHaveLength(3);
  expect(requests[2]).toContain(`/commits/${sha}/check-runs`);
});
