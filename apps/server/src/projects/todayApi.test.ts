import { randomUUID } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { TodayProposal } from '@ado/shared';
import { buildServer } from '../app';
import { openDb } from '../db';
import { executionLocks, portfolioCheckouts, portfolioRepositories, runs, verificationAttempts } from '../db/schema';

it('proposes bounded alternatives from current task versions without overriding locked focus or mutating planning', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-today-'));
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'today-fixture-key' };
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: headers['x-acc-token'], dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false }, { startSystem: false, startScanner: false });
  try {
    const app = server.app;
    const post = (url: string, payload: object) => app.inject({ method: 'POST', url, headers, payload });
    const project = (await post('/api/portfolio/projects', { name: 'Today fixture', kind: 'app', goal: 'Local manual plan', lifecycle: 'active', focus: true, manualPriority: 1 })).json().project;
    const input = { projectId: project.id, repositoryId: null, milestoneId: null, title: 'Focus', outcome: 'Manual result', scope: 'Fixture only', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Review result', required: true }], dependsOn: [], priority: 1, status: 'ready', sourceRefs: [] };
    const focus = (await post('/api/planning/tasks', input)).json().task;
    const higher = (await post('/api/planning/tasks', { ...input, title: 'Higher priority', priority: 5 })).json().task;
    const blocked = (await post('/api/planning/tasks', { ...input, title: 'Dependent', dependsOn: [higher.id] })).json().task;
    const extra = [];
    for (let n = 0; n < 2; n++) extra.push((await post('/api/planning/tasks', { ...input, title: `Additional ${n}`, priority: 0 })).json().task);
    const request = { availableMinutes: 30, projectId: project.id, lockedTaskId: focus.id, estimates: [{ taskId: focus.id, taskVersion: focus.version, minMinutes: 10, maxMinutes: 25 }, { taskId: higher.id, taskVersion: higher.version, minMinutes: 5, maxMinutes: 10 }, { taskId: blocked.id, taskVersion: blocked.version, minMinutes: 5, maxMinutes: 10 }] };
    const snapshot = async () => (await app.inject({ url: '/api/planning', headers })).json();
    const before = await snapshot();
    expect((await app.inject({ method: 'POST', url: '/api/planning/today', headers: { host: headers.host }, payload: request })).statusCode).toBe(401);
    const response = await post('/api/planning/today', request);
    expect(response.statusCode, response.body).toBe(200);
    const proposal = TodayProposal.parse(response.json());
    expect(proposal.alternatives.map((a) => a.taskId)).toEqual([focus.id]);
    expect(proposal.alternatives[0]).toMatchObject({ taskVersion: focus.version, uncertainty: 'User estimate; actual duration is unknown' });
    expect(proposal.excluded).toContainEqual({ taskId: higher.id, reason: 'outside_focus' });
    const tooLong = await post('/api/planning/today', { ...request, estimates: [{ ...request.estimates[0], maxMinutes: 31 }] });
    expect(tooLong.json().alternatives).toEqual([]);
    expect(tooLong.json().excluded).toContainEqual({ taskId: focus.id, reason: 'outside_window' });
    const missing = await post('/api/planning/today', { ...request, estimates: [] });
    expect(missing.json().excluded).toContainEqual({ taskId: focus.id, reason: 'estimate_missing' });
    const dependency = await post('/api/planning/today', { ...request, lockedTaskId: blocked.id });
    expect(dependency.json().alternatives).toEqual([]);
    expect(dependency.json().excluded).toContainEqual({ taskId: blocked.id, reason: 'dependencies' });
    const unlocked = await post('/api/planning/today', { ...request, lockedTaskId: null });
    expect(unlocked.json().alternatives.map((a: { taskId: string }) => a.taskId)).toEqual([higher.id, focus.id]);
    const capped = await post('/api/planning/today', { ...request, lockedTaskId: null, estimates: [...request.estimates, ...extra.map((task) => ({ taskId: task.id, taskVersion: task.version, minMinutes: 5, maxMinutes: 10 }))] });
    expect(capped.json().alternatives).toHaveLength(3);
    expect(capped.json().excluded.some((e: { reason: string }) => e.reason === 'lower_priority')).toBe(true);
    expect((await post('/api/planning/today', { ...request, estimates: [{ ...request.estimates[0], taskVersion: 999 }] })).statusCode).toBe(409);
    expect((await post('/api/planning/today', { ...request, estimates: [{ ...request.estimates[0], maxMinutes: 2 }] })).statusCode).toBe(400);
    expect((await post('/api/planning/today', { ...request, lockedTaskId: randomUUID() })).statusCode).toBe(409);
    expect(await snapshot()).toEqual(before);
    expect((await app.inject({ url: '/api/runs', headers })).json().runs).toEqual([]);
    expect((await app.inject({ url: `/api/planning/history/${focus.id}`, headers })).json().revisions).toHaveLength(1);
  } finally { await server.close(); }
});

it('excludes repositories with retained writers and fails closed on unknown lock scope without changing execution state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'controlos-today-locks-'));
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': 'lock-fixture-key' };
  const dbPath = join(root, 'profile.sqlite');
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: headers['x-acc-token'], dbPath, projectDirs: [], demo: false }, { startSystem: false, startScanner: false });
  const { db, sqlite } = openDb(dbPath);
  try {
    const post = (url: string, payload: object) => server.app.inject({ method: 'POST', url, headers, payload });
    const project = (await post('/api/portfolio/projects', { name: 'Lock fixture', kind: 'app', goal: '', lifecycle: 'active', focus: true, manualPriority: 1 })).json().project;
    const observedTs = new Date().toISOString();
    const repoA = randomUUID(), repoB = randomUUID();
    for (const [id, name] of [[repoA, 'app'], [repoB, 'app-other']]) db.insert(portfolioRepositories).values({ id, projectId: project.id, host: 'github', externalId: `owner/${name}`, name, canonicalRemote: `https://github.com/owner/${name}`, observedTs }).run();
    db.insert(portfolioCheckouts).values({ id: randomUUID(), repositoryId: repoA, hostId: 'fixture', canonicalPath: '/fixture/a', pathIdentity: 'path-a', gitIdentity: 'git-a', sourceId: 'scanner-a', managed: false, observedTs }).run();
    const tasks = [];
    for (const repositoryId of [repoA, repoB, null]) {
      const response = await post('/api/planning/tasks', { projectId: project.id, repositoryId, milestoneId: null, title: `Task ${repositoryId}`, outcome: 'Manual result', scope: 'Synthetic metadata only', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Review', required: true }], dependsOn: [], priority: 1, status: 'ready', sourceRefs: [] });
      expect(response.statusCode, response.body).toBe(200); tasks.push(response.json().task);
    }
    const request = { availableMinutes: 30, projectId: project.id, lockedTaskId: null, estimates: tasks.map((t) => ({ taskId: t.id, taskVersion: t.version, minMinutes: 5, maxMinutes: 10 })) };
    const propose = async () => {
      const before = sqlite.prepare('SELECT * FROM execution_locks').all();
      const response = await post('/api/planning/today', request);
      expect(response.statusCode, response.body).toBe(200);
      expect(sqlite.prepare('SELECT * FROM execution_locks').all()).toEqual(before);
      return TodayProposal.parse(response.json());
    };
    const beforePlan = (await server.app.inject({ url: '/api/planning', headers })).json();
    db.insert(runs).values({ id: 'old-run', repoId: 'scanner-a', task: 'Earlier unrelated task', model: 'fixture', status: 'interrupted', startedTs: observedTs }).run();
    const lock = (resource: string, runId = 'old-run', owner = 'runner:fixture') => {
      db.delete(executionLocks).run();
      db.insert(executionLocks).values({ resource, runId, owner, acquiredTs: observedTs }).run();
    };
    lock('legacy-resource'); // source identity resolves the repository, without a task binding
    let proposal = await propose();
    expect(proposal.excluded).toContainEqual({ taskId: tasks[0].id, reason: 'writer_lock' });
    expect(proposal.alternatives.map((a) => a.taskId).sort()).toEqual([tasks[1].id, tasks[2].id].sort());
    db.insert(runs).values({ id: 'git-run', repoId: 'retired-scanner', sourceGitIdentity: 'git-a', task: 'Git identity fixture', model: 'fixture', status: 'interrupted', startedTs: observedTs }).run();
    lock('legacy-resource', 'git-run');
    expect((await propose()).excluded).toContainEqual({ taskId: tasks[0].id, reason: 'writer_lock' });
    db.insert(runs).values({ id: 'unmapped-run', repoId: 'retired-scanner', task: 'Resource identity fixture', model: 'fixture', status: 'interrupted', startedTs: observedTs }).run();
    for (const resource of ['/fixture/a', 'github:OWNER/APP']) {
      lock(resource, 'unmapped-run');
      proposal = await propose();
      expect(proposal.excluded).toEqual([{ taskId: tasks[0].id, reason: 'writer_lock' }]);
      expect(proposal.alternatives).toHaveLength(2);
    }
    db.insert(verificationAttempts).values({ id: 'verify-a', runId: 'unmapped-run', repoId: 'retired-scanner', repositoryId: repoA, gitIdentity: 'git-a', workspacePath: '/fixture/result', baseSha: 'base', headSha: 'head', diffDigest: 'digest', command: 'fixture', status: 'interrupted', startedTs: observedTs }).run();
    lock('verification-resource', 'unmapped-run', 'verify:verify-a');
    expect((await propose()).excluded).toEqual([{ taskId: tasks[0].id, reason: 'writer_lock' }]);
    db.insert(verificationAttempts).values({ id: 'other-run', runId: 'old-run', repoId: 'scanner-a', repositoryId: repoA, gitIdentity: 'git-a', workspacePath: '/fixture/other', baseSha: 'base', headSha: 'head', diffDigest: 'digest', command: 'fixture', status: 'interrupted', startedTs: observedTs }).run();
    for (const [resource, runId, owner] of [['unresolved', 'unmapped-run', 'runner:fixture'], ['unresolved', 'missing-run', 'runner:fixture'], ['unresolved', 'unmapped-run', 'verify:missing-attempt'], ['unresolved', 'unmapped-run', 'verify:other-run']]) {
      lock(resource, runId, owner);
      proposal = await propose();
      expect(proposal.alternatives.map((a) => a.taskId)).toEqual([tasks[2].id]);
      for (const task of tasks.slice(0, 2)) expect(proposal.excluded).toContainEqual({ taskId: task.id, reason: 'writer_scope_unknown' });
    }
    expect((await server.app.inject({ url: '/api/planning', headers })).json()).toEqual(beforePlan);
    expect(db.select().from(runs).all()).toHaveLength(3);
    db.delete(executionLocks).run();
    expect((await propose()).alternatives).toHaveLength(3);
  } finally { sqlite.close(); await server.close(); }
});
