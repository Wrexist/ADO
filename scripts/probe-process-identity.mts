import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { eq } from 'drizzle-orm';
import { buildServer, type AccServer } from '../apps/server/src/app.ts';
import { openDb } from '../apps/server/src/db/index.ts';
import { executionLocks, runs, verificationAttempts } from '../apps/server/src/db/schema.ts';
import { spawnOwned, type ProcessIdentity } from '../apps/server/src/lib/ownedProcess.ts';

assert.equal(process.platform, 'win32', 'This acceptance probe requires Windows');
execFileSync(process.execPath, ['scripts/build-process-host.mjs'], { windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-process-identity-'));
const receipts = join(root, 'process-receipts'); mkdirSync(receipts);
const dbPath = join(root, 'profile.sqlite'), { db, sqlite } = openDb(dbPath);
const env = { port: 8787, webOrigin: 'http://localhost:5173', accToken: randomBytes(24).toString('hex'), dbPath, projectDirs: [], demo: false };
const headers = { host: '127.0.0.1:8787', 'x-acc-token': env.accToken };
let server: AccServer | undefined;
let liveIdentity: ProcessIdentity | undefined;
// A separate owner is essential: buildServer.close() stops its own process registry.
const ownerCode = `
  import { spawnOwned } from ${JSON.stringify(new URL('../apps/server/src/lib/ownedProcess.ts', import.meta.url).href)};
  const proc = spawnOwned(process.execPath, ['-e', "require('node:readline').createInterface({input:process.stdin}).on('line',nonce=>console.log(JSON.stringify({nonce,pid:process.pid})));"], ${JSON.stringify(root)}, identity => { console.log(JSON.stringify({identity})); });
  process.stdin.pipe(proc.child.stdin); proc.child.stdout.pipe(process.stdout); proc.child.stderr.pipe(process.stderr);
  process.exitCode = await proc.done;
`;
const owner = spawn(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', ownerCode], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
const ownerDone = new Promise<number | null>((accept, reject) => { owner.once('close', accept); owner.once('error', reject); });
const unrelated = { child: owner, done: ownerDone, kill() { owner.stdin.end(); const timer = setTimeout(() => owner.kill(), 15000); void ownerDone.finally(() => clearTimeout(timer)); } };
unrelated.child.stderr.resume();
const lines = createInterface({ input: unrelated.child.stdout });
lines.on('line', line => { try { const value = JSON.parse(line); if (value.identity) liveIdentity = value.identity; } catch { /* not an identity frame */ } });
const checks: string[] = [];
async function alive(step: string) {
  const nonce = randomUUID();
  const response = new Promise<{ nonce: string; pid: number }>((accept, reject) => {
    const timer = setTimeout(() => { lines.off('line', onLine); reject(new Error(`Unrelated process stopped responding: ${step}`)); }, 10000);
    const onLine = (line: string) => { try { const value = JSON.parse(line); if (value.nonce === nonce) { clearTimeout(timer); lines.off('line', onLine); accept(value); } } catch { /* no guessed response */ } };
    lines.on('line', onLine);
  });
  unrelated.child.stdin.write(nonce + '\n');
  const answer = await response;
  assert.equal(answer.nonce, nonce); assert.equal(answer.pid, liveIdentity?.pid);
  checks.push(step);
}
const ts = new Date().toISOString();
const seed = (id: string, identity: ProcessIdentity) => db.insert(runs).values({ id, repoId: id, task: 'DEMO identity collision', model: 'fixture', status: 'running', engineVersion: 1, startedTs: ts, processIdentity: JSON.stringify(identity), processTermination: 'unconfirmed' }).run();
const lock = (runId: string, owner: string) => db.insert(executionLocks).values({ resource: `fixture:${runId}`, runId, owner, acquiredTs: ts }).run();
try {
  await alive('native unrelated process responds before recovery');
  assert.ok(liveIdentity);
  const stale = () => { const id = randomUUID(); return { ...liveIdentity!, id, jobName: `Local\\ControlOS.${id}`, creationTime: (BigInt(liveIdentity!.creationTime) - 10_000_000n).toString(), receiptKey: randomBytes(32).toString('hex') }; };
  const agentIdentity = stale(), verifierIdentity = stale();
  // Positive control: the native host emits an actual authenticated empty-job receipt.
  const finished = spawnOwned(process.execPath, ['-e', 'process.exit(0)'], root, identity => { db.transaction(() => { seed('confirmed-control', identity); lock('confirmed-control', 'old-runner'); }); }, receipts);
  finished.child.stdin.end(); finished.child.stdout.resume(); finished.child.stderr.resume();
  assert.equal(await finished.done, 0); assert.equal(finished.terminationConfirmed(), true);
  const start = () => buildServer(env, { startSystem: false, startScanner: false });
  server = await start();
  assert.equal(db.select().from(runs).where(eq(runs.id, 'confirmed-control')).get()?.processTermination, 'confirmed');
  assert.equal(db.select().from(executionLocks).all().length, 0);
  await server.close(); server = undefined;
  seed('stale-agent', agentIdentity); lock('stale-agent', 'old-runner');
  seed('stale-verifier', verifierIdentity); lock('stale-verifier', 'verify:stale-attempt');
  db.insert(verificationAttempts).values({ id: 'stale-attempt', runId: 'stale-verifier', repoId: 'stale-verifier', gitIdentity: 'fixture-git', workspacePath: root, baseSha: 'base', headSha: 'head', diffDigest: 'digest', command: 'fixture', status: 'running', startedTs: ts, processIdentity: JSON.stringify(verifierIdentity) }).run();
  server = await start();
  await alive('startup recovery leaves unrelated PID responsive');
  assert.equal(db.select().from(executionLocks).all().length, 2);
  const request = async (url: string, expected: number) => { const response = await server!.app.inject({ method: 'POST', url, headers, payload: {} }); assert.equal(response.statusCode, expected, response.body); };
  const inspect = async (step: string) => {
    await request('/api/runs/stale-agent/kill', 400);
    await request('/api/runs/stale-agent/reconcile', 409);
    await request('/api/runs/stale-verifier/verify/stop', 409);
    await request('/api/runs/stale-verifier/verify/reconcile', 409);
    assert.equal(db.select().from(executionLocks).all().length, 2);
    assert.equal(db.select().from(runs).all().length, 3);
    assert.equal(db.select().from(runs).where(eq(runs.id, 'stale-agent')).get()?.processTermination, 'unconfirmed');
    assert.equal(db.select().from(verificationAttempts).get()?.processTermination, 'unconfirmed');
    await alive(step);
  };
  await inspect('missing receipts cannot signal the unrelated process or release locks');
  const writeReceipt = (identity: ProcessIdentity, wrongCreation: boolean) => {
    const payload = JSON.stringify({ version: 1, id: identity.id, jobName: identity.jobName, pid: identity.pid, creationTime: wrongCreation ? liveIdentity!.creationTime : identity.creationTime, activeProcesses: 0, exitCode: 0, recordedUtc: ts });
    const mac = createHmac('sha256', Buffer.from(wrongCreation ? identity.receiptKey! : randomBytes(32).toString('hex'), 'hex')).update(payload).digest('hex');
    writeFileSync(join(receipts, `${identity.id}.json`), JSON.stringify({ payload, mac }));
  };
  for (const wrongCreation of [false, true]) {
    writeReceipt(agentIdentity, wrongCreation); writeReceipt(verifierIdentity, wrongCreation);
    await inspect(wrongCreation ? 'valid MAC with same PID and different creation time is rejected' : 'invalid MAC is rejected');
  }
  await server.close(); server = undefined;
  await alive('server shutdown does not signal recovered PID');
  server = await start(); await inspect('reopened profile retains quarantine and unrelated process');
  const sources = ['scripts/probe-process-identity.mts', 'apps/server/src/app.ts', 'apps/server/src/runner/index.ts', 'apps/server/src/runner/verificationOwnership.ts', 'apps/server/src/lib/ownedProcess.ts', 'apps/server/src/lib/terminationReceipt.ts', 'apps/server/native/JobHost.cs'];
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  writeFileSync('docs/controlos/process-identity-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version }, checks, positiveControl: 'Actual native empty-job receipt confirmed and released only its own writer lock', scope: 'Windows production startup/API/reopen with an actual native unrelated process. Stale PID collision is fault-injected into historical records; OS allocator reuse is not forced. Fresh nonce responses prove the same child remains responsive. No provider or pilot job runs.', sourceSha256: Object.fromEntries(sources.map(p => [p, hash(p)])), nativeSha256: hash('apps/server/native/dist/ControlOS.JobHost.exe') }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, checks }));
} finally {
  await server?.close(); lines.close(); unrelated.kill(); await unrelated.done; sqlite.close();
}
