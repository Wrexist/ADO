import { createHash, randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { InboxInput, InboxItem, MilestoneInput, PlanningExecution, PlanningMilestone, PlanningTask, TaskInput } from '@ado/shared';
import type { Db } from '../db';
import { portfolioProjects as projects, portfolioRepositories as repositories, planningTasks as tasks, planningMilestones as milestones, planningDependencies as dependencies, planningInbox as inbox, planningRevisions as revisions, taskExecutions, executionLocks } from '../db/schema';

const version = z.number().int().positive();
const hash = (data: unknown) => createHash('sha256').update(JSON.stringify(data)).digest('hex');
const taskView = (row: typeof tasks.$inferSelect, edges: Array<typeof dependencies.$inferSelect>, all: Array<typeof tasks.$inferSelect>) => {
  const { acceptanceJson, sourceRefsJson, ...rest } = row;
  const dependsOn = edges.filter((e) => e.taskId === row.id).map((e) => e.dependsOn);
  return PlanningTask.parse({ ...rest, acceptance: JSON.parse(acceptanceJson), sourceRefs: JSON.parse(sourceRefsJson), dependsOn, blockedBy: dependsOn.filter((id) => all.find((t) => t.id === id)?.status !== 'accepted') });
};
const milestoneView = ({ exitCriteriaJson, ...row }: typeof milestones.$inferSelect) => PlanningMilestone.parse({ ...row, exitCriteria: JSON.parse(exitCriteriaJson) });

/** Local planning transactions. No external writes, dispatch or fabricated acceptance. */
export class PlanningStore {
  constructor(private db: Db) {}

  snapshot() {
    return this.db.transaction(() => {
      const all = this.db.select().from(tasks).all(), edges = this.db.select().from(dependencies).all();
      return {
        tasks: all.map((t) => taskView(t, edges, all)),
        milestones: this.db.select().from(milestones).all().map(milestoneView),
        inbox: this.db.select().from(inbox).all().map((row) => InboxItem.parse(row)),
        executions: this.db.select().from(taskExecutions).all().map((row) => PlanningExecution.parse(row)),
      };
    });
  }

  private project(id: string) {
    if (!this.db.select().from(projects).where(eq(projects.id, id)).get()) throw new Error('Project not found');
  }

  private record(kind: string, row: { id: string; version: number }) {
    this.db.insert(revisions).values({ id: randomUUID(), entityId: row.id, kind, version: row.version, snapshotJson: JSON.stringify(row), recordedTs: new Date().toISOString() }).run();
  }

  history(id: string) {
    return this.db.select().from(revisions).where(eq(revisions.entityId, id)).orderBy(asc(revisions.version)).all().map(({ snapshotJson, ...row }) => ({ ...row, snapshot: JSON.parse(snapshotJson) }));
  }

  saveTask(input: unknown, id?: string) {
    const request = (id ? TaskInput.extend({ version }).strict() : TaskInput.extend({ version: z.undefined() }).strict()).parse(input);
    return this.db.transaction(() => {
      const existing = id ? this.db.select().from(tasks).where(eq(tasks.id, id)).get() : undefined;
      if (id && (!existing || existing.version !== request.version)) throw new Error('Task changed or is missing; reload before saving');
      if (existing && existing.projectId !== request.projectId) throw new Error('Task project identity cannot be reassigned');
      if (existing && !['draft', 'ready', 'blocked', 'archived'].includes(existing.status)) throw new Error('Execution or reviewed task requires its dedicated lifecycle operation');
      if (existing && this.db.select().from(taskExecutions).innerJoin(executionLocks, eq(taskExecutions.runId, executionLocks.runId)).where(eq(taskExecutions.taskId, existing.id)).get()) throw new Error('Task process stop is not confirmed; editing remains blocked');
      this.project(request.projectId);
      if (request.repositoryId && this.db.select().from(repositories).where(eq(repositories.id, request.repositoryId)).get()?.projectId !== request.projectId) throw new Error('Repository must belong to this project');
      if (request.milestoneId && this.db.select().from(milestones).where(eq(milestones.id, request.milestoneId)).get()?.projectId !== request.projectId) throw new Error('Milestone must belong to this project');
      if (request.status === 'ready' && (!request.outcome.trim() || !request.scope.trim() || !request.acceptance.some((c) => c.required))) throw new Error('Ready requires an outcome, scope and at least one required acceptance criterion');
      const taskId = id ?? randomUUID();
      this.checkDependencies(taskId, request.dependsOn);
      const { dependsOn, acceptance, sourceRefs, version: _version, ...data } = request;
      void _version;
      const now = new Date().toISOString();
      const row = { ...data, id: taskId, acceptanceJson: JSON.stringify(acceptance), sourceRefsJson: JSON.stringify(sourceRefs), version: (existing?.version ?? 0) + 1, createdTs: existing?.createdTs ?? now, updatedTs: now };
      if (existing) this.db.update(tasks).set(row).where(and(eq(tasks.id, taskId), eq(tasks.version, existing.version))).run();
      else this.db.insert(tasks).values(row).run();
      this.db.delete(dependencies).where(eq(dependencies.taskId, taskId)).run();
      for (const dependsOn of request.dependsOn) this.db.insert(dependencies).values({ taskId, dependsOn }).run();
      const result = taskView(row, dependsOn.map((dependsOn) => ({ taskId, dependsOn })), this.db.select().from(tasks).all());
      this.record('task', result);
      return result;
    });
  }

  private checkDependencies(id: string, next: string[]) {
    const all = this.db.select().from(tasks).all();
    const names = new Map(all.map((t) => [t.id, t.title]));
    for (const dependency of next) if (dependency !== id && !names.has(dependency)) throw new Error(`Dependency not found: ${dependency}`);
    const edges = this.db.select().from(dependencies).all().filter((e) => e.taskId !== id);
    const graph = new Map<string, string[]>();
    for (const edge of edges) graph.set(edge.taskId, [...(graph.get(edge.taskId) ?? []), edge.dependsOn]);
    for (const dependency of next) {
      const queue = [[dependency]], visited = new Set<string>();
      while (queue.length) {
        const path = queue.shift()!, node = path[path.length - 1];
        if (node === id) throw new Error(`Dependency cycle: ${[id, ...path].map((key) => `${names.get(key) ?? 'New task'} [${key}]`).join(' -> ')}`);
        if (visited.has(node)) continue;
        visited.add(node);
        for (const child of graph.get(node) ?? []) queue.push([...path, child]);
      }
    }
  }

  saveMilestone(input: unknown, id?: string) {
    const request = (id ? MilestoneInput.extend({ version }).strict() : MilestoneInput.extend({ version: z.undefined() }).strict()).parse(input);
    return this.db.transaction(() => {
      this.project(request.projectId);
      const existing = id ? this.db.select().from(milestones).where(eq(milestones.id, id)).get() : undefined;
      if (id && (!existing || existing.version !== request.version)) throw new Error('Milestone changed or is missing; reload before saving');
      if (existing && existing.projectId !== request.projectId) throw new Error('Milestone project identity cannot be reassigned');
      if (request.status === 'active' && !request.exitCriteria.some((c) => c.required)) throw new Error('Active milestone requires a required exit criterion');
      const now = new Date().toISOString();
      const row = { id: id ?? randomUUID(), projectId: request.projectId, title: request.title, exitCriteriaJson: JSON.stringify(request.exitCriteria), status: request.status, version: (existing?.version ?? 0) + 1, createdTs: existing?.createdTs ?? now, updatedTs: now };
      if (existing) this.db.update(milestones).set(row).where(and(eq(milestones.id, row.id), eq(milestones.version, existing.version))).run();
      else this.db.insert(milestones).values(row).run();
      const result = milestoneView(row); this.record('milestone', result); return result;
    });
  }

  capture(input: unknown) {
    const request = InboxInput.parse(input), requestHash = hash(request);
    return this.db.transaction(() => {
      const old = this.db.select().from(inbox).where(eq(inbox.idempotencyKey, request.idempotencyKey)).get();
      if (old) { if (old.requestHash !== requestHash) throw new Error('Capture key already used for different content'); return InboxItem.parse(old); }
      if (request.projectId) this.project(request.projectId);
      const now = new Date().toISOString();
      const row = { ...request, id: randomUUID(), requestHash, taskId: null, promotionHash: null, status: 'captured', version: 1, createdTs: now, updatedTs: now };
      this.db.insert(inbox).values(row).run(); const result = InboxItem.parse(row); this.record('inbox', result); return result;
    });
  }

  promote(id: string, input: unknown) {
    const request = z.object({ version, projectId: z.string().uuid(), title: z.string().trim().min(1).max(200) }).strict().parse(input);
    return this.db.transaction(() => {
      const old = this.db.select().from(inbox).where(eq(inbox.id, id)).get();
      if (!old) throw new Error('Inbox item not found');
      if (old.taskId && old.promotionHash === hash(request)) return this.snapshot().tasks.find((t) => t.id === old.taskId)!;
      if (old.version !== request.version || old.status !== 'captured') throw new Error('Inbox item changed; reload before converting');
      const task = this.saveTask({ projectId: request.projectId, repositoryId: null, milestoneId: null, title: request.title, outcome: old.text, scope: '', outOfScope: '', acceptance: [], sourceRefs: [], dependsOn: [], priority: 0, status: 'draft' });
      const row = { ...old, taskId: task.id, promotionHash: hash(request), status: 'converted', version: old.version + 1, updatedTs: new Date().toISOString() };
      this.db.update(inbox).set(row).where(eq(inbox.id, id)).run(); this.record('inbox', InboxItem.parse(row)); return task;
    });
  }

  archiveInbox(id: string, input: unknown) {
    const request = z.object({ version }).strict().parse(input);
    return this.db.transaction(() => {
      const old = this.db.select().from(inbox).where(eq(inbox.id, id)).get();
      if (!old || old.version !== request.version || old.status !== 'captured') throw new Error('Inbox item changed; reload before archiving');
      const row = { ...old, status: 'archived', version: old.version + 1, updatedTs: new Date().toISOString() };
      this.db.update(inbox).set(row).where(eq(inbox.id, id)).run(); const result = InboxItem.parse(row); this.record('inbox', result); return result;
    });
  }
}
