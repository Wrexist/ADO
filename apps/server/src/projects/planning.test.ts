import { randomUUID } from 'node:crypto';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { ProjectRegistry } from './registry';
import { PlanningStore } from './planning';

const projectInput = { name: 'Product', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 };
const criterion = () => ({ id: randomUUID(), text: 'Required check', required: true });
const taskInput = (projectId: string, title = 'Task') => ({ projectId, repositoryId: null, milestoneId: null, title, outcome: 'Expected result', scope: 'Only assigned change', outOfScope: 'Deployment', acceptance: [criterion()], dependsOn: [] as string[], priority: 2, status: 'draft', sourceRefs: [] });

it('rejects two- and three-task cycles atomically, including self-reference, and retains immutable revision history', () => {
  const { db, sqlite } = openDb(':memory:'); const registry = new ProjectRegistry(db, () => [], () => null); const store = new PlanningStore(db);
  try {
    const project = registry.create(projectInput), other = registry.create({ ...projectInput, name: 'Dependency owner' });
    const ai = taskInput(project.id, 'A'), bi = taskInput(other.id, 'B'), ci = taskInput(project.id, 'C');
    const a = store.saveTask(ai), b = store.saveTask({ ...bi, dependsOn: [a.id] }), c = store.saveTask({ ...ci, dependsOn: [b.id] });
    const before = store.snapshot(), history = store.history(a.id);
    for (const dependency of [a.id, b.id, c.id]) expect(() => store.saveTask({ ...ai, version: a.version, title: 'Must not persist', dependsOn: [dependency] }, a.id)).toThrow(/Dependency cycle:.*A/);
    expect(store.snapshot()).toEqual(before); expect(store.history(a.id)).toEqual(history);
    const revised = store.saveTask({ ...ai, version: a.version, title: 'Revised A' }, a.id);
    expect(revised.version).toBe(2); expect(store.history(a.id)).toHaveLength(2);
    expect(() => store.saveTask({ ...ai, version: a.version }, a.id)).toThrow('reload');
    expect(store.snapshot().tasks.find((t) => t.id === b.id)?.blockedBy).toEqual([a.id]);
    expect(() => sqlite.prepare('UPDATE planning_revisions SET version=99').run()).toThrow('immutable');
    expect(() => sqlite.prepare('DELETE FROM planning_revisions').run()).toThrow('immutable');
  } finally { sqlite.close(); }
});

it('keeps project ownership and evidence states separate from editable planning data', async () => {
  const { db, sqlite } = openDb(':memory:'); const registry = new ProjectRegistry(db, () => [], () => null); const store = new PlanningStore(db);
  try {
    const project = registry.create(projectInput), other = registry.create({ ...projectInput, name: 'Other' });
    registry.observeGitHub([{ externalId: '42', owner: 'fixture', name: 'repo', defaultBranch: 'Main', description: null, language: null, stargazers: 0, pushedAt: null }], new Date().toISOString());
    const repo = await registry.importSource({ projectId: other.id, sourceId: 'github:42' });
    const milestone = store.saveMilestone({ projectId: other.id, title: 'Release', exitCriteria: [criterion()], status: 'active' });
    const input = taskInput(project.id);
    for (const status of ['queued', 'active', 'awaiting_review', 'accepted']) expect(() => store.saveTask({ ...input, status })).toThrow();
    expect(() => store.saveTask({ ...input, status: 'ready', acceptance: [] })).toThrow('Ready requires');
    expect(() => store.saveTask({ ...input, repositoryId: repo.repositoryId })).toThrow('Repository must belong');
    expect(() => store.saveTask({ ...input, milestoneId: milestone.id })).toThrow('Milestone must belong');
    expect(() => store.saveMilestone({ projectId: project.id, title: 'Empty', exitCriteria: [], status: 'active' })).toThrow('exit criterion');
    expect(() => store.saveMilestone({ projectId: project.id, title: 'Fake done', exitCriteria: [criterion()], status: 'accepted' })).toThrow();
    expect(() => store.saveTask({ ...input, sourceRefs: ['javascript:alert(1)'] })).toThrow();
    const task = store.saveTask({ ...input, status: 'ready', sourceRefs: ['https://github.com/fixture/repo/issues/1'] });
    expect(() => store.saveTask({ ...input, projectId: other.id, version: task.version }, task.id)).toThrow('cannot be reassigned');
    expect(store.snapshot().tasks[0].status).toBe('ready');
    expect(store.snapshot().tasks).toHaveLength(1);
  } finally { sqlite.close(); }
});

it('deduplicates Inbox capture and conversion and rolls back all rows when revision persistence fails', () => {
  const { db, sqlite } = openDb(':memory:'); const registry = new ProjectRegistry(db, () => [], () => null); const store = new PlanningStore(db);
  try {
    const project = registry.create(projectInput);
    const request = { idempotencyKey: randomUUID(), text: 'Idea without a project', projectId: null };
    const idea = store.capture(request);
    expect(store.capture(request)).toEqual(idea);
    expect(() => store.capture({ ...request, text: 'Different idea' })).toThrow('different content');
    sqlite.exec("CREATE TRIGGER fail_revision BEFORE INSERT ON planning_revisions WHEN NEW.kind='inbox' AND NEW.version=2 BEGIN SELECT RAISE(ABORT,'fixture disk write failure'); END;");
    const promote = { projectId: project.id, title: 'New task', version: idea.version };
    expect(() => store.promote(idea.id, promote)).toThrow('fixture disk write failure');
    expect(store.snapshot().tasks).toEqual([]); expect(store.snapshot().inbox).toEqual([idea]);
    expect(sqlite.prepare("SELECT count(*) AS n FROM planning_revisions WHERE kind='task'").get()).toEqual({ n: 0 });
    sqlite.exec('DROP TRIGGER fail_revision');
    const task = store.promote(idea.id, promote);
    expect(store.promote(idea.id, promote)).toEqual(task);
    expect(task).toMatchObject({ status: 'draft', outcome: request.text, acceptance: [], projectId: project.id });
    expect(store.snapshot().tasks).toHaveLength(1); expect(store.snapshot().inbox[0]).toMatchObject({ status: 'converted', taskId: task.id, version: 2 });
    expect(() => store.promote(idea.id, { ...promote, title: 'Different conversion' })).toThrow('changed');
    expect(() => store.archiveInbox(idea.id, { version: 2 })).toThrow('changed');
    const second = store.capture({ ...request, idempotencyKey: randomUUID() });
    expect(store.archiveInbox(second.id, { version: 1 }).status).toBe('archived');
    expect(store.history(second.id)).toHaveLength(2);
  } finally { sqlite.close(); }
});
