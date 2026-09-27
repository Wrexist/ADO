import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, events } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from './index';
import { parseStreamLine } from './adapter';
import { codexUpdate } from './codex';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeSpawner } from './spawner';

const secret = 'CANARY/private value?&"tail';

it('redacts real child stdout, stderr and provider failure before runner storage and publication', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-child-redaction-'));
  const child = join(root, 'fixture.cjs');
  const credential = 'CANARY-whitespace-sensitive \t';
  writeFileSync(child, `
const secret = ${JSON.stringify(credential)};
const emit = (message) => process.stdout.write(JSON.stringify(message)+'\\n');
emit({type:'system',subtype:'init'});
emit({type:'assistant',message:{content:[{type:'text',text:'stdout '+secret},{type:'tool_use',name:secret}]}});
process.stderr.write('stderr '+secret.slice(0, 12));
process.stderr.write(secret.slice(12)+'\\r\\n');
process.stderr.write('https://example.invalid/?value='+encodeURIComponent(secret)+'\\n');
emit({type:'result',is_error:true,result:'provider error '+secret});
process.exitCode=1;
`);
  const { db, sqlite } = openDb(join(root, 'fixture.sqlite'));
  const bus = new Bus(db), frames: unknown[] = [], logs: string[] = [];
  bus.subscribe((frame) => frames.push(frame));
  const runner = new Runner(bus, db, new ClaudeSpawner(() => ({ command: process.execPath, args: [child] })),
    { cwdFor: () => root, secrets: () => [credential] }, (line) => logs.push(line));
  try {
    const run = runner.dispatch({ repoId: 'canary-fixture', task: 'Offline child output fixture' });
    await expect.poll(() => runner.isLive(run.runId), { timeout: 15000 }).toBe(false);
    const row = db.select().from(runs).all()[0];
    expect(row).toMatchObject({ status: 'failed', exitCode: 1 });
    expect(row.diagnostics).toContain('stderr [redacted]');
    expect(row.diagnostics).toContain('value=[redacted]');
    expect(row.resultText).toBe('provider error [redacted]');
    const exposed = JSON.stringify({ row, events: db.select().from(events).all(), frames, snapshot: bus.snapshot(), timeline: runner.timeline(run.runId), logs });
    expect(exposed).not.toContain('CANARY');
    expect(exposed).toContain('[redacted]');
  } finally { await runner.stop(); sqlite.close(); }
});
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
