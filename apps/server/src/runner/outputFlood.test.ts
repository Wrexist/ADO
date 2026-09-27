import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { getPriority, tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, executionLocks } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from './index';
import { ClaudeSpawner } from './spawner';

it.skipIf(process.platform !== 'win32')('preserves worker priority through the Claude native supervisor', async () => {
  let priority: number | undefined;
  const proc = new ClaudeSpawner(() => ({ command: process.execPath, args: ['-e', 'process.exit(0)'] })).spawn({
    cwd: process.cwd(), prompt: 'Offline priority fixture', turnCap: 1,
    onProcessIdentity: (identity) => { priority = getPriority(identity.pid); },
  });
  try {
    const drain = async () => { for await (const line of proc.lines) expect(line).toBe(''); };
    const [code] = await Promise.all([proc.done, drain()]);
    expect(code).toBe(0);
    expect(priority).toBe(getPriority(process.pid));
    expect(proc.terminationConfirmed?.()).toBe(true);
  } finally { proc.kill(); }
});

it.each(['stderr', 'stdout'] as const)('drains a real %s flood and persists an explicit bounded outcome', async (mode) => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-output-flood-'));
  const file = join(root, 'flood.cjs');
  writeFileSync(file, mode === 'stderr' ? `
    (async()=>{
      const { once } = require('node:events');
      for(let i=0;i<10000;i++) {
        if(!process.stderr.write('diagnostic canary-private-value '+ 'x'.repeat(100)+'\\n')) await once(process.stderr,'drain');
      }
      console.log(JSON.stringify({type:'result',is_error:true,result:'Fixture intentionally failed'}));
      process.exitCode=7;
    })();
  ` : `
    process.on('SIGTERM',()=>{});
    setInterval(()=>process.stdout.write('x'.repeat(65536)),1);
    setTimeout(()=>process.exit(9),70000);
  `);
  const { db, sqlite } = openDb(':memory:');
  const runner = new Runner(new Bus(db), db, new ClaudeSpawner(() => ({ command: process.execPath, args: [file] })), { cwdFor: () => root, secrets: () => ['canary-private-value'], timeoutMs: 75000 });
  let failure: unknown;
  try {
    runner.dispatch({ repoId: 'flood', task: 'Offline flood fixture' });
    // Native startup alone allows 15s. Leave room for startup, flood processing
    // and confirmed process-tree shutdown.
    await expect.poll(() => db.select().from(runs).all()[0]?.status, { timeout: 60000 }).toBe('failed');
    const run = db.select().from(runs).all()[0];
    expect(db.select().from(executionLocks).all()).toHaveLength(0);
    if (process.platform === 'win32') expect(run.processTermination).toBe('confirmed');
    if (mode === 'stderr') {
      expect(run.exitCode).toBe(7);
      expect(run.diagnostics).toContain('diagnostics truncated');
      expect(run.diagnostics).toContain('[redacted]');
      expect(run.diagnostics!.length).toBeLessThan(4000);
      expect(run.diagnostics).not.toContain('canary-private-value');
    } else expect(run.note).toContain('stdout frame exceeds');
  } catch (error) {
    const row = db.select().from(runs).all()[0];
    failure = new Error(`Flood fixture ${mode}: ${JSON.stringify({ status: row?.status, exitCode: row?.exitCode, termination: row?.processTermination, note: row?.note })}`, { cause: error });
  }
  try {
    await runner.stop(); sqlite.close();
    rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  } catch (cleanup) { throw failure ? new AggregateError([failure, cleanup], 'Flood fixture and cleanup both failed') : cleanup; }
  if (failure) throw failure;
}, 90000);
