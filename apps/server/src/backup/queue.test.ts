import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { runs, executionLocks, portfolioRepositories, portfolioCheckouts, planningTasks, planningRevisions, taskExecutions } from '../db/schema';
import { ProjectRegistry } from '../projects/registry';
import { PlanningStore } from '../projects/planning';
import { TaskExecutionStore, taskPrompt } from '../runner/taskExecution';
import { RecoveryQueue } from './queue';

it('cancels only reviewed unstarted jobs, preserves locks, and commits task history and audit together', () => {
  const { db, sqlite } = openDb(':memory:'); const bus = new Bus(db);
  try {
    const project = new ProjectRegistry(db, () => [], () => null).create({ name: 'Recovery fixture', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 });
    const repositoryId = randomUUID(), checkoutId = randomUUID(), now = new Date().toISOString();
    db.insert(portfolioRepositories).values({ id: repositoryId, projectId: project.id, host: 'local', externalId: 'fixture', name: 'Fixture', observedTs: now }).run();
    db.insert(portfolioCheckouts).values({ id: checkoutId, repositoryId, hostId: 'fixture', canonicalPath: '/fixture', pathIdentity: 'fixture', gitIdentity: 'fixture', sourceId: 'fixture', managed: false, observedTs: now }).run();
    const task = new PlanningStore(db).saveTask({ projectId: project.id, repositoryId, milestoneId: null, title: 'Pending task', outcome: 'Keep history', scope: 'Fixture', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Review evidence', required: true }], dependsOn: [], priority: 0, status: 'ready', sourceRefs: [] });
    const input = { repoId: 'fixture', task: taskPrompt(task), model: 'default', status: 'queued', engineVersion: 1, startedTs: now };
    db.insert(runs).values([{ ...input, id: 'queued' }, { ...input, id: 'locked' }, { ...input, id: 'legacy', engineVersion: 0 }, { ...input, id: 'uncertain', processTermination: 'unconfirmed' }, { ...input, id: 'prior-execution', diagnostics: 'Prior process output' }]).run();
    new TaskExecutionStore(db).enqueue('queued', { taskId: task.id, taskVersion: task.version, checkoutId, baseSha: 'a'.repeat(40) }, input.task);
    db.insert(executionLocks).values({ resource: 'fixture', runId: 'locked', owner: 'old-owner', acquiredTs: now }).run();
    const queue = new RecoveryQueue(db, bus), locked = db.select().from(executionLocks).all();
    bus.publish({ id: 'fixture-queued-build', type: 'build.updated', ts: now, source: { kind: 'runner', ref: 'queued' }, payload: { build: { id: 'queued', repo: 'fixture', jobLabel: 'Queued fixture', branch: 'agent', kind: 'agent', state: 'queued', startedTs: null, elapsedSec: null } } });
    for (const id of ['locked', 'legacy', 'uncertain', 'prior-execution']) {
      const review = queue.review(id); expect(review.eligible).toBe(false);
      expect(() => queue.cancel(id, review.digest, 'CANCEL QUEUED JOB')).toThrow('cannot be safely cancelled');
    }
    let review = queue.review('queued'); expect(review.eligible).toBe(true);
    expect(() => queue.cancel('queued', review.digest, 'yes')).toThrow('Explicit');
    db.update(runs).set({ note: 'Updated after review' }).where(eq(runs.id, 'queued')).run();
    expect(() => queue.cancel('queued', review.digest, 'CANCEL QUEUED JOB')).toThrow('changed');
    review = queue.review('queued');
    const beforeTask = db.select().from(planningTasks).get(), beforeRevisions = db.select().from(planningRevisions).all();
    sqlite.exec("CREATE TRIGGER reject_recovery_audit BEFORE INSERT ON events WHEN NEW.id LIKE 'recovery-cancel:%' BEGIN SELECT RAISE(ABORT, 'injected recovery audit failure'); END");
    expect(() => queue.cancel('queued', review.digest, 'CANCEL QUEUED JOB')).toThrow('audit failure');
    expect(db.select().from(runs).where(eq(runs.id, 'queued')).get()?.status).toBe('queued');
    expect(db.select().from(planningTasks).get()).toEqual(beforeTask); expect(db.select().from(planningRevisions).all()).toEqual(beforeRevisions);
    sqlite.exec('DROP TRIGGER reject_recovery_audit');
    expect(queue.cancel('queued', review.digest, 'CANCEL QUEUED JOB')).toMatchObject({ cancelled: true, locksReleased: false });
    expect(db.select().from(runs).where(eq(runs.id, 'queued')).get()).toMatchObject({ status: 'failed', processIdentity: null, processTermination: null, note: 'Cancelled explicitly during recovery review before process start' });
    expect(db.select().from(planningTasks).get()).toMatchObject({ status: 'blocked', version: beforeTask!.version + 1 });
    expect(db.select().from(taskExecutions).get()?.state).toBe('failed');
    expect(db.select().from(planningRevisions).all()).toHaveLength(beforeRevisions.length + 1);
    expect(db.select().from(executionLocks).all()).toEqual(locked);
    expect(() => queue.cancel('queued', review.digest, 'CANCEL QUEUED JOB')).toThrow('changed');
    expect(sqlite.prepare("SELECT count(*) AS n FROM events WHERE id='recovery-cancel:queued'").get()).toEqual({ n: 1 });
    const replay = new Bus(db); replay.replayFromDb(() => {});
    expect(JSON.stringify(replay.snapshot().state)).not.toContain('"state":"queued"');
  } finally { sqlite.close(); }
});
