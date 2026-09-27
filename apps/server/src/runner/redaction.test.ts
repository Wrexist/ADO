import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, events } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from './index';
import { parseStreamLine } from './adapter';
import { codexUpdate } from './codex';

const secret = 'CANARY/private value?&"tail';
it('redacts before progress/result truncation in both adapters', () => {
  const text = ('x'.repeat(70) + secret).padEnd(3990, 'x') + secret;
  const updates = [
    ...parseStreamLine(JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text }, { type: 'tool_use', name: secret }] } }), [secret]),
    ...parseStreamLine(JSON.stringify({ type: 'result', result: text }), [secret]),
    ...codexUpdate('item/completed', { item: { type: 'agentMessage', text } }, [secret]),
  ];
  expect(JSON.stringify(updates)).not.toContain('CANARY');
  expect(JSON.stringify(updates)).toContain('[redacted]');
});

it.each(['output', 'error'] as const)('keeps canaries out of stored runs, timeline, event export and logs (%s)', async (mode) => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  const frames: unknown[] = []; bus.subscribe((frame) => frames.push(frame));
  const logs: string[] = [];
  const runner = new Runner(bus, db, { spawn() {
    if (mode === 'error') throw new Error(`provider failed https://example.invalid/?token=${encodeURIComponent(secret)}`);
    return { lines: (async function* () {
      yield JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: secret }, { type: 'text', text: 'x'.repeat(70) + secret }] } });
      yield JSON.stringify({ type: 'result', result: 'x'.repeat(3990) + secret });
    })(), done: Promise.resolve(0), kill() {}, diagnostics: () => `URL https://example.invalid/?token=${encodeURIComponent(secret)}` };
  } }, { cwdFor: () => process.cwd(), secrets: () => [secret] }, (line) => logs.push(line));
  try {
    runner.dispatch({ repoId: 'test', task: 'Canary output fixture' });
    await expect.poll(() => db.select().from(runs).all()[0]?.status).toBe(mode === 'output' ? 'done' : 'failed');
    const row = db.select().from(runs).all()[0];
    const exported = JSON.stringify({ row, events: db.select().from(events).all(), frames, snapshot: bus.snapshot(), timeline: runner.timeline(row.id), logs });
    expect(exported).not.toContain('CANARY');
    expect(exported).toContain('[redacted]');
  } finally { await runner.stop(); sqlite.close(); }
});
