import { expect, it } from 'vitest';
import { parseStreamLine } from './adapter';
import { openDb } from '../db';
import { Bus } from '../bus';
import { runs, events } from '../db/schema';
import { Runner } from './index';

const incompatible = [
  {}, { is_error: 'false' }, { subtype: 'future-canary-private-value' },
  { subtype: 'success', is_error: true }, { subtype: 'error_during_execution', is_error: false },
  { subtype: 'success', num_turns: -1 }, { subtype: 'success', num_turns: 1.5 },
  { subtype: 'success', usage: [] }, { subtype: 'success', usage: { input_tokens: '12' } },
  { subtype: 'success', usage: { output_tokens: -1 } },
];
it.each(incompatible)('rejects incompatible required result fields: %j', (fields) => {
  expect(() => parseStreamLine(JSON.stringify({ type: 'result', ...fields }))).toThrow('Claude result protocol is incompatible');
});

it.each([false, true])('accepts an explicit error flag %s without inventing absent usage', (is_error) => {
  expect(parseStreamLine(JSON.stringify({ type: 'result', is_error }))).toEqual([
    { kind: 'done', ok: !is_error, tokensIn: null, tokensOut: null, turns: null, resultText: null },
  ]);
});

it('stops and persists protocol failure even when the process exits zero', async () => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  let stopped = 0;
  const runner = new Runner(bus, db, { spawn: () => ({
    lines: (async function* () { yield JSON.stringify({ type: 'result', subtype: 'future-canary-private-value', result: 'canary-private-value' }); })(),
    done: Promise.resolve(0), kill() { stopped++; },
  }) }, { cwdFor: () => process.cwd() });
  try {
    const run = runner.dispatch({ repoId: 'fixture', task: 'Offline incompatible result' });
    await expect.poll(() => runner.isLive(run.runId)).toBe(false);
    expect(stopped).toBe(1);
    expect(db.select().from(runs).all()[0]).toMatchObject({ status: 'failed', note: 'Claude result protocol is incompatible', resultText: null });
    expect(JSON.stringify({ runs: db.select().from(runs).all(), events: db.select().from(events).all(), snapshot: bus.snapshot() })).not.toContain('canary-private-value');
  } finally { await runner.stop(); sqlite.close(); }
});
