import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { operationApprovals } from '../db/schema';
import { ApprovalStore } from './approvals';

it('upgrades the previous profile schema without inventing approvals for historical accepted runs', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-approval-migrate-'));
  const previousMigrations = process.env.ACC_MIGRATIONS_DIR;
  const restoreEnvironment = () => { if (previousMigrations === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previousMigrations; };
  let opened: ReturnType<typeof openDb> | undefined;
  try {
    const source = fileURLToPath(new URL('../../drizzle/', import.meta.url));
    const old = join(root, 'old-migrations'); mkdirSync(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx < 9);
    writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
    process.env.ACC_MIGRATIONS_DIR = old;
    const file = join(root, 'profile.sqlite');
    opened = openDb(file);
    opened.sqlite.prepare('INSERT INTO runs(id,repo_id,task,model,status,human_action,started_ts) VALUES(?,?,?,?,?,?,?)').run('legacy', 'legacy-repo', 'Historical judgment', 'default', 'done', 'accepted', '2026-07-01T00:00:00Z');
    const before = (opened.sqlite.prepare('SELECT * FROM runs').all() as Array<Record<string, unknown>>).map((row) => ({ ...row, source_git_identity: null, workspace_kind: null, workspace_git_identity: null }));
    opened.sqlite.close(); opened = undefined;
    process.env.ACC_MIGRATIONS_DIR = source;
    opened = openDb(file);
    expect(opened.sqlite.prepare('SELECT * FROM runs').all()).toEqual(before);
    expect(opened.db.select().from(operationApprovals).all()).toEqual([]);
    const version = new ApprovalStore(opened.db).policyVersion('legacy-repo');
    opened.sqlite.close(); opened = undefined;
    opened = openDb(file);
    expect(new ApprovalStore(opened.db).policyVersion('legacy-repo')).toBe(version);
    expect(opened.sqlite.prepare('SELECT * FROM runs').all()).toEqual(before);
  } finally { opened?.sqlite.close(); restoreEnvironment(); rmSync(root, { recursive: true, force: true }); }
});
