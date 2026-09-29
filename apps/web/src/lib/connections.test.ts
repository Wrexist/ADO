import { describe, expect, it } from 'vitest';
import { describeFailure, shapeWarning } from './connections';

describe('connection form help', () => {
  it('warns, without blocking, when a key has the wrong shape', () => {
    expect(shapeWarning('github', 'ghp_abc123')).toBeNull();
    expect(shapeWarning('github', ' github_pat_11ABC_def ')).toBeNull();
    expect(shapeWarning('github', 'sk-ant-abc')).toContain('ghp_');
    expect(shapeWarning('anthropic', 'ghp_abc')).toContain('sk-ant-');
    expect(shapeWarning('slack', 'https://example.com/hook')).toContain('hooks.slack.com');
    expect(shapeWarning('figma', 'anything')).toBeNull();
    expect(shapeWarning('github', '')).toBeNull();
  });

  it('turns failed responses into actionable sentences', async () => {
    expect(await describeFailure(new Response('{}', { status: 401 }), 'save')).toContain('enter the access key again');
    expect(await describeFailure(Response.json({ error: 'value is empty' }, { status: 400 }), 'save')).toBe('Paste a key first.');
    expect(await describeFailure(Response.json({ error: 'Connection store is unreadable.' }, { status: 400 }), 'save')).toBe('Connection store is unreadable.');
    expect(await describeFailure(new Response('<html>oops</html>', { status: 502 }), 'save the key')).toBe('Could not save the key (server answered 502).');
  });
});
