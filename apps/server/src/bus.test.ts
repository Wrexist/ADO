import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { events, runs } from './db/schema';
import { Bus } from './bus';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const event = (id: string) => ({ id, type: 'health.checked', ts: '2026-09-27T00:00:00.000Z', source: { kind: 'health', ref: 'server' }, payload: { service: 'server', state: 'operational' } });
const run = { id: 'atomic', repoId: 'a', task: 'x', model: 'default', status: 'queued', startedTs: '2026-09-27T00:00:00.000Z' };

describe('transactional event outbox', () => {
  it('falls back to an authoritative snapshot when replay has a retained-history gap', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    try {
      bus.publish(event('old'));
      bus.publish(event('middle'));
      bus.publish(event('latest'));
      expect(bus.resumeSince(1).kind).toBe('replay');
      bus.compact();
      expect(bus.resumeSince(1)).toEqual({ kind: 'snapshot', snapshot: bus.snapshot() });
      expect(bus.resumeSince(2).kind).toBe('replay');
      expect(bus.resumeSince(3)).toEqual({ kind: 'replay', frames: [] });
      for (const cursor of [-1, 0.5, NaN, 4, Number.MAX_SAFE_INTEGER + 1]) {
        expect(bus.resumeSince(cursor).kind).toBe('snapshot');
      }
    } finally { sqlite.close(); }
  });

  it('rolls back state and all events when event persistence fails', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    let delivered = 0;
    bus.subscribe(() => { delivered++; });
    sqlite.exec("CREATE TRIGGER reject_event BEFORE INSERT ON events WHEN NEW.id = 'reject' BEGIN SELECT RAISE(ABORT, 'injected failure'); END");
    try {
      expect(() => bus.commit((tx) => tx.insert(runs).values(run).run(), [event('first'), event('reject')])).toThrow('injected failure');
      expect(db.select().from(runs).all()).toEqual([]);
      expect(db.select().from(events).all()).toEqual([]);
      expect(bus.snapshot().seq).toBe(0);
      expect(delivered).toBe(0);
      expect(() => bus.commit((tx) => tx.insert(runs).values(run).run(), [{ invalid: true }])).toThrow();
      expect(db.select().from(runs).all()).toEqual([]);
    } finally { sqlite.close(); }
  });

  it('isolates failed subscribers and preserves order during reentrant publication', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const received: number[] = [];
    bus.subscribe(() => { throw new Error('disconnected client'); });
    bus.subscribe((frame) => {
      if (frame.kind === 'evt' && frame.evt.id === 'first') bus.publish(event('nested'));
    });
    bus.subscribe((frame) => {
      expect(db.select().from(runs).all()).toHaveLength(1);
      if (frame.kind === 'evt') received.push(frame.seq);
    });
    try {
      bus.commit((tx) => tx.insert(runs).values(run).run(), [event('first'), event('second')]);
      expect(received).toEqual([1, 2, 3]);
      expect(bus.snapshot().seq).toBe(3);
      expect(db.select().from(events).all()).toHaveLength(3);
    } finally { sqlite.close(); }
  });

  it.each(['before-commit', 'after-commit'] as const)('recovers consistently after abrupt process exit %s', (point) => {
    const root = mkdtempSync(join(tmpdir(), 'controlos-outbox-'));
    const path = join(root, 'profile.sqlite');
    const code = `
      import { openDb } from ${JSON.stringify(new URL('./db/index.ts', import.meta.url).href)};
      import { runs } from ${JSON.stringify(new URL('./db/schema.ts', import.meta.url).href)};
      import { Bus } from ${JSON.stringify(new URL('./bus.ts', import.meta.url).href)};
      const { db } = openDb(${JSON.stringify(path)});
      const bus = new Bus(db);
      bus.subscribe(() => process.exit(73));
      bus.commit(tx => {
        tx.insert(runs).values(${JSON.stringify(run)}).run();
        if (${JSON.stringify(point)} === 'before-commit') process.exit(73);
      }, [${JSON.stringify(event('committed'))}]);
    `;
    try {
      const child = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { windowsHide: true, encoding: 'utf8', timeout: 30000 });
      expect(child.error, child.stderr).toBeUndefined();
      expect(child.status, child.stderr).toBe(73);
      const { db, sqlite } = openDb(path);
      try {
        const expected = point === 'after-commit' ? 1 : 0;
        expect(db.select().from(runs).all()).toHaveLength(expected);
        expect(db.select().from(events).all()).toHaveLength(expected);
        const recovered = new Bus(db);
        recovered.replayFromDb(() => {});
        expect(recovered.snapshot().seq).toBe(expected);
      } finally { sqlite.close(); }
    } finally { rmSync(root, { recursive: true, force: true }); }
  }, 40000);
});

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
