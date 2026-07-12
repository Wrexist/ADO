import { describe, it, expect } from 'vitest';
import { Notifier, type PostFn } from './notifier';

function setup(targets: { slack?: string; discord?: string }, nowRef = { t: 1_000 }) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const post: PostFn = async (url, body) => {
    calls.push({ url, body: body as Record<string, unknown> });
  };
  const n = new Notifier(() => targets, post, () => {}, () => nowRef.t);
  return { n, calls, nowRef };
}

describe('Notifier', () => {
  it('posts to connected Slack + Discord with each platform’s body shape', () => {
    const { n, calls } = setup({ slack: 'https://slack', discord: 'https://discord' });
    n.buildFailed('SENTINEL', '#142 Build and Test');
    expect(calls).toHaveLength(2);
    expect(calls.find((c) => c.url === 'https://slack')?.body.text).toContain('SENTINEL');
    expect(calls.find((c) => c.url === 'https://discord')?.body.content).toContain('SENTINEL');
  });

  it('sends nothing when no webhook is connected (connecting one is the opt-in)', () => {
    const { n, calls } = setup({});
    n.buildFailed('X', 'job');
    n.deployRecorded('X', 'production', true);
    expect(calls).toHaveLength(0);
  });

  it('formats deploy success vs failure honestly', () => {
    const ok = setup({ slack: 'https://s' });
    ok.n.deployRecorded('Bloom', 'testflight', true);
    expect(String(ok.calls[0].body.text)).toMatch(/succeeded.*Bloom.*testflight/);
    const bad = setup({ slack: 'https://s' });
    bad.n.deployRecorded('Bloom', 'production', false);
    expect(String(bad.calls[0].body.text)).toMatch(/FAILED/);
  });

  it('dedups the same event within the window, then allows it again', () => {
    const nowRef = { t: 1_000 };
    const { n, calls } = setup({ slack: 'https://s' }, nowRef);
    n.buildFailed('R', 'job');
    n.buildFailed('R', 'job'); // within 60s → deduped
    expect(calls).toHaveLength(1);
    nowRef.t += 61_000;
    n.buildFailed('R', 'job');
    expect(calls).toHaveLength(2);
  });
});
