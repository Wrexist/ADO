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

  it('orders activity + deployments by TIMESTAMP, not arrival (out-of-order seeds/replays)', () => {
    let s = emptyState();
    const act = (id: string, t: string) => parseEvent({
      id: `evt-${id}`, ts: t, source: src, type: 'activity.appended',
      payload: { item: { id, icon: 'check', tone: 'success', title: id, detail: 'd', ts: t } },
    });
    // arrival: new, OLD, mid → must render new, mid, OLD
    s = reduce(s, act('new', '2026-07-09T09:00:00.000Z'));
    s = reduce(s, act('old', '2026-07-01T09:00:00.000Z'));
    s = reduce(s, act('mid', '2026-07-05T09:00:00.000Z'));
    expect(s.activity.map((a) => a.id)).toEqual(['new', 'mid', 'old']);

    const dep = (id: string, t: string) => parseEvent({
      id: `dep-${id}`, ts: t, source: src, type: 'deploy.recorded',
      payload: { deployment: { id, name: id, env: 'staging', ts: t, ok: true } },
    });
    s = reduce(s, dep('d-new', '2026-07-09T09:00:00.000Z'));
    s = reduce(s, dep('d-old', '2026-07-01T09:00:00.000Z'));
    expect(s.deployments.map((d) => d.id)).toEqual(['d-new', 'd-old']);
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

  it('caps builds at 100, evicting oldest TERMINAL first and never live ones', () => {
    let s: BusState = emptyState();
    const mkBuild = (id: string, state: string, startedTs: string | null) => parseEvent({
      id: `bevt-${id}`, ts, source: { kind: 'runner', ref: id }, type: 'build.updated',
      payload: { build: { id, repo: 'r', jobLabel: 'j', branch: 'main', state, startedTs, elapsedSec: null } },
    });
    // 3 live (running) builds must survive regardless of cap
    for (const id of ['live-1', 'live-2', 'live-3']) s = reduce(s, mkBuild(id, 'running', ts));
    // 120 terminal builds with strictly increasing start times
    for (let i = 0; i < 120; i++) {
      s = reduce(s, mkBuild(`done-${String(i).padStart(3, '0')}`, 'success', `2026-07-09T09:00:00.${String(i).padStart(3, '0')}Z`));
    }
    expect(Object.keys(s.builds).length).toBe(100); // bounded, not unbounded
    expect(s.builds['live-1'] && s.builds['live-2'] && s.builds['live-3']).toBeTruthy(); // live never dropped
    expect(s.builds['done-000']).toBeUndefined(); // oldest terminal evicted
    expect(s.builds['done-119']).toBeDefined(); // newest terminal kept
  });

  it('folds stats.snapshot into per-day history (last write per day wins, sorted oldest-first)', () => {
    let s = emptyState();
    const snap = (id: string, day: string, repos: number) => parseEvent({
      id, ts, source: { kind: 'app', ref: 'stats' }, type: 'stats.snapshot',
      payload: { day, values: { repos } },
    });
    s = reduce(s, snap('a', '2026-07-05', 5));
    s = reduce(s, snap('b', '2026-07-07', 7));
    s = reduce(s, snap('c', '2026-07-06', 6));
    s = reduce(s, snap('d', '2026-07-07', 8)); // same day again → replaces, not duplicates
    expect(s.statHistory.repos.map((p) => [p.day, p.value])).toEqual([
      ['2026-07-05', 5],
      ['2026-07-06', 6],
      ['2026-07-07', 8],
    ]);
  });

  it('repo.upserted never clobbers enrichment, even when a field is explicitly undefined', () => {
    // (reduce() directly — the future-emitter footgun the strip-undefined merge guards against)
    let s = reduce(emptyState(), {
      type: 'repo.upserted', ts,
      payload: { repo: { id: 'x', name: 'X', category: 'app', status: 'active', description: 'd', branch: 'main', updatedTs: ts, stars: 42, ci: { label: 'CI', pct: 100, state: 'success' } } },
    });
    expect(s.repos.x.stars).toBe(42);
    s = reduce(s, {
      type: 'repo.upserted', ts,
      payload: { repo: { id: 'x', name: 'X', category: 'app', status: 'testing', description: 'd', branch: 'main', updatedTs: ts, stars: undefined, ci: undefined } },
    });
    expect(s.repos.x.status).toBe('testing'); // base field updated
    expect(s.repos.x.stars).toBe(42); // enrichment preserved despite explicit undefined
    expect(s.repos.x.ci?.state).toBe('success'); // enrichment preserved
  });

  it('carries repoId through activity + deployment events (per-project feeds)', () => {
    let s = reduce(
      emptyState(),
      parseEvent({
        id: 'a1', ts, source: src, type: 'activity.appended',
        payload: { item: { id: 'a1', icon: 'check', tone: 'success', title: 'SENTINEL', detail: 'Build passed', ts, repoId: 'sentinel' } },
      }),
    );
    expect(s.activity[0].repoId).toBe('sentinel');

    s = reduce(
      s,
      parseEvent({
        id: 'd1', ts, source: src, type: 'deploy.recorded',
        payload: { deployment: { id: 'd1', name: 'SENTINEL', env: 'production', ts, ok: true, repoId: 'sentinel' } },
      }),
    );
    expect(s.deployments[0].repoId).toBe('sentinel');

    // back-compat: an event with no repoId still parses (older persisted events replay)
    const legacy = parseEvent({
      id: 'a2', ts, source: src, type: 'activity.appended',
      payload: { item: { id: 'a2', icon: 'branch', tone: 'info', title: 'X', detail: 'commit', ts } },
    });
    expect(reduce(s, legacy).activity[0].repoId).toBeUndefined();
  });

  it('reports incidents newest-first, deduped by id, and attaches a diagnosis on incident.diagnosed', () => {
    const report = (id: string, t: string) => parseEvent({
      id: `ir-${id}-${t}`, ts: t, source: { kind: 'app', ref: id }, type: 'incident.reported',
      payload: { incident: { id, ts: t, source: 'server', kind: 'route-error', message: `boom ${id}`, status: 'open' } },
    });
    let s = reduce(emptyState(), report('i1', '2026-07-09T07:00:00.000Z'));
    s = reduce(s, report('i2', '2026-07-09T07:30:00.000Z'));
    expect(s.incidents.map((i) => i.id)).toEqual(['i2', 'i1']); // newest first
    expect(s.incidents.every((i) => i.status === 'open')).toBe(true);

    // diagnose i1 → merged onto the right record, status flips, others untouched
    s = reduce(s, parseEvent({
      id: 'id-1', ts, source: { kind: 'app', ref: 'i1' }, type: 'incident.diagnosed',
      payload: {
        incidentId: 'i1',
        diagnosis: { summary: 's', rootCause: 'rc', severity: 'high', suggestedFix: 'fix', prevention: 'prev', confidence: 0.9, diagnosedBy: 'claude' },
      },
    }));
    const i1 = s.incidents.find((i) => i.id === 'i1');
    expect(i1?.status).toBe('diagnosed');
    expect(i1?.diagnosis?.severity).toBe('high');
    expect(s.incidents.find((i) => i.id === 'i2')?.diagnosis).toBeUndefined(); // only the target changed

    // a diagnosis for an unknown/evicted incident is a no-op (dropped honestly, never faked)
    const before = s.incidents.length;
    s = reduce(s, parseEvent({
      id: 'id-2', ts, source: { kind: 'app', ref: 'ghost' }, type: 'incident.diagnosed',
      payload: {
        incidentId: 'ghost',
        diagnosis: { summary: 's', rootCause: 'rc', severity: 'low', suggestedFix: 'f', prevention: 'p', confidence: 0.5, diagnosedBy: 'heuristic' },
      },
    }));
    expect(s.incidents.length).toBe(before);
  });

  it('upserts auto-reviews by id (running → done replaces, newest first, capped at 30)', () => {
    const mk = (id: string, status: string, over: Record<string, unknown> = {}) => parseEvent({
      id: `arv-${id}-${status}`, ts, source: { kind: 'app', ref: id }, type: 'autoreview.updated',
      payload: {
        review: {
          id, repoId: 'sentinel', ts, trigger: 'manual', ref: 'abc1234', refLabel: 'abc1234 · fix',
          model: 'claude', status, findings: [], ...over,
        },
      },
    });
    let s = reduce(emptyState(), mk('r1', 'running'));
    expect(s.autoReviews[0].status).toBe('running');

    // done replaces the running row (same id) — no duplicate, verdict + findings attached
    s = reduce(s, mk('r1', 'done', {
      verdict: 'attention',
      summary: 'one real issue',
      findings: [{ severity: 'major', category: 'correctness', file: 'src/a.ts', line: 12, title: 't', detail: 'd', suggestion: 's' }],
    }));
    expect(s.autoReviews).toHaveLength(1);
    expect(s.autoReviews[0].verdict).toBe('attention');
    expect(s.autoReviews[0].findings[0].file).toBe('src/a.ts');

    // a newer review lands first; the ring is capped at 30
    for (let i = 0; i < 35; i++) s = reduce(s, mk(`r-${i}`, 'done', { verdict: 'clean' }));
    expect(s.autoReviews.length).toBe(30);
    expect(s.autoReviews[0].id).toBe('r-34');
  });

  it('caps the incidents ring at 50 (newest kept)', () => {
    let s: BusState = emptyState();
    for (let i = 0; i < 60; i++) {
      s = reduce(s, parseEvent({
        id: `ir-${i}`, ts, source: { kind: 'app', ref: `i${i}` }, type: 'incident.reported',
        payload: { incident: { id: `i${i}`, ts, source: 'web', kind: 'react-render', message: `e${i}`, status: 'open' } },
      }));
    }
    expect(s.incidents.length).toBe(50);
    expect(s.incidents[0].id).toBe('i59'); // newest is first
    expect(s.incidents.some((i) => i.id === 'i0')).toBe(false); // oldest evicted
  });
});
