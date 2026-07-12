import { describe, expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus, type OutFrame } from '../bus';
import { HealthChecker } from './health';

describe('bus.pushSample (Prompt 2.4)', () => {
  it('persists to the samples table (not the event log), folds, and broadcasts on the sample channel', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const frames: OutFrame[] = [];
    bus.subscribe((f) => frames.push(f));

    bus.pushSample(32, 68, 42, '2026-07-09T08:00:00.000Z');

    // folded into the in-memory ring
    const { samples } = bus.snapshot().state;
    expect(samples).toHaveLength(1);
    expect(samples[0]).toMatchObject({ cpuPct: 32, memPct: 68, netPct: 42 });

    // broadcast as a transient 'sample' frame (no seq — never moves the replay cursor)
    expect(frames).toHaveLength(1);
    expect(frames[0].kind).toBe('sample');

    // NOT written to the durable event log
    expect(bus.eventsSince(0)).toHaveLength(0);
    expect(bus.snapshot().seq).toBe(0);
    sqlite.close();
  });

  it('reloads samples from the table on a fresh bus (boot path)', () => {
    const { db, sqlite } = openDb(':memory:');
    new Bus(db).pushSample(10, 20, 30, '2026-07-09T08:00:00.000Z');
    const bus2 = new Bus(db);
    bus2.replayFromDb(() => {});
    expect(bus2.snapshot().state.samples).toHaveLength(1);
    sqlite.close();
  });
});

describe('HealthChecker (Prompt 2.4)', () => {
  it('emits server + runner operational; leaves anthropic unknown without a key (honest No data)', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const hc = new HealthChecker(bus, () => ''); // no anthropic key
    hc.start();
    hc.stop();
    const health = bus.snapshot().state.health;
    expect(health.server?.state).toBe('operational');
    expect(health.runner?.state).toBe('operational'); // in-process runner — reported, not left unknown
    expect(health.anthropic).toBeUndefined(); // never faked without a key
    sqlite.close();
  });

  it('reports the runner state the callback returns (so it can degrade)', () => {
    const { db, sqlite } = openDb(':memory:');
    const bus = new Bus(db);
    const hc = new HealthChecker(bus, () => '', () => {}, () => 'degraded');
    hc.start();
    hc.stop();
    expect(bus.snapshot().state.health.runner?.state).toBe('degraded');
    sqlite.close();
  });
});
