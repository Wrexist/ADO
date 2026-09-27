import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { buildServer, type AccServer } from '../app';
import { openDb } from '../db';

it('migrates and reopens historical done runs without presenting old verdicts as independent evidence', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-legacy-verification-'));
  const source = fileURLToPath(new URL('../../drizzle/', import.meta.url));
  const old = join(root, 'old-migrations');
  mkdirSync(join(old, 'meta'), { recursive: true });
  const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
  journal.entries = journal.entries.filter((entry) => entry.idx < 5);
  writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
  for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
  const previous = process.env.ACC_MIGRATIONS_DIR;
  const dbPath = join(root, 'profile.sqlite');
  let server: AccServer | undefined;
  let seed: ReturnType<typeof openDb> | undefined;
  try {
    process.env.ACC_MIGRATIONS_DIR = old;
    seed = openDb(dbPath);
    for (const verdict of [null, 'pass', 'fail']) {
      seed.sqlite.prepare('INSERT INTO runs(id,repo_id,task,model,status,verify_verdict,human_action,started_ts,exit_code) VALUES(?,?,?,?,?,?,?,?,?)')
        .run(`legacy-${verdict}`, 'fixture', 'Historical execution', 'default', 'done', verdict, 'accepted', '2026-07-01T00:00:00Z', 0);
    }
    const historical = seed.sqlite.prepare('SELECT id,status,verify_verdict,human_action,exit_code FROM runs ORDER BY id').all();
    seed.sqlite.close(); seed = undefined;
    process.env.ACC_MIGRATIONS_DIR = source;
    const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'legacy-fixture-key' };
    for (let boot = 0; boot < 2; boot++) {
      server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: headers['x-acc-token'], dbPath, projectDirs: [], demo: false }, { startSystem: false, startScanner: false });
      const list = await server.app.inject({ url: '/api/runs', headers });
      expect(list.statusCode).toBe(200);
      expect(list.json().runs).toHaveLength(3);
      for (const row of list.json().runs) {
        expect(row).toMatchObject({ status: 'done', executionStatus: 'succeeded', verifyVerdict: null, humanAction: 'accepted', exitCode: 0, taskId: null });
        const detail = await server.app.inject({ url: `/api/runs/${row.id}`, headers });
        expect(detail.json().run).toMatchObject({ verifyVerdict: null, verificationEvidence: [], approvalHistory: [], approvalPolicyVersion: null });
      }
      await server.close(); server = undefined;
      seed = openDb(dbPath);
      expect(seed.sqlite.prepare('SELECT id,status,verify_verdict,human_action,exit_code FROM runs ORDER BY id').all()).toEqual(historical);
      expect(seed.sqlite.prepare('SELECT * FROM planning_tasks').all()).toEqual([]);
      seed.sqlite.close(); seed = undefined;
    }
  } finally {
    await server?.close(); seed?.sqlite.close();
    if (previous === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previous;
  }
});
