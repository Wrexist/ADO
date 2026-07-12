import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { events } from './db/schema';
import { Bus } from './bus';

describe('bus.compact (prune superseded latest-only rows)', () => {
  it('keeps only the latest per key and preserves the folded state', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    let n = 0;
    const ts = () => `2026-07-12T00:00:${String(n).padStart(2, '0')}.000Z`;

    // github: 3 checks (latest = degraded); server: 1 check
    for (const state of ['operational', 'operational', 'degraded'] as const) {
      bus.publish({ id: `h:github:${n}`, type: 'health.checked', ts: ts(), source: { kind: 'health', ref: 'github' }, payload: { service: 'github', state } });
      n++;
    }
    bus.publish({ id: `h:server:${n}`, type: 'health.checked', ts: ts(), source: { kind: 'health', ref: 'server' }, payload: { service: 'server', state: 'operational' } });
    n++;
    // tokens: 2 rollups (latest = 200)
    for (const approxTokens of [100, 200]) {
      bus.publish({ id: `t:${n}`, type: 'tokens.rollup', ts: ts(), source: { kind: 'tokens', ref: 'run-log' }, payload: { approxTokens, windowLabel: '7 days' } });
      n++;
    }

    expect(db.select().from(events).all().length).toBe(6);
    const removed = bus.compact();
    expect(removed).toBe(3); // 2 stale github + 1 stale tokens; server (single) kept
    expect(db.select().from(events).all().length).toBe(3);

    // a fresh bus folding the COMPACTED log yields the same latest values
    const bus2 = new Bus(db);
    bus2.replayFromDb(() => {});
    const s = bus2.snapshot().state;
    expect(s.health.github.state).toBe('degraded');
    expect(s.health.server.state).toBe('operational');
    expect(s.tokens?.approxTokens).toBe(200);
    sqlite.close();
  });
});
