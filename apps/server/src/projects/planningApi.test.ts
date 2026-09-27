import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { PlanningSnapshot } from '@ado/shared';
import { buildServer, type AccServer } from '../app';

it('T07: rejects a dependency cycle through authenticated HTTP with its path, preserving the complete plan across profile reopen', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-planning-api-'));
  const host = { host: '127.0.0.1:8787' }, auth = { ...host, 'x-acc-token': 'planning-fixture-key' };
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: auth['x-acc-token'], dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  let server: AccServer | undefined;
  try {
    server = await buildServer(env, { startSystem: false });
    const app = server.app;
    for (const url of ['/api/planning', '/api/planning/history/anything']) expect((await app.inject({ url, headers: host })).statusCode).toBe(401);
    for (const url of ['/api/planning/tasks', '/api/planning/milestones', '/api/planning/inbox', '/api/planning/inbox/item/promote', '/api/planning/inbox/item/archive']) expect((await app.inject({ method: 'POST', url, headers: host, payload: {} })).statusCode).toBe(401);
    for (const kind of ['tasks', 'milestones']) expect((await app.inject({ method: 'PUT', url: `/api/planning/${kind}/item`, headers: host, payload: {} })).statusCode).toBe(401);
    const project = (await app.inject({ method: 'POST', url: '/api/portfolio/projects', headers: auth, payload: { name: 'Planning fixture', kind: 'app', goal: 'Offline local plan', lifecycle: 'active', focus: true, manualPriority: 1 } })).json().project;
    const call = (path: string, payload: unknown, method: 'POST' | 'PUT' = 'POST') => app.inject({ method, url: `/api/planning${path}`, headers: auth, payload: payload as object });
    const input = { projectId: project.id, repositoryId: null, milestoneId: null, title: 'A', outcome: 'Result', scope: 'Only fixture', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Criterion', required: true }], dependsOn: [] as string[], priority: 1, status: 'ready', sourceRefs: [] };
    const a = (await call('/tasks', input)).json().task;
    const b = (await call('/tasks', { ...input, title: 'B', dependsOn: [a.id] })).json().task;
    const before = PlanningSnapshot.parse((await app.inject({ url: '/api/planning', headers: auth })).json());
    const failed = await call(`/tasks/${a.id}`, { ...input, version: a.version, title: 'Changed title must roll back', dependsOn: [b.id] }, 'PUT');
    expect(failed.statusCode).toBe(409); expect(failed.json().error).toContain('Dependency cycle:'); expect(failed.json().error).toContain(a.id); expect(failed.json().error).toContain(b.id);
    expect(PlanningSnapshot.parse((await app.inject({ url: '/api/planning', headers: auth })).json())).toEqual(before);
    expect((await call('/tasks', { ...input, status: 'accepted' })).statusCode).toBe(400);
    expect((await call(`/tasks/${a.id}`, { ...input, version: 99 }, 'PUT')).statusCode).toBe(409);
    const capture = { idempotencyKey: randomUUID(), text: 'API idea', projectId: null };
    const idea = (await call('/inbox', capture)).json().item;
    expect((await call('/inbox', capture)).json().item).toEqual(idea);
    const promotion = { version: idea.version, projectId: project.id, title: 'Converted task' };
    const promoted = await call(`/inbox/${idea.id}/promote`, promotion);
    expect(promoted.statusCode).toBe(200);
    expect((await call(`/inbox/${idea.id}/promote`, promotion)).json()).toEqual(promoted.json());
    const final = PlanningSnapshot.parse((await app.inject({ url: '/api/planning', headers: auth })).json());
    expect(final.tasks).toHaveLength(3); expect(final.inbox[0].status).toBe('converted');
    expect((await app.inject({ url: `/api/planning/history/${a.id}`, headers: auth })).json().revisions).toHaveLength(1);
    expect((await app.inject({ url: '/api/runs', headers: auth })).json().runs).toEqual([]);
    await server.close(); server = undefined;
    server = await buildServer(env, { startSystem: false });
    expect(PlanningSnapshot.parse((await server.app.inject({ url: '/api/planning', headers: auth })).json())).toEqual(final);
  } finally { await server?.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); }
}, 60000);
