import { execFileSync, spawnSync } from 'node:child_process';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { expect, it } from 'vitest';
import { openDb } from '../db';
import { executionLocks, runs, verificationAttempts, verificationEvidence } from '../db/schema';
import { prepareWorkspace, workspaceEvidence } from './workspace';
import { Verifier } from './verification';
import { VerificationOwnership, verificationBlocks } from './verificationOwnership';
import { Bus } from '../bus';
import { Runner } from './index';
import type { ProcessIdentity } from '../lib/ownedProcess';
import { readTerminationReceipt } from '../lib/terminationReceipt';
import { ProcessNotStartedError } from '../lib/processLaunch';
import { commonGitIdentity } from '../projects/checkoutIdentity';

async function fixture(script = 'console.log("verification completed")') {
  const root = mkdtempSync(join(tmpdir(), 'controlos-verify-owner-')), repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Test']); git(['config', 'user.email', 'test@example.test']);
  writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } })); writeFileSync(join(repo, 'verify.cjs'), script);
  git(['add', '.']); git(['commit', '-qm', 'base']); const baseSha = git(['rev-parse', 'HEAD']);
  const database = join(root, 'profile.sqlite'), receipts = join(root, 'receipts'); mkdirSync(receipts);
  const { db, sqlite } = openDb(database), evidence = await workspaceEvidence(repo, baseSha);
  const run = { id: 'result', repoId: 'a', task: 'x', model: 'default', engineVersion: 1, status: 'done', startedTs: new Date().toISOString(), workspacePath: repo, baseSha, ...evidence };
  db.insert(runs).values(run).run();
  const ownership = new VerificationOwnership(db, receipts);
  const claim = () => db.transaction(() => ownership.claim(db.select().from(runs).where(eq(runs.id, run.id)).get()!));
  return { root, repo, git, database, receipts, db, sqlite, run, ownership, claim, close() { sqlite.close(); rmSync(root, { recursive: true, force: true }); } };
}

it('keeps verification quarantine across reopening and blocks an unregistered sibling checkout', async () => {
  const h = await fixture();
  try {
    const workspace = await prepareWorkspace(join(h.root, 'results'), h.repo);
    const sourceGitIdentity = commonGitIdentity(h.repo);
    expect(commonGitIdentity(workspace.path)).not.toBe(sourceGitIdentity);
    h.db.update(runs).set({ workspacePath: workspace.path, sourceGitIdentity }).where(eq(runs.id, h.run.id)).run();
    const sibling = join(h.root, 'sibling'); h.git(['worktree', 'add', '--detach', sibling, 'HEAD']);
    const attempt = h.claim(); expect(verificationBlocks(h.db, 'different-scanner-id', sibling)).toBe(true);
    const reopened = openDb(h.database);
    try {
      const verifier = new Verifier(reopened.db, () => [], undefined, { receiptRoot: h.receipts });
      expect(verifier.reconcile()).toBe(0);
      expect(reopened.db.select().from(verificationAttempts).get()).toMatchObject({ id: attempt, status: 'interrupted', processTermination: 'unconfirmed' });
      await expect(verifier.verify('result')).rejects.toThrow('quarantined');
      expect(reopened.db.select().from(executionLocks).all()).toHaveLength(1);
      expect(reopened.db.select().from(verificationEvidence).all()).toHaveLength(0);
      const bus = new Bus(reopened.db);
      const starts: string[] = [];
      const runner = new Runner(bus, reopened.db, { spawn(opts) { starts.push(opts.prompt); return { lines: (async function* () {})(), done: Promise.resolve(0), kill() {} }; } }, { cwdFor: () => sibling });
      runner.dispatch({ repoId: 'different-scanner-id', task: 'must stay queued' });
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(starts).toEqual([]); await runner.stop();
    } finally { reopened.sqlite.close(); }
  } finally { h.close(); }
});

it('claims verification atomically, respects agent quarantine, and releases preflight failures without spawning', async () => {
  const h = await fixture();
  try {
    h.db.insert(executionLocks).values({ resource: h.repo, runId: 'result', owner: 'agent-owner', acquiredTs: new Date().toISOString() }).run();
    const verifier = new Verifier(h.db, () => []);
    await expect(verifier.verify('result')).rejects.toThrow('quarantined');
    expect(h.db.select().from(verificationAttempts).all()).toEqual([]);
    h.db.delete(executionLocks).run();
    h.sqlite.exec("CREATE TRIGGER deny_verify_lock BEFORE INSERT ON execution_locks BEGIN SELECT RAISE(ABORT,'lock unavailable'); END");
    await expect(verifier.verify('result')).rejects.toThrow('lock unavailable');
    expect(h.db.select().from(verificationAttempts).all()).toEqual([]);
    h.sqlite.exec('DROP TRIGGER deny_verify_lock');
    writeFileSync(join(h.repo, 'changed.txt'), 'changed');
    await expect(verifier.verify('result')).rejects.toThrow('changed');
    expect(h.db.select().from(verificationAttempts).get()).toMatchObject({ status: 'failed', processTermination: 'not_started' });
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
  } finally { h.close(); }
});

it('retains the lock if spawning throws with an uncertain outcome', async () => {
  const h = await fixture();
  try {
    const verifier = new Verifier(h.db, () => [], undefined, { spawn() { throw new Error('lost process channel'); } });
    await expect(verifier.verify('result')).rejects.toThrow('lost process channel');
    expect(h.db.select().from(verificationAttempts).get()).toMatchObject({ status: 'termination_unconfirmed', processTermination: 'unconfirmed' });
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(h.db.select().from(verificationEvidence).all()).toEqual([]);
  } finally { h.close(); }
});

it('releases verification ownership for a classified refusal before process creation', async () => {
  const h = await fixture();
  try {
    const verifier = new Verifier(h.db, () => [], undefined, { spawn() { throw new ProcessNotStartedError('preflight refusal'); } });
    await expect(verifier.verify('result')).rejects.toThrow('preflight refusal');
    expect(h.db.select().from(verificationAttempts).get()).toMatchObject({ status: 'failed', processTermination: 'not_started' });
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
    expect(h.db.select().from(verificationEvidence).all()).toEqual([]);
  } finally { h.close(); }
});

it('serializes separate clones sharing the agent resource key while allowing proven unrelated repositories', async () => {
  const h = await fixture();
  try {
    const clone = join(h.root, 'clone'); h.git(['clone', '--quiet', h.repo, clone]);
    h.db.insert(runs).values({ ...h.run, id: 'clone-result', repoId: 'other-scanner', workspacePath: clone }).run();
    const owner = new VerificationOwnership(h.db, h.receipts, undefined, () => 'github:owner/repo');
    h.db.transaction(() => owner.claim(h.db.select().from(runs).where(eq(runs.id, 'result')).get()!));
    expect(verificationBlocks(h.db, 'other-scanner', clone, 'github:owner/repo')).toBe(true);
    expect(() => h.db.transaction(() => owner.claim(h.db.select().from(runs).where(eq(runs.id, 'clone-result')).get()!))).toThrow('quarantined writer');
    // A different physical repository, scanner and remote scope is independent.
    const unrelated = new VerificationOwnership(h.db, h.receipts, undefined, () => 'github:another/repo');
    expect(() => h.db.transaction(() => unrelated.claim(h.db.select().from(runs).where(eq(runs.id, 'clone-result')).get()!))).not.toThrow();
    expect(h.db.select().from(executionLocks).all()).toHaveLength(2);
  } finally { h.close(); }
});

it('shares profile capacity with agent quarantine and rejects verification before invalidating prior results', async () => {
  const h = await fixture();
  let runner: Runner | undefined;
  try {
    const b = join(h.root, 'b'), c = join(h.root, 'c');
    h.git(['clone', '--quiet', h.repo, b]); h.git(['clone', '--quiet', h.repo, c]);
    h.db.insert(runs).values({ ...h.run, id: 'b', repoId: 'b', workspacePath: b }).run();
    h.db.insert(runs).values({ ...h.run, id: 'c', repoId: 'c', workspacePath: c, verifyVerdict: 'pass', humanAction: 'accepted' }).run();
    const a = h.claim();
    h.db.insert(executionLocks).values({ resource: b, runId: 'b', owner: 'lost-agent', acquiredTs: new Date().toISOString() }).run();
    let starts = 0;
    const verifier = new Verifier(h.db, () => [], undefined, { spawn() { starts++; throw new ProcessNotStartedError('fixture preflight'); } });
    await expect(verifier.verify('c')).rejects.toThrow('profile limit (2)');
    expect(starts).toBe(0);
    expect(h.db.select().from(runs).where(eq(runs.id, 'c')).get()).toMatchObject({ verifyVerdict: 'pass', humanAction: 'accepted' });
    expect(h.db.select().from(verificationAttempts).all()).toHaveLength(1);
    runner = new Runner(new Bus(h.db), h.db, { spawn() { starts++; return { lines: (async function* () {})(), done: Promise.resolve(0), kill() {} }; } }, { cwdFor: () => c });
    const queued = runner.dispatch({ repoId: 'c', task: 'waiting behind verifier and quarantine' });
    expect(runner.waitingReason(queued.runId)).toContain('profile limit (2)');
    // This fixture claim never spawned. Releasing it leaves the lost agent counted.
    h.db.transaction(() => h.ownership.finish(a, 'failed', 'not_started', true));
    runner.wake(); await expect.poll(() => runner!.isLive(queued.runId)).toBe(false);
    expect(starts).toBe(1);
    expect(h.db.select().from(executionLocks).all().map((lock) => lock.owner)).toEqual(['lost-agent']);
  } finally { await runner?.stop(); h.close(); }
});

it.each(['wrong-run', 'duplicate-owner'])('retains %s locks even when the referenced verification receipt is authentic', async (problem) => {
  const h = await fixture();
  try {
    const attempt = h.claim(), id = randomUUID();
    const identity: ProcessIdentity = { version: 2, platform: 'win32', id, jobName: `Local\\ControlOS.${id}`, pid: 123, creationTime: '132456789012345678', receiptKey: randomBytes(32).toString('hex') };
    h.ownership.identify(attempt, identity);
    const payload = JSON.stringify({ version: 1, id, jobName: identity.jobName, pid: identity.pid, creationTime: identity.creationTime, activeProcesses: 0, exitCode: 0, recordedUtc: new Date().toISOString() });
    writeFileSync(join(h.receipts, `${id}.json`), JSON.stringify({ payload, mac: createHmac('sha256', Buffer.from(identity.receiptKey!, 'hex')).update(payload).digest('hex') }));
    h.db.insert(runs).values({ ...h.run, id: 'other-result' }).run();
    if (problem === 'wrong-run') h.db.update(executionLocks).set({ runId: 'other-result' }).run();
    else h.db.insert(executionLocks).values({ resource: 'other-resource', runId: 'other-result', owner: `verify:${attempt}`, acquiredTs: new Date().toISOString() }).run();
    const before = h.db.select().from(executionLocks).all();
    expect(() => h.ownership.assertRunning(attempt)).toThrow('ownership');
    expect(() => h.ownership.finish(attempt, 'succeeded', 'confirmed', true)).toThrow('quarantine retained');
    expect(h.ownership.reconcile()).toBe(0);
    expect(h.db.select().from(executionLocks).all()).toEqual(before);
    expect(h.db.select().from(verificationAttempts).get()?.processTermination).not.toBe('confirmed');
    if (problem === 'wrong-run') h.db.update(executionLocks).set({ runId: h.run.id }).run();
    else h.db.delete(executionLocks).where(eq(executionLocks.resource, 'other-resource')).run();
    expect(h.ownership.reconcile()).toBe(1);
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
  } finally { h.close(); }
});

it('requires the verification identity receipt and never substitutes the parent agent receipt', async () => {
  const h = await fixture();
  try {
    const identity = (): ProcessIdentity => { const id = randomUUID(); return { version: 2, platform: 'win32', id, jobName: `Local\\ControlOS.${id}`, pid: 123, creationTime: '132456789012345678', receiptKey: randomBytes(32).toString('hex') }; };
    const agent = identity(), verification = identity();
    const save = (process: ProcessIdentity) => {
      const receipt = { version: 1, id: process.id, jobName: process.jobName, pid: process.pid, creationTime: process.creationTime, activeProcesses: 0, exitCode: 0, recordedUtc: new Date().toISOString() };
      const payload = JSON.stringify(receipt), signature = createHmac('sha256', Buffer.from(process.receiptKey!, 'hex')).update(payload).digest('hex');
      writeFileSync(join(h.receipts, `${process.id}.json`), JSON.stringify({ payload, mac: signature }));
    };
    h.db.update(runs).set({ processIdentity: JSON.stringify(agent), status: 'failed' }).run();
    const id = h.claim(); h.ownership.identify(id, verification); save(agent);
    const runner = new Runner(new Bus(h.db), h.db, { spawn() { throw new Error('must not start'); } }, { cwdFor: () => h.repo, receiptRoot: h.receipts });
    runner.reconcileOrphans(); expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(h.ownership.reconcile()).toBe(0); save(verification);
    expect(h.ownership.reconcile()).toBe(1);
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
    expect(h.db.select().from(verificationAttempts).get()).toMatchObject({ status: 'interrupted', processTermination: 'confirmed' });
    expect(h.db.select().from(verificationEvidence).all()).toEqual([]); await runner.stop();
  } finally { h.close(); }
});

it.skipIf(process.platform !== 'win32')('shutdown waits for a real verification process tree and records no passing evidence', async () => {
  const markerRoot = mkdtempSync(join(tmpdir(), 'controlos-verify-stop-')), marker = join(markerRoot, 'started');
  const leaf = `require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid)); setInterval(()=>{},1000);`;
  const h = await fixture(`require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(leaf)}],{stdio:'ignore'});`);
  const verifier = new Verifier(h.db, () => [], undefined, { receiptRoot: h.receipts });
  const result = verifier.verify('result').then(() => 'unexpected pass', (error: Error) => error.message);
  try {
    await expect.poll(() => existsSync(marker), { timeout: 20000 }).toBe(true);
    expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(h.db.select().from(verificationAttempts).get()?.processIdentity).toContain('receiptKey');
    await verifier.stop(); expect(await result).toContain('shutdown');
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
    expect(h.db.select().from(verificationAttempts).get()).toMatchObject({ status: 'failed', processTermination: 'confirmed' });
    expect(h.db.select().from(verificationEvidence).all()).toEqual([]);
  } finally { await verifier.stop(); await result; h.close(); rmSync(markerRoot, { recursive: true, force: true }); }
}, 60000);

it.skipIf(process.platform !== 'win32')('recovers a real crashed verifier from its native receipt without passing or retrying the attempt', async () => {
  const markerRoot = mkdtempSync(join(tmpdir(), 'controlos-verify-crash-')), marker = join(markerRoot, 'started');
  const h = await fixture(`require('node:fs').writeFileSync(${JSON.stringify(marker)},String(process.pid)); setInterval(()=>{},1000);`);
  try {
    const code = `
      import { openDb } from ${JSON.stringify(new URL('../db/index.ts', import.meta.url).href)};
      import { Verifier } from ${JSON.stringify(new URL('./verification.ts', import.meta.url).href)};
      import { existsSync } from 'node:fs';
      const { db } = openDb(${JSON.stringify(h.database)});
      const verifier = new Verifier(db, () => [], undefined, { receiptRoot: ${JSON.stringify(h.receipts)} });
      void verifier.verify('result');
      setInterval(() => { if (existsSync(${JSON.stringify(marker)})) process.exit(73); }, 20);
    `;
    const crashed = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', code], { encoding: 'utf8', windowsHide: true, timeout: 20000 });
    expect(crashed.status, crashed.stderr).toBe(73);
    const attempt = h.db.select().from(verificationAttempts).get()!;
    expect(attempt.status).toBe('running'); expect(h.db.select().from(executionLocks).all()).toHaveLength(1);
    expect(() => h.sqlite.prepare("UPDATE verification_attempts SET command='other'").run()).toThrow('immutable');
    await expect.poll(() => Boolean(readTerminationReceipt(h.receipts, attempt.processIdentity)), { timeout: 15000 }).toBe(true);
    const verifier = new Verifier(h.db, () => [], undefined, { receiptRoot: h.receipts });
    expect(verifier.reconcile()).toBe(1); expect(verifier.reconcile()).toBe(0);
    expect(h.db.select().from(verificationAttempts).all()).toHaveLength(1);
    expect(h.db.select().from(verificationAttempts).get()).toMatchObject({ status: 'interrupted', processTermination: 'confirmed' });
    expect(h.db.select().from(executionLocks).all()).toEqual([]);
    expect(h.db.select().from(verificationEvidence).all()).toEqual([]);
    expect(h.db.select().from(runs).get()).toMatchObject({ status: 'done', verifyVerdict: null });
  } finally {
    h.sqlite.close();
    // The authenticated receipt precedes the native host's final cleanup.
    await rm(h.root, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
    rmSync(markerRoot, { recursive: true, force: true });
  }
}, 60000);
