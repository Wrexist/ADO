import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { portfolioProjects, portfolioRepositories, portfolioCheckouts, planningTasks } from '../db/schema';
import { PlanningStore } from '../projects/planning';

it('preserves prior task bindings and verification without inventing criterion acceptance during migration', () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-task-review-migration-'));
  const previous = process.env.ACC_MIGRATIONS_DIR;
  let opened: ReturnType<typeof openDb> | undefined;
  try {
    const source = fileURLToPath(new URL('../../drizzle/', import.meta.url)), old = join(root, 'old-migrations'); mkdirSync(join(old, 'meta'), { recursive: true });
    const journal = JSON.parse(readFileSync(join(source, 'meta/_journal.json'), 'utf8')) as { entries: Array<{ idx: number; tag: string }> };
    journal.entries = journal.entries.filter((entry) => entry.idx < 13);
    writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
    for (const entry of journal.entries) copyFileSync(join(source, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
    process.env.ACC_MIGRATIONS_DIR = old;
    const file = join(root, 'profile.sqlite'); opened = openDb(file);
    const projectId = randomUUID(), repositoryId = randomUUID(), checkoutId = randomUUID(), taskId = randomUUID(), ts = new Date().toISOString(), sha = 'a'.repeat(40);
    opened.db.insert(portfolioProjects).values({ id: projectId, name: 'Old project', kind: 'fixture', goal: '', lifecycle: 'active', focus: false, manualPriority: 0, version: 1, createdTs: ts, updatedTs: ts }).run();
    opened.db.insert(portfolioRepositories).values({ id: repositoryId, projectId, host: 'local', externalId: 'fixture', name: 'Old repository', observedTs: ts }).run();
    opened.db.insert(portfolioCheckouts).values({ id: checkoutId, repositoryId, hostId: 'fixture', canonicalPath: 'fixture', pathIdentity: 'fixture', gitIdentity: 'fixture', sourceId: 'fixture', managed: false, headSha: sha, observedTs: ts }).run();
    opened.db.insert(planningTasks).values({ id: taskId, projectId, repositoryId, title: 'Old task', outcome: 'Outcome', scope: 'Fixture', outOfScope: '', acceptanceJson: JSON.stringify([{ id: randomUUID(), text: 'Criterion', required: true }]), sourceRefsJson: '[]', priority: 0, status: 'awaiting_review', version: 4, createdTs: ts, updatedTs: ts }).run();
    opened.sqlite.prepare('INSERT INTO runs(id,repo_id,task,model,status,human_action,verify_verdict,started_ts) VALUES(?,?,?,?,?,?,?,?)').run('old-run', 'fixture', 'Historical run', 'default', 'done', 'accepted', 'pass', ts);
    opened.sqlite.prepare('INSERT INTO task_executions(run_id,task_id,task_version,task_snapshot_json,checkout_id,base_sha,current_task_version,state,created_ts) VALUES(?,?,?,?,?,?,?,?,?)').run('old-run', taskId, 1, '{"original":"snapshot"}', checkoutId, sha, 4, 'done', ts);
    opened.sqlite.prepare('INSERT INTO verification_evidence(id, run_id, head_sha, diff_digest, command, exit_code, verdict, output, recorded_ts) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(randomUUID(), 'old-run', sha, 'b'.repeat(64), 'npm run verify', 0, 'pass', 'Old evidence', ts);
    const before = { task: opened.db.select().from(planningTasks).all(), binding: opened.sqlite.prepare('SELECT * FROM task_executions').all(), evidence: opened.sqlite.prepare('SELECT * FROM verification_evidence').all() };
    opened.sqlite.close(); opened = undefined; process.env.ACC_MIGRATIONS_DIR = source; opened = openDb(file);
    expect(opened.db.select().from(planningTasks).all()).toEqual(before.task);
    expect(opened.sqlite.prepare('SELECT * FROM task_executions').all()).toEqual(before.binding.map(row => ({ ...(row as object), context_package_id: null, context_digest: null, context_review_version: null })));
    expect(opened.sqlite.prepare('SELECT * FROM verification_evidence').all()).toEqual(before.evidence.map((row) => ({ ...(row as object), attempt_id: null })));
    expect(new PlanningStore(opened.db).snapshot().reviews).toEqual([]);
    expect(new PlanningStore(opened.db).snapshot().tasks[0].status).toBe('awaiting_review');
    expect(() => opened!.sqlite.prepare("UPDATE verification_evidence SET output='replacement'").run()).toThrow('immutable');
  } finally { opened?.sqlite.close(); if (previous === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previous; rmSync(root, { recursive: true, force: true }); }
});
