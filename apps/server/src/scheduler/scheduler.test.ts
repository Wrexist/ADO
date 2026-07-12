import { afterEach, describe, expect, it } from 'vitest';
import type Database from 'better-sqlite3';
import { openDb } from '../db';
import { Scheduler } from './index';

const T0 = Date.parse('2026-07-12T00:00:00.000Z');
const HOUR = 60 * 60 * 1000;

let open: Database.Database[] = [];
const db = () => {
  const { db, sqlite } = openDb(':memory:');
  open.push(sqlite);
  return db;
};
afterEach(() => {
  for (const s of open) s.close();
  open = [];
});

describe('catch-up scheduler (convention 13)', () => {
  it('a never-run job is due; a fresh run advances its clock', async () => {
    let clock = T0;
    let ran = 0;
    const s = new Scheduler(db(), () => {}, () => clock);
    const job = { name: 'j', intervalMs: HOUR, run: () => { ran++; } };
    s.register(job);

    expect(s.isDue(job)).toBe(true); // never ran → due
    await s.runNow('j');
    expect(ran).toBe(1);
    expect(s.lastRun('j')).toBe(T0);

    clock = T0 + HOUR / 2;
    expect(s.isDue(job)).toBe(false); // ran 30m ago, interval 1h → not due
    clock = T0 + HOUR;
    expect(s.isDue(job)).toBe(true); // interval elapsed → due again
    s.stop();
  });

  it('fires an overdue job on boot (the whole point of catch-up)', async () => {
    const shared = db();
    // First scheduler runs the job once at T0 and persists last-run.
    const a = new Scheduler(shared, () => {}, () => T0);
    a.register({ name: 'nightly', intervalMs: 24 * HOUR, run: () => {} });
    await a.runNow('nightly');
    a.stop();

    // A fresh scheduler boots two days later — the job is overdue and must fire.
    let ran = 0;
    const b = new Scheduler(shared, () => {}, () => T0 + 2 * 24 * HOUR);
    b.register({ name: 'nightly', intervalMs: 24 * HOUR, run: () => { ran++; } });
    b.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toBe(1);
    b.stop();
  });

  it('does NOT fire a job that ran within its interval on boot', async () => {
    const shared = db();
    const a = new Scheduler(shared, () => {}, () => T0);
    a.register({ name: 'nightly', intervalMs: 24 * HOUR, run: () => {} });
    await a.runNow('nightly');
    a.stop();

    let ran = 0;
    const b = new Scheduler(shared, () => {}, () => T0 + HOUR); // only 1h later
    b.register({ name: 'nightly', intervalMs: 24 * HOUR, run: () => { ran++; } });
    b.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toBe(0); // not overdue → skipped
    b.stop();
  });

  it('runOnBoot fires even when the job is not overdue', async () => {
    const shared = db();
    const a = new Scheduler(shared, () => {}, () => T0);
    a.register({ name: 'rollup', intervalMs: HOUR, run: () => {} });
    await a.runNow('rollup');
    a.stop();

    let ran = 0;
    const b = new Scheduler(shared, () => {}, () => T0 + HOUR / 4); // 15m later, not due
    b.register({ name: 'rollup', intervalMs: HOUR, runOnBoot: true, run: () => { ran++; } });
    b.start();
    await new Promise((r) => setTimeout(r, 10));
    expect(ran).toBe(1); // runOnBoot overrides not-due
    b.stop();
  });

  it('a failing job does not advance its clock, so it retries', async () => {
    let clock = T0;
    const s = new Scheduler(db(), () => {}, () => clock);
    s.register({ name: 'flaky', intervalMs: HOUR, run: () => { throw new Error('boom'); } });
    await s.runNow('flaky');
    expect(s.lastRun('flaky')).toBeNull(); // never marked done
    clock = T0 + 5 * HOUR;
    expect(s.isDue({ name: 'flaky', intervalMs: HOUR, run: () => {} })).toBe(true);
    s.stop();
  });
});
