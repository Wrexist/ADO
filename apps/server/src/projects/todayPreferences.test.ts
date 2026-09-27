import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { TodayPreferences } from '@ado/shared';
import { buildServer, type AccServer } from '../app';
import { openDb } from '../db';

it('retains profile-local choices across restart and refuses stale writers, stale tasks, failed commits and corrupt stored data', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-today-preferences-'));
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'preference-fixture-key' };
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: headers['x-acc-token'], dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  let server: AccServer | undefined = await buildServer(env, { startSystem: false, startScanner: false });
  let database: ReturnType<typeof openDb> | undefined;
  try {
    const read = async () => TodayPreferences.parse((await server!.app.inject({ url: '/api/planning/today/preferences', headers })).json());
    const save = (payload: object) => server!.app.inject({ method: 'PUT', url: '/api/planning/today/preferences', headers, payload });
    for (const method of ['GET', 'PUT'] as const) expect((await server.app.inject({ method, url: '/api/planning/today/preferences', headers: { host: headers.host }, ...(method === 'PUT' ? { payload: {} } : {}) })).statusCode).toBe(401);
    const initial = await read(); expect(initial).toMatchObject({ version: 0, updatedTs: null, estimates: [] });
    const project = (await server.app.inject({ method: 'POST', url: '/api/portfolio/projects', headers, payload: { name: 'Preference fixture', kind: 'app', goal: '', lifecycle: 'active', focus: true, manualPriority: 1 } })).json().project;
    const taskInput = { projectId: project.id, repositoryId: null, milestoneId: null, title: 'Focus', outcome: 'Manual result', scope: 'Fixture only', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Review', required: true }], dependsOn: [], priority: 1, status: 'ready', sourceRefs: [] };
    const task = (await server.app.inject({ method: 'POST', url: '/api/planning/tasks', headers, payload: taskInput })).json().task;
    const request = { version: 0, availableMinutes: 30, projectId: project.id, lockedTaskId: task.id, estimates: [{ taskId: task.id, taskVersion: task.version, minMinutes: 10, maxMinutes: 25 }] };
    const response = await save(request); expect(response.statusCode, response.body).toBe(200);
    const stored = TodayPreferences.parse(response.json()); expect(stored.version).toBe(1); expect(stored.updatedTs).not.toBeNull();
    expect((await save({ ...request, availableMinutes: 60 })).statusCode).toBe(409);
    expect(await read()).toEqual(stored);
    await server.close(); server = await buildServer({ ...env, dbPath: join(root, 'other-profile.sqlite') }, { startSystem: false, startScanner: false });
    expect(await read()).toEqual(initial);
    await server.close(); server = await buildServer(env, { startSystem: false, startScanner: false });
    expect(await read()).toEqual(stored);
    database = openDb(env.dbPath);
    database.sqlite.exec("CREATE TRIGGER reject_today_update BEFORE UPDATE ON today_preferences BEGIN SELECT RAISE(ABORT, 'fixture commit denied'); END;");
    expect((await save({ ...request, version: 1, availableMinutes: 45 })).statusCode).toBe(409);
    expect(await read()).toEqual(stored);
    database.sqlite.exec('DROP TRIGGER reject_today_update');
    const edited = await server.app.inject({ method: 'PUT', url: `/api/planning/tasks/${task.id}`, headers, payload: { ...taskInput, version: task.version, outcome: 'Revised result' } }); expect(edited.statusCode).toBe(200);
    expect((await save({ ...request, version: 1 })).statusCode).toBe(409);
    expect(await read()).toEqual(stored); // preserve old estimate provenance for explicit review
    const next = await save({ ...request, version: 1, estimates: [{ ...request.estimates[0], taskVersion: edited.json().task.version }] }); expect(next.statusCode).toBe(200);
    expect(next.json().version).toBe(2);
    database.sqlite.prepare('UPDATE today_preferences SET choices_json=?').run('{broken-canary');
    const broken = await server.app.inject({ url: '/api/planning/today/preferences', headers }); expect(broken.statusCode).toBe(409); expect(broken.body).not.toContain('broken-canary');
    expect((await save({ ...request, version: 2, estimates: [] })).statusCode).toBe(409);
    expect(database.sqlite.prepare('SELECT choices_json FROM today_preferences').get()).toEqual({ choices_json: '{broken-canary' });
    expect((await server.app.inject({ url: '/api/runs', headers })).json().runs).toEqual([]);
  } finally { database?.sqlite.close(); await server?.close(); }
});
