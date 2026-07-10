import { describe, it, expect } from 'vitest';
import { parseEvent } from './events';
import { emptyState, reduce, type BusState } from './state';

const src = { kind: 'demo', ref: 'test' } as const;
const ts = '2026-07-09T08:00:00.000Z';

describe('bus reducer (shared by server snapshot + web deltas)', () => {
  it('upserts repos and removes them', () => {
    let s = emptyState();
    const repo = {
      id: 'sentinel',
      name: 'SENTINEL',
      category: 'game',
      status: 'active',
      description: 'Tactical defense game',
      branch: 'main',
      updatedTs: ts,
      agents: ['builder'],
    };
    const evt = parseEvent({
      id: 'e1', ts, source: src, type: 'repo.upserted', payload: { repo },
    });
    s = reduce(s, evt);
    expect(s.repos.sentinel.name).toBe('SENTINEL');

    s = reduce(s, parseEvent({
      id: 'e2', ts, source: src, type: 'repo.removed', payload: { repoId: 'sentinel' },
    }));
    expect(s.repos.sentinel).toBeUndefined();
  });

  it('caps the samples ring at 360 (1h of 10s samples)', () => {
    let s: BusState = emptyState();
    for (let i = 0; i < 400; i++) {
      s = reduce(s, parseEvent({
        id: `smp-${i}`, ts, source: { kind: 'sysmon', ref: `s${i}` },
        type: 'system.sample', payload: { cpuPct: 10, memPct: 20, netPct: 30 },
      }));
    }
    expect(s.samples.length).toBe(360);
  });

  it('keeps activity newest-first, deduped by id', () => {
    let s = emptyState();
    const mk = (id: string, t: string) => parseEvent({
      id: `evt-${id}-${t}`, ts: t, source: src, type: 'activity.appended',
      payload: { item: { id, icon: 'check', tone: 'success', title: id, detail: 'd', ts: t } },
    });
    s = reduce(s, mk('a', '2026-07-09T07:00:00.000Z'));
    s = reduce(s, mk('b', '2026-07-09T07:30:00.000Z'));
    s = reduce(s, mk('a', '2026-07-09T07:45:00.000Z')); // re-append dedupes
    expect(s.activity.map((a) => a.id)).toEqual(['a', 'b']);
  });

  it('ignores unknown event types without crashing (forward compatibility)', () => {
    const s = emptyState();
    const out = reduce(s, { type: 'future.event', ts, payload: {} });
    expect(out).toEqual(s);
  });

  it('tokens.rollup with null renders as honest unavailable, never a number', () => {
    const s = reduce(emptyState(), parseEvent({
      id: 'tk1', ts, source: { kind: 'tokens', ref: 'rollup' },
      type: 'tokens.rollup', payload: { approxTokens: null, windowLabel: '7 days' },
    }));
    expect(s.tokens?.approxTokens).toBeNull();
  });
});
