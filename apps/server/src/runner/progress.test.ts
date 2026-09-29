import { eq } from 'drizzle-orm';
import { expect, it, vi } from 'vitest';
import { openDb } from '../db';
import { events, runs } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from './index';

it('preserves rapid same-millisecond status updates and never derives progress from 8 reported turns of a 20-turn cap', async () => {
  const { db, sqlite } = openDb(':memory:'), bus = new Bus(db);
  let finish!: (code: number) => void, consumed!: () => void, cap: number | undefined;
  const done = new Promise<number>(accept => { finish = accept; });
  const streamDone = new Promise<void>(accept => { consumed = accept; });
  const clock = vi.spyOn(Date, 'now').mockReturnValue(1790540000000);
  const runner = new Runner(bus, db, { spawn(options) {
    cap = options.turnCap;
    return { lines: (async function* () {
      yield '{"type":"system","subtype":"init","apiKeySource":"none"}';
      yield '{"type":"assistant","message":{"content":[{"type":"text","text":"First update"}]}}';
      yield '{"type":"assistant","message":{"content":[{"type":"text","text":"Latest update"}]}}';
      yield '{"type":"result","subtype":"success","num_turns":8}';
      consumed();
    })(), done, kill: () => finish(1) };
  } }, { cwdFor: () => '/offline-fixture', turnCap: 20 });
  try {
    const { runId } = runner.dispatch({ repoId: 'fixture', task: 'Offline progress observation' });
    await streamDone;
    const updates = db.select().from(events).where(eq(events.type, 'agent.upserted')).all().map(event => JSON.parse(event.payload).agent);
    expect(updates.map(agent => agent.statusLine)).toEqual(['Starting…', 'Working…', 'First update', 'Latest update']);
    expect(updates.every(agent => agent.pct === null)).toBe(true); expect(cap).toBe(20);
    expect(bus.snapshot().state.agents[runId]).toMatchObject({ status: 'running', statusLine: 'Latest update', pct: null });
    clock.mockRestore(); finish(0);
    await expect.poll(() => runner.isLive(runId)).toBe(false);
    expect(db.select().from(runs).get()).toMatchObject({ status: 'done', turns: 8, humanAction: null });
  } finally { clock.mockRestore(); finish(1); await runner.stop(); sqlite.close(); }
});
