import { describe, it, expect } from 'vitest';
import { ClaudeParser, type FetchFn } from './claudeParser';
import { HeuristicParser } from './parser';

const REPOS = ['sentinel', 'bloom', 'dynasty-manager'];

type SentBody = {
  model: string;
  system: string;
  tools: unknown[];
  tool_choice: { type: string; name: string };
  messages: { role: string; content: string }[];
};
type Captured = { url: string; body: SentBody; headers: Record<string, string> };

/** A fake fetch that returns a Messages-API-shaped response with one tool_use block. */
function toolUseFetch(input: Record<string, unknown>, ok = true, status = 200): { fetch: FetchFn; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetch = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)) as SentBody,
      headers: init.headers as Record<string, string>,
    });
    return {
      ok,
      status,
      json: async () => ({ content: [{ type: 'tool_use', name: 'classify_intent', input }] }),
    } as Response;
  }) as unknown as FetchFn;
  return { fetch, calls };
}

const heuristic = new HeuristicParser();

describe('ClaudeParser', () => {
  it('with no key connected, uses the heuristic parser (honest parsedBy)', async () => {
    const p = new ClaudeParser(() => undefined, heuristic, (async () => {
      throw new Error('should not be called');
    }) as unknown as FetchFn);
    const r = await p.parse('status', REPOS);
    expect(r.type).toBe('status_query');
    expect(r.parsedBy).toBe('heuristic');
  });

  it('with a key, classifies via the forced tool call (parsedBy: claude)', async () => {
    const { fetch, calls } = toolUseFetch({ type: 'dispatch_task', repoId: 'sentinel', task: 'fix the flaky wave test', confidence: 0.92 });
    const p = new ClaudeParser(() => 'sk-test', heuristic, fetch);
    const r = await p.parse('please fix the flaky wave test in sentinel', REPOS);
    expect(r.type).toBe('dispatch_task');
    expect(r.repoId).toBe('sentinel');
    expect(r.task).toBe('fix the flaky wave test');
    expect(r.parsedBy).toBe('claude');
    // convention 11: the command text rides in the user turn, forced tool_choice, versioned header
    expect(calls[0].body.messages[0].content).toContain('flaky wave test');
    expect(calls[0].body.tool_choice).toEqual({ type: 'tool', name: 'classify_intent' });
    expect(calls[0].headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[0].headers['x-api-key']).toBe('sk-test');
  });

  it('drops a hallucinated repo id not in the known set', async () => {
    const { fetch } = toolUseFetch({ type: 'run_gate', repoId: 'does-not-exist', confidence: 0.8 });
    const p = new ClaudeParser(() => 'sk-test', heuristic, fetch);
    const r = await p.parse('gate status of the mystery repo', REPOS);
    expect(r.type).toBe('run_gate');
    expect(r.repoId).toBeUndefined();
    expect(r.parsedBy).toBe('claude');
  });

  it('falls back to heuristic on an API error', async () => {
    const { fetch } = toolUseFetch({}, false, 500);
    const p = new ClaudeParser(() => 'sk-test', heuristic, fetch);
    const r = await p.parse('summarize recent activity', REPOS);
    expect(r.type).toBe('summarize_activity'); // heuristic recovered it
    expect(r.parsedBy).toBe('heuristic');
  });

  it('falls back to heuristic when the tool output fails validation', async () => {
    const { fetch } = toolUseFetch({ type: 'not_a_real_intent', confidence: 2 });
    const p = new ClaudeParser(() => 'sk-test', heuristic, fetch);
    const r = await p.parse('add task to bloom: wire onboarding', REPOS);
    expect(r.type).toBe('create_task'); // heuristic recovered it
    expect(r.parsedBy).toBe('heuristic');
  });

  it('falls back to heuristic when fetch itself throws (network/timeout)', async () => {
    const throwing = (async () => {
      throw new Error('aborted');
    }) as unknown as FetchFn;
    const p = new ClaudeParser(() => 'sk-test', heuristic, throwing);
    const r = await p.parse('status', REPOS);
    expect(r.type).toBe('status_query');
    expect(r.parsedBy).toBe('heuristic');
  });
});
