import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { UniverseSnapshot } from '@ado/shared';
import { buildServer } from '../app';

it('preserves explicit relations across restart, refuses duplicates/stale removal and never changes execution or planning', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-universe-'));
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: 'universe-fixture', dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  let server = await buildServer(env, { startSystem: false, startScanner: false });
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': env.accToken };
  try {
    const call = (url: string, payload: object, method: 'POST' | 'DELETE' = 'POST') => server.app.inject({ method, url, headers, payload });
    const read = async () => UniverseSnapshot.parse((await server.app.inject({ url: '/api/universe', headers })).json());
    expect((await server.app.inject({ url: '/api/universe', headers: { host: headers.host } })).statusCode).toBe(401);
    expect((await read()).nodes).toEqual([]);
    const project = (await call('/api/portfolio/projects', { name: 'Same name', kind: 'app', goal: '', lifecycle: 'active', focus: true, manualPriority: 1 })).json().project;
    const other = (await call('/api/portfolio/projects', { name: 'Same name', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 1 })).json().project;
    await call('/api/planning/inbox', { idempotencyKey: randomUUID(), text: 'Idea', projectId: project.id });
    await call('/api/planning/milestones', { projectId: project.id, title: 'Milestone', exitCriteria: [], status: 'planned' });
    const before = (await server.app.inject({ url: '/api/planning', headers })).json();
    const resource = { id: randomUUID(), projectId: project.id, title: 'Resource', reference: 'file://fixture/never-read', source: 'Manual fixture' };
    expect((await call('/api/universe/resources', resource)).statusCode).toBe(200);
    expect((await call('/api/universe/resources', resource)).statusCode).toBe(200);
    expect((await call('/api/universe/resources', { ...resource, title: 'Changed retry' })).statusCode).toBe(409);
    const relation = { id: randomUUID(), fromKey: `project:${project.id}`, toKey: `project:${other.id}`, kind: 'related_to', source: 'Explicit owner decision' };
    expect((await call('/api/universe/relations', relation)).statusCode).toBe(200);
    expect((await call('/api/universe/relations', { ...relation, fromKey: relation.toKey, toKey: relation.fromKey })).statusCode).toBe(200);
    expect((await call('/api/universe/relations', { ...relation, id: randomUUID() })).statusCode).toBe(409);
    expect((await call('/api/universe/relations', { ...relation, id: randomUUID(), toKey: `project:${randomUUID()}` })).statusCode).toBe(409);
    expect((await call('/api/universe/relations', { ...relation, id: randomUUID(), toKey: relation.fromKey })).statusCode).toBe(409);
    const resourceRelation = { ...relation, id: randomUUID(), toKey: `resource:${resource.id}`, kind: 'shares_resource' };
    expect((await call('/api/universe/relations', resourceRelation)).statusCode).toBe(200);
    const snapshot = await read(); expect(snapshot.nodes.map(n => n.kind).sort()).toEqual(['idea', 'milestone', 'project', 'project', 'resource']); expect(snapshot.relations).toHaveLength(2);
    await server.close(); server = await buildServer(env, { startSystem: false, startScanner: false });
    expect((await read()).nodes).toEqual(snapshot.nodes); expect((await read()).relations).toEqual(snapshot.relations);
    expect((await call(`/api/universe/resources/${resource.id}`, { version: 1 }, 'DELETE')).statusCode).toBe(409);
    expect((await call(`/api/universe/relations/${resourceRelation.id}`, { version: 2 }, 'DELETE')).statusCode).toBe(409);
    expect((await call(`/api/universe/relations/${resourceRelation.id}`, { version: 1 }, 'DELETE')).statusCode).toBe(200);
    expect((await call('/api/universe/relations', resourceRelation)).statusCode).toBe(409);
    expect((await call(`/api/universe/resources/${resource.id}`, { version: 1 }, 'DELETE')).statusCode).toBe(200);
    expect((await call('/api/universe/resources', resource)).statusCode).toBe(409);
    expect((await read()).nodes).toHaveLength(4); expect((await read()).relations).toHaveLength(1);
    expect((await server.app.inject({ url: '/api/planning', headers })).json()).toEqual(before);
    expect((await server.app.inject({ url: '/api/runs', headers })).json().runs).toEqual([]);
  } finally { await server.close(); }
});
