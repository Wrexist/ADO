import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { buildServer } from '../app';
import { openDb } from '../db';
import type { PlanningSnapshot, RunDetail } from '@ado/shared';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'controlos-task-review-')), repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[], cwd = repo) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } }));
  writeFileSync(join(repo, 'verify.cjs'), 'console.log("Fixture verification passed")');
  git(['add', '.']); git(['commit', '-qm', 'A']); const baseSha = git(['rev-parse', 'HEAD']);
  const auth = { host: '127.0.0.1:8787', 'x-acc-token': 'criterion-fixture-key' };
  const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: auth['x-acc-token'], dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false };
  let starts = 0;
  const options = { startSystem: false, workspaceRoot: join(root, 'workspaces'), spawner: { spawn() { starts++; return { done: Promise.resolve(0), lines: (async function* () {})(), kill() {} }; } } };
  let server = await buildServer(env, options);
  const database = openDb(env.dbPath);
  const post = (url: string, payload: object = {}) => server.app.inject({ method: 'POST', url, headers: auth, payload });
  const get = async (url: string) => (await server.app.inject({ url, headers: auth })).json();
  await post('/api/projects', { dir: repo });
  const project = (await post('/api/portfolio/projects', { name: 'Review fixture', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 })).json().project;
  const source = (await get('/api/portfolio')).sources.find((s: { kind: string }) => s.kind === 'local');
  const imported = (await post('/api/portfolio/import', { projectId: project.id, sourceId: source.id })).json();
  const criteria = [{ id: randomUUID(), text: 'Fixture behavior is correct', required: true }, { id: randomUUID(), text: 'Optional visual check', required: false }];
  const input = { projectId: project.id, repositoryId: imported.repositoryId, milestoneId: null, title: 'Review task', outcome: 'Fixture outcome', scope: 'Disposable profile only', outOfScope: '', acceptance: criteria, dependsOn: [], priority: 0, status: 'ready', sourceRefs: [] };
  const task = (await post('/api/planning/tasks', input)).json().task;
  const dispatch = async (id: string, version: number) => {
    const response = await post(`/api/planning/tasks/${id}/dispatch`, { version, checkoutId: imported.checkoutId, baseSha, provider: 'codex', idempotencyKey: randomUUID() });
    expect(response.statusCode, response.body).toBe(200); return response.json().runId as string;
  };
  const wait = async (id: string) => { const end = Date.now() + 30000; while (server.runner.isLive(id) && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); expect(server.runner.isLive(id)).toBe(false); };
  const runId = await dispatch(task.id, task.version); await wait(runId);
  const plan = async (): Promise<PlanningSnapshot> => get('/api/planning');
  const detail = async (): Promise<RunDetail> => (await get(`/api/runs/${runId}`)).run;
  const request = async () => {
    const current = (await plan()).tasks.find((t) => t.id === task.id)!; const run = await detail();
    return { operation: 'task.accept', verificationId: run.verificationEvidence?.find((e) => e.verdict === 'pass')?.id ?? randomUUID(), runId, version: current.version, headSha: run.headSha, diffDigest: run.diffDigest, policyVersion: run.approvalPolicyVersion, criteria: criteria.map((c) => ({ criterionId: c.id, verdict: c.required ? 'pass' : 'not_checked', evidence: c.required ? 'Observed fixture behavior and inspected npm verify output' : 'Optional visual check not performed' })) };
  };
  const prepare = async () => { const body = await request(); const response = await post(`/api/planning/tasks/${task.id}/approval`, body); expect(response.statusCode, response.body).toBe(200); return { ...body, approvalId: response.json().approval.id }; };
  return { root, repo, git, auth, input, task, runId, post, get, plan, detail, request, prepare, dispatch, wait, sqlite: database.sqlite,
    get server() { return server; }, get starts() { return starts; },
    async verify() { const response = await post(`/api/runs/${runId}/verify`); expect(response.statusCode, response.body).toBe(200); expect(response.json().evidence.verdict).toBe('pass'); },
    async reopen() { await server.close(); server = await buildServer(env, options); },
    async close() { await server.close(); database.sqlite.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); },
  };
}

it('records all criterion decisions atomically, preserves them across reopen, and revokes acceptance on correction or reverification', async () => {
  const h = await fixture(); const route = `/api/planning/tasks/${h.task.id}`;
  try {
    expect((await h.post(route + '/approval', await h.request())).statusCode).toBe(409);
    await h.verify(); const request = await h.request();
    expect((await h.server.app.inject({ method: 'POST', url: route + '/approval', headers: { host: h.auth.host }, payload: request })).statusCode).toBe(401);
    expect((await h.post(route + '/approval', { ...request, criteria: request.criteria.slice(1) })).statusCode).toBe(409);
    expect((await h.post(route + '/approval', { ...request, criteria: [request.criteria[0], request.criteria[0]] })).statusCode).toBe(409);
    expect((await h.post(route + '/approval', { ...request, criteria: request.criteria.map((c) => ({ ...c, verdict: 'fail' })) })).statusCode).toBe(409);
    expect((await h.post(route + '/approval', { ...request, criteria: request.criteria.map((c) => ({ ...c, evidence: '' })) })).statusCode).toBe(400);
    const reviewed = await h.prepare();
    expect((await h.plan()).tasks[0].status).toBe('awaiting_review'); expect((await h.plan()).reviews).toEqual([]);
    expect((await h.post(route + '/accept', { ...reviewed, verificationId: randomUUID() })).statusCode).toBe(409);
    expect((await h.post(route + '/accept', { ...reviewed, criteria: reviewed.criteria.map((c) => ({ ...c, evidence: 'Changed after review' })) })).statusCode).toBe(409);
    expect((await h.post(`/api/runs/${h.runId}/outcome`, { action: 'accepted', ...reviewed })).statusCode).toBe(409);
    h.sqlite.exec("CREATE TRIGGER reject_review BEFORE INSERT ON task_reviews BEGIN SELECT RAISE(ABORT,'fixture review write failure'); END");
    expect((await h.post(route + '/accept', reviewed)).statusCode).toBe(409);
    expect((await h.detail()).humanAction).toBeNull(); expect((await h.plan()).reviews).toEqual([]);
    expect(h.sqlite.prepare('SELECT consumed_ts FROM operation_approvals WHERE id=?').get(reviewed.approvalId)).toEqual({ consumed_ts: null });
    h.sqlite.exec('DROP TRIGGER reject_review');
    expect((await h.post(route + '/accept', reviewed)).statusCode).toBe(200);
    const accepted = await h.plan(); expect(accepted.tasks[0].status).toBe('accepted'); expect(accepted.reviews[0].criteria).toEqual(reviewed.criteria);
    expect(accepted.reviews[0]).toMatchObject({ runId: h.runId, taskVersion: reviewed.version, acceptedTaskVersion: reviewed.version + 1, invalidatedTs: null });
    expect((await h.post(route + '/accept', reviewed)).statusCode).toBe(409);
    expect(() => h.sqlite.prepare("UPDATE task_reviews SET criteria_json='[]'").run()).toThrow('immutable');
    expect(() => h.sqlite.prepare("UPDATE verification_evidence SET output='replaced'").run()).toThrow('immutable');
    await h.reopen(); expect(await h.plan()).toEqual(accepted);
    expect((await h.post(route + '/recheck')).json().current).toBe(true);
    expect((await h.post(`/api/runs/${h.runId}/outcome`, { action: 'corrected' })).statusCode).toBe(200);
    expect((await h.plan()).tasks[0].status).toBe('awaiting_review'); expect((await h.plan()).reviews[0].invalidationReason).toBe('Human outcome changed');
    expect((await h.post(route + '/accept', await h.prepare())).statusCode).toBe(200);
    await h.verify(); const reverified = await h.plan();
    expect(reverified.tasks[0].status).toBe('awaiting_review'); expect(reverified.reviews.every((r) => r.invalidatedTs)).toBe(true);
    expect(reverified.reviews.some((r) => r.invalidationReason === 'New verification requested')).toBe(true);
    expect(h.git(['status', '--porcelain'])).toBe('');
  } finally { await h.close(); }
}, 120000);

it.each(['commit', 'binary'])('T06: rejects criterion acceptance after verified content changes (%s)', async (change) => {
  const h = await fixture();
  try {
    await h.verify(); const reviewed = await h.prepare(), run = await h.detail();
    if (change === 'commit') { writeFileSync(join(run.workspacePath!, 'changed.txt'), 'Commit B'); h.git(['add', '.'], run.workspacePath!); h.git(['commit', '-qm', 'B'], run.workspacePath!); expect(h.git(['rev-parse', 'HEAD'], run.workspacePath!)).not.toBe(reviewed.headSha); }
    else writeFileSync(join(run.workspacePath!, ' changed.bin'), Buffer.from([0, 255, 1, 0]));
    const response = await h.post(`/api/planning/tasks/${h.task.id}/accept`, reviewed);
    expect(response.statusCode).toBe(409); expect(response.json().error).toContain('stale');
    expect((await h.plan()).tasks[0].status).toBe('awaiting_review'); expect((await h.plan()).reviews).toEqual([]);
    expect(await h.detail()).toMatchObject({ verifyVerdict: null, humanAction: null });
    expect(h.sqlite.prepare('SELECT revoked_ts FROM operation_approvals WHERE id=?').get(reviewed.approvalId)).not.toEqual({ revoked_ts: null });
    await h.reopen(); expect((await h.plan()).tasks[0].status).toBe('awaiting_review');
  } finally { await h.close(); }
}, 120000);

it('rechecks accepted dependency content before spawning and retains the invalidated decision history', async () => {
  const h = await fixture();
  try {
    await h.verify(); expect((await h.post(`/api/planning/tasks/${h.task.id}/accept`, await h.prepare())).statusCode).toBe(200);
    const dependent = (await h.post('/api/planning/tasks', { ...h.input, title: 'Dependent', dependsOn: [h.task.id] })).json().task;
    const run = await h.detail(); writeFileSync(join(run.workspacePath!, 'changed.txt'), 'External change after acceptance');
    const next = await h.dispatch(dependent.id, dependent.version); await h.wait(next);
    expect(h.starts).toBe(1); const plan = await h.plan();
    expect(plan.tasks.find((t) => t.id === h.task.id)?.status).toBe('awaiting_review');
    expect(plan.tasks.find((t) => t.id === dependent.id)?.status).toBe('blocked');
    expect(plan.reviews[0].invalidatedTs).not.toBeNull();
    expect((await h.get(`/api/runs/${next}`)).run.note).toContain('Dependency acceptance is stale');
  } finally { await h.close(); }
}, 120000);
