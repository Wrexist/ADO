import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { portfolioProjects, portfolioRepositories, portfolioCheckouts, planningTasks, runs, taskExecutions, verificationEvidence } from '../db/schema';
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
    opened.db.insert(runs).values({ id: 'old-run', repoId: 'fixture', task: 'Historical run', model: 'default', status: 'done', humanAction: 'accepted', verifyVerdict: 'pass', startedTs: ts }).run();
    opened.db.insert(taskExecutions).values({ runId: 'old-run', taskId, taskVersion: 1, taskSnapshotJson: '{"original":"snapshot"}', checkoutId, baseSha: sha, currentTaskVersion: 4, state: 'done', createdTs: ts }).run();
    opened.db.insert(verificationEvidence).values({ id: randomUUID(), runId: 'old-run', headSha: sha, diffDigest: 'b'.repeat(64), command: 'npm run verify', exitCode: 0, verdict: 'pass', output: 'Old evidence', recordedTs: ts }).run();
    const before = { task: opened.db.select().from(planningTasks).all(), binding: opened.db.select().from(taskExecutions).all(), evidence: opened.db.select().from(verificationEvidence).all() };
    opened.sqlite.close(); opened = undefined; process.env.ACC_MIGRATIONS_DIR = source; opened = openDb(file);
    expect(opened.db.select().from(planningTasks).all()).toEqual(before.task);
    expect(opened.db.select().from(taskExecutions).all()).toEqual(before.binding);
    expect(opened.db.select().from(verificationEvidence).all()).toEqual(before.evidence);
    expect(new PlanningStore(opened.db).snapshot().reviews).toEqual([]);
    expect(new PlanningStore(opened.db).snapshot().tasks[0].status).toBe('awaiting_review');
    expect(() => opened!.sqlite.prepare("UPDATE verification_evidence SET output='replacement'").run()).toThrow('immutable');
  } finally { opened?.sqlite.close(); if (previous === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previous; rmSync(root, { recursive: true, force: true }); }
});
