import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, executionLocks } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from './index';
import { ClaudeSpawner } from './spawner';

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
    setTimeout(()=>process.exit(9),20000);
  `);
  const { db, sqlite } = openDb(':memory:');
  const runner = new Runner(new Bus(db), db, new ClaudeSpawner(() => ({ command: process.execPath, args: [file] })), { cwdFor: () => root, secrets: () => ['canary-private-value'], timeoutMs: 15000 });
  try {
    runner.dispatch({ repoId: 'flood', task: 'Offline flood fixture' });
    await expect.poll(() => db.select().from(runs).all()[0]?.status, { timeout: 12000 }).toBe('failed');
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
  } finally { await runner.stop(); sqlite.close(); rmSync(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
});
