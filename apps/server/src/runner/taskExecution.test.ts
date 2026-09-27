import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, readlinkSync, renameSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { Bus } from '../bus';
import { executionLocks, runs } from '../db/schema';
import { PlanningStore } from '../projects/planning';
import { ProjectRegistry } from '../projects/registry';
import { Runner } from './index';
import { TaskReopeningStore } from './taskReopening';
import type { Spawner } from './spawner';
import { spawnOwned } from '../lib/ownedProcess';
import { commonGitIdentity } from '../projects/checkoutIdentity';

async function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'controlos-task-lifecycle-')), repo = join(root, 'repo'), other = join(root, 'other'); mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  writeFileSync(join(repo, 'base.txt'), 'base'); git(['add', '.']); git(['commit', '-qm', 'base']); const baseSha = git(['rev-parse', 'HEAD']);
  git(['worktree', 'add', '-qb', 'other', other]);
  let opened = openDb(join(root, 'profile.sqlite'));
  const paths = new Map([['a', repo], ['b', other]]);
  const registry = () => new ProjectRegistry(opened.db, () => [...paths].map(([id, localPath]) => ({ id, localPath, name: id, category: 'app', status: 'active', description: '', branch: 'main', updatedTs: new Date().toISOString() })), (id) => paths.get(id) ?? null);
  const project = registry().create({ name: 'Fixture', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 });
  const first = await registry().importSource({ projectId: project.id, sourceId: 'local:a' });
  const second = await registry().importSource({ projectId: project.id, sourceId: 'local:b' });
  const input = (title: string) => ({ projectId: project.id, repositoryId: first.repositoryId, milestoneId: null, title, outcome: 'Fixture result', scope: 'Fixture only', outOfScope: '', acceptance: [{ id: randomUUID(), text: 'Independent check', required: true }], dependsOn: [], priority: 0, status: 'ready', sourceRefs: [] });
  return {
    root, repo, git, project, input,
    get db() { return opened.db; }, get sqlite() { return opened.sqlite; },
    plan: () => new PlanningStore(opened.db), registry,
    reopen() { opened.sqlite.close(); opened = openDb(join(root, 'profile.sqlite')); },
    request: (version: number, sibling = false) => ({ version, checkoutId: sibling ? second.checkoutId : first.checkoutId, baseSha, provider: 'codex', idempotencyKey: randomUUID() }),
    runner: (spawner: Spawner, maxConcurrent = 2) => new Runner(new Bus(opened.db), opened.db, spawner, { maxConcurrent, cwdFor: (id) => paths.get(id) ?? null, workspaceRoot: join(root, 'workspaces'), assertCheckout: (id, sourceId, cwd) => registry().assertCheckout(id, sourceId, cwd) }),
    async close() { opened.sqlite.close(); await rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 }); },
  };
}
const until = async (condition: () => boolean) => { const end = Date.now() + 30000; while (!condition() && Date.now() < end) await new Promise((r) => setTimeout(r, 20)); expect(condition()).toBe(true); };

it('T13: prepares and cancels a real job from a reviewed commit without changing dirty source files or any Git metadata', async () => {
  const h = await fixture(), marker = join(h.root, 'agent-ready');
  const snapshot = (path: string): unknown => {
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return { link: readlinkSync(path) };
    if (stat.isDirectory()) return Object.fromEntries(readdirSync(path).sort().map((name) => [name, snapshot(join(path, name))]));
    return { mode: stat.mode, hash: createHash('sha256').update(readFileSync(path)).digest('hex') };
  };
  let workspace = '';
  const runner = h.runner({ spawn(opts) {
    workspace = opts.cwd;
    expect(commonGitIdentity(workspace)).not.toBe(commonGitIdentity(h.repo));
    expect(readFileSync(join(workspace, 'base.txt'), 'utf8')).toBe('base');
    expect(existsSync(join(workspace, 'untracked.bin'))).toBe(false);
    const code = `const fs=require('node:fs');fs.writeFileSync('base.txt','agent edit');fs.writeFileSync(${JSON.stringify(marker)},'ready');setInterval(()=>{},1000);`;
    const proc = spawnOwned(process.execPath, ['-e', code], opts.cwd, opts.onProcessIdentity, opts.receiptRoot);
    proc.child.stdin.end(); proc.child.stdout.resume(); proc.child.stderr.resume();
    return { lines: (async function* () {})(), done: proc.done, kill: proc.kill, terminationConfirmed: proc.terminationConfirmed };
  } });
  try {
    h.git(['checkout', '-qb', 'operator-choice']);
    writeFileSync(join(h.repo, 'base.txt'), 'staged owner edit'); h.git(['add', 'base.txt']);
    writeFileSync(join(h.repo, 'base.txt'), 'unstaged owner edit'); writeFileSync(join(h.repo, 'untracked.bin'), Buffer.from([0, 255, 19]));
    const hook = join(h.repo, '.git', 'hooks', 'post-checkout');
    writeFileSync(hook, '#!/bin/sh\nprintf forbidden > hook-ran\n'); h.git(['config', 'controlos.fixture', 'must remain']);
    const before = snapshot(h.repo), task = h.plan().saveTask(h.input('Preserve original'));
    const { runId } = runner.dispatchTask(task.id, h.request(task.version));
    await until(() => existsSync(marker));
    expect(snapshot(h.repo)).toEqual(before);
    expect(h.db.select().from(runs).all()[0].sourceGitIdentity).toBe(commonGitIdentity(h.repo));
    expect(() => h.sqlite.prepare('UPDATE runs SET source_git_identity=? WHERE id=?').run('changed', runId)).toThrow('immutable');
    expect(runner.kill(runId)).toBe(true); await until(() => !runner.isLive(runId));
    expect(snapshot(h.repo)).toEqual(before);
    expect(h.db.select().from(runs).all()[0].status).toBe('failed');
    expect(readFileSync(join(workspace, 'base.txt'), 'utf8')).toBe('agent edit');
    expect(existsSync(join(workspace, '.git', 'objects', 'info', 'alternates'))).toBe(false);
    expect(existsSync(join(workspace, '.git', 'hooks', 'post-checkout'))).toBe(false);
    expect(readFileSync(join(workspace, '.git', 'config'), 'utf8')).not.toContain(h.repo);
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it('serializes registered sibling worktrees and commits each task outcome with its run', async () => {
  const h = await fixture(); const exits: Array<(code: number) => void> = [];
  const runner = h.runner({ spawn() { let exit!: (code: number) => void; const done = new Promise<number>((r) => { exit = r; }); exits.push(exit); return { done, lines: (async function* () {})(), kill() { exit(1); } }; } });
  try {
    const a = h.plan().saveTask(h.input('A')), b = h.plan().saveTask(h.input('B'));
    const first = runner.dispatchTask(a.id, h.request(a.version)), second = runner.dispatchTask(b.id, h.request(b.version, true));
    await until(() => exits.length === 1);
    expect(h.plan().snapshot().tasks.map((t) => t.status)).toEqual(['active', 'queued']);
    exits[0](0); await until(() => exits.length === 2);
    expect(h.plan().snapshot().tasks.map((t) => t.status)).toEqual(['awaiting_review', 'active']);
    exits[1](0); await until(() => !runner.isLive(first.runId) && !runner.isLive(second.runId));
    expect(h.plan().snapshot().tasks.every((t) => t.status === 'awaiting_review')).toBe(true);
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it('rolls back task/run/outbox together, then restores the accepted queued binding exactly once', async () => {
  const h = await fixture(); let starts = 0;
  const spawner: Spawner = { spawn() { starts++; return { done: Promise.resolve(0), lines: (async function* () {})(), kill() {} }; } };
  let runner = h.runner(spawner);
  try {
    const task = h.plan().saveTask(h.input('Atomic task')), request = h.request(task.version);
    h.sqlite.exec("CREATE TRIGGER reject_queue BEFORE INSERT ON events WHEN NEW.type='build.updated' BEGIN SELECT RAISE(ABORT,'fixture outbox failure'); END");
    expect(() => runner.dispatchTask(task.id, request)).toThrow('fixture outbox failure');
    expect(h.db.select().from(runs).all()).toEqual([]); expect(h.plan().snapshot().tasks[0]).toEqual(task); expect(h.plan().snapshot().executions).toEqual([]);
    h.sqlite.exec('DROP TRIGGER reject_queue');
    h.sqlite.exec("CREATE TRIGGER reject_claim BEFORE INSERT ON events WHEN NEW.type='build.updated' AND json_extract(NEW.payload,'$.build.state')='running' BEGIN SELECT RAISE(ABORT,'fixture claim failure'); END");
    const { runId } = runner.dispatchTask(task.id, request);
    expect(starts).toBe(0); expect(h.plan().snapshot().tasks[0].status).toBe('queued'); expect(h.db.select().from(executionLocks).all()).toEqual([]);
    h.sqlite.exec('DROP TRIGGER reject_claim');
    h.reopen(); runner = h.runner(spawner); runner.reconcileOrphans();
    await until(() => !runner.isLive(runId));
    expect(starts).toBe(1); expect(h.plan().snapshot().tasks[0].status).toBe('awaiting_review');
    expect(runner.dispatchTask(task.id, request)).toEqual({ runId }); expect(starts).toBe(1);
    expect(() => h.sqlite.prepare('UPDATE task_executions SET task_version=99').run()).toThrow('immutable');
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it.each(['head', 'project', 'directory'])('rechecks %s after queued profile recovery before any spawn', async (change) => {
  const h = await fixture(); let starts = 0;
  const spawner: Spawner = { spawn() { starts++; return { done: Promise.resolve(0), lines: (async function* () {})(), kill() {} }; } };
  let runner = h.runner(spawner, 0);
  try {
    const task = h.plan().saveTask(h.input('Queued task')); const { runId } = runner.dispatchTask(task.id, h.request(task.version));
    if (change === 'head') { writeFileSync(join(h.repo, 'new.txt'), 'owner change'); h.git(['add', '.']); h.git(['commit', '-qm', 'owner commit']); }
    if (change === 'project') h.registry().update(h.project.id, { name: 'Fixture', kind: 'app', goal: '', lifecycle: 'paused', focus: false, manualPriority: 0, version: h.project.version });
    if (change === 'directory') { renameSync(h.repo, join(h.root, 'preserved-original')); mkdirSync(h.repo); h.git(['init', '-q']); }
    h.reopen(); runner = h.runner(spawner); runner.reconcileOrphans(); await until(() => !runner.isLive(runId));
    expect(starts).toBe(0); expect(h.db.select().from(runs).all()[0].status).toBe('failed'); expect(h.plan().snapshot().tasks[0].status).toBe('blocked');
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it('preserves quarantine across sibling dispatch and locks task editing after an uncertain linked outcome', async () => {
  const h = await fixture(); let starts = 0;
  let runner = h.runner({ spawn() { starts++; return { done: Promise.reject(new Error('fixture exit unknown')), lines: (async function* () {})(), kill() {} }; } });
  try {
    const input = h.input('Uncertain task'), task = h.plan().saveTask(input);
    const { runId } = runner.dispatchTask(task.id, h.request(task.version)); await until(() => !runner.isLive(runId));
    const blocked = h.plan().snapshot().tasks[0]; expect(blocked.status).toBe('blocked');
    expect(() => h.plan().saveTask({ ...input, version: blocked.version }, task.id)).toThrow('stop is not confirmed');
    expect(() => new TaskReopeningStore(h.db).reopen(task.id, { runId, version: blocked.version, reason: 'Retry after uncertain outcome', idempotencyKey: randomUUID() })).toThrow('stop is not confirmed');
    const next = h.plan().saveTask(h.input('Sibling must wait'));
    runner.dispatchTask(next.id, h.request(next.version, true));
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1); expect(starts).toBe(1);
    h.reopen(); runner = h.runner({ spawn() { throw new Error('Must not spawn'); } }); runner.reconcileOrphans();
    expect(h.plan().snapshot().tasks.map((t) => t.status)).toEqual(['blocked', 'queued']);
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it('honors a legacy unbound writer lock when dispatching a registered sibling checkout', async () => {
  const h = await fixture(); let starts = 0;
  const spawner: Spawner = { spawn() { starts++; throw new Error('Legacy writer must block dispatch'); } };
  let runner = h.runner(spawner);
  try {
    const legacy = randomUUID(), ts = new Date().toISOString();
    h.db.insert(runs).values({ id: legacy, repoId: 'a', task: 'Legacy writer', model: 'fixture', status: 'failed', startedTs: ts, processTermination: 'unconfirmed' }).run();
    const lock = { resource: h.repo, runId: legacy, owner: 'previous-instance', acquiredTs: ts };
    h.db.insert(executionLocks).values(lock).run();
    const task = h.plan().saveTask(h.input('Sibling after migration'));
    runner.dispatchTask(task.id, h.request(task.version, true));
    expect(h.plan().snapshot().tasks[0].status).toBe('queued'); expect(starts).toBe(0);
    h.reopen(); runner = h.runner(spawner); runner.reconcileOrphans();
    expect(starts).toBe(0); expect(h.plan().snapshot().tasks[0].status).toBe('queued');
    expect(h.db.select().from(executionLocks).all()).toEqual([lock]);
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it('retains active task and writer lock without a success event when terminal persistence fails', async () => {
  const h = await fixture();
  const runner = h.runner({ spawn() { return { done: Promise.resolve(0), lines: (async function* () {})(), kill() {} }; } });
  try {
    h.sqlite.exec("CREATE TRIGGER reject_terminal BEFORE INSERT ON events WHEN NEW.type='build.updated' AND json_extract(NEW.payload,'$.build.state') IN ('success','failed') BEGIN SELECT RAISE(ABORT,'fixture terminal failure'); END");
    const task = h.plan().saveTask(h.input('Terminal failure'));
    const { runId } = runner.dispatchTask(task.id, h.request(task.version));
    await until(() => !runner.isLive(runId));
    expect(h.plan().snapshot().tasks[0].status).toBe('active');
    expect(h.plan().snapshot().executions[0].state).toBe('running');
    expect(h.db.select().from(runs).all()[0].status).toBe('running');
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(h.sqlite.prepare("SELECT count(*) AS n FROM events WHERE type='agent.upserted' AND json_extract(payload,'$.agent.status')='done'").get()).toEqual({ n: 0 });
  } finally { await runner.stop(); await h.close(); }
}, 120000);

it('rolls back run, task, build and agent failure together when the final agent event cannot be stored', async () => {
  const h = await fixture();
  const runner = h.runner({ spawn() { throw new Error('fixture uncertain launch'); } });
  try {
    h.sqlite.exec("CREATE TRIGGER reject_failed_agent BEFORE INSERT ON events WHEN NEW.type='agent.upserted' AND json_extract(NEW.payload,'$.agent.status')='failed' BEGIN SELECT RAISE(ABORT,'fixture agent outbox failure'); END");
    const task = h.plan().saveTask(h.input('Atomic failure'));
    const { runId } = runner.dispatchTask(task.id, h.request(task.version));
    await until(() => !runner.isLive(runId));
    expect(h.plan().snapshot().tasks[0].status).toBe('active');
    expect(h.plan().snapshot().executions[0].state).toBe('running');
    expect(h.db.select().from(runs).all()[0].status).toBe('running');
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(h.sqlite.prepare("SELECT count(*) AS n FROM events WHERE type='build.updated' AND json_extract(payload,'$.build.state')='failed'").get()).toEqual({ n: 0 });
    const before = new Bus(h.db); before.replayFromDb(() => {});
    expect(before.snapshot().state.agents[runId].status).toBe('running');
    expect(before.snapshot().state.builds[runId].state).toBe('running');
    h.sqlite.exec('DROP TRIGGER reject_failed_agent');
    runner.reconcileOrphans();
    const after = new Bus(h.db); after.replayFromDb(() => {});
    expect(after.snapshot().state.agents[runId].status).toBe('failed');
    expect(after.snapshot().state.builds[runId].state).toBe('failed');
    expect(h.plan().snapshot().tasks[0].status).toBe('blocked');
    expect(h.db.select().from(runs).all()[0]).toMatchObject({ status: 'failed', processTermination: 'unconfirmed' });
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
  } finally { await runner.stop(); await h.close(); }
}, 120000);
