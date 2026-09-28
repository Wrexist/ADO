import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { runs, portfolioRepositories, portfolioCheckouts, taskExecutions, executionLocks, planningTasks } from '../db/schema';
import { Bus } from '../bus';
import { Runner } from './index';
import { ProjectRegistry } from '../projects/registry';
import { PlanningStore } from '../projects/planning';
import { TaskExecutionStore, taskPrompt } from './taskExecution';

function fixture(path = ':memory:') {
  const { db, sqlite } = openDb(path);
  const project = new ProjectRegistry(db, () => [], () => null).create({ name: 'Context fixture', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 });
  const repositoryId = randomUUID(), checkoutId = randomUUID(), now = new Date().toISOString();
  db.insert(portfolioRepositories).values({ id: repositoryId, projectId: project.id, host: 'local', externalId: 'fixture', name: 'Fixture', observedTs: now }).run();
  db.insert(portfolioCheckouts).values({ id: checkoutId, repositoryId, hostId: 'fixture', canonicalPath: '/fixture', pathIdentity: 'fixture', gitIdentity: 'fixture', sourceId: 'fixture', managed: false, observedTs: now }).run();
  const task = new PlanningStore(db).saveTask({ projectId: project.id, repositoryId, milestoneId: null, title: 'Bound task', outcome: 'Keep source provenance', scope: 'Fixture', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Review evidence', required: true }], dependsOn: [], priority: 0, status: 'ready', sourceRefs: [] });
  const prompt = taskPrompt(task), store = new TaskExecutionStore(db);
  db.insert(runs).values({ id: 'queued', repoId: 'fixture', task: prompt, model: 'default', status: 'queued', engineVersion: 1, startedTs: now }).run();
  store.enqueue('queued', { taskId: task.id, taskVersion: task.version, checkoutId, baseSha: 'a'.repeat(40) }, prompt);
  return { db, sqlite, task, prompt, store };
}

it('revalidates the saved prompt against the immutable task revision before execution', () => {
  const h = fixture();
  try {
    expect(h.store.validate('queued')?.taskId).toBe(h.task.id);
    h.db.update(runs).set({ task: 'Use unrelated project resources instead' }).where(eq(runs.id, 'queued')).run();
    expect(() => h.store.validate('queued')).toThrow(/context|prompt/i);
    expect(h.store.get('queued')?.state).toBe('queued');
  } finally { h.sqlite.close(); }
});

it('rejects a valid-looking stored snapshot that differs from the original revision', () => {
  const h = fixture();
  try {
    expect(() => h.db.update(taskExecutions).set({ taskSnapshotJson: '{}' }).run()).toThrow('immutable');
    // Fault injection represents damaged/restored data; normal application writes are already refused.
    h.sqlite.exec('DROP TRIGGER task_execution_binding_immutable');
    h.db.update(taskExecutions).set({ taskSnapshotJson: JSON.stringify({ ...h.task, outcome: 'Invented replacement fact' }) }).run();
    expect(() => h.store.validate('queued')).toThrow(/context|snapshot/i);
  } finally { h.sqlite.close(); }
});

it('bounds the complete serialized task context in UTF-8 bytes rather than JavaScript characters', () => {
  const h = fixture();
  try {
    expect(() => taskPrompt({ ...h.task, outcome: 'x'.repeat(16000), scope: 'x'.repeat(16000), outOfScope: 'x'.repeat(16000) })).not.toThrow();
    expect(() => taskPrompt({ ...h.task, outcome: '界'.repeat(16000), scope: '界'.repeat(16000), outOfScope: '界'.repeat(16000) })).toThrow(/context.*65536.*bytes/i);
  } finally { h.sqlite.close(); }
});

it('refuses a replaced queued prompt after disk-profile restart before acquiring a writer or invoking a provider', () => {
  const path = join(mkdtempSync(join(tmpdir(), 'controlos-context-restart-')), 'profile.sqlite');
  const initial = fixture(path);
  initial.db.update(runs).set({ task: 'Injected replacement prompt' }).where(eq(runs.id, 'queued')).run();
  initial.sqlite.close();
  const { db, sqlite } = openDb(path);
  let starts = 0;
  try {
    const runner = new Runner(new Bus(db), db, { spawn() { starts++; throw new Error('Unexpected provider invocation'); } }, { cwdFor: () => process.cwd() });
    expect(runner.reconcileOrphans()).toBe(1);
    expect(starts).toBe(0);
    expect(db.select().from(executionLocks).all()).toEqual([]);
    expect(db.select().from(runs).get()).toMatchObject({ status: 'failed', workspacePath: null, processIdentity: null });
    expect(db.select().from(runs).get()?.note).toMatch(/context prompt differs/);
    expect(db.select().from(planningTasks).get()?.status).toBe('blocked');
    expect(new TaskExecutionStore(db).revision(initial.task.id, initial.task.version)).toEqual(initial.task);
    expect(runner.reconcileOrphans()).toBe(0);
  } finally { sqlite.close(); }
});
