import { _electron as electron } from 'playwright';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { hostname, tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { openDb } from '../apps/server/src/db/index.ts';
import { runs, executionLocks, portfolioProjects, portfolioRepositories, portfolioCheckouts, planningTasks } from '../apps/server/src/db/schema.ts';
import { backupDatabase, restoreBackup } from '../apps/server/src/backup/index.ts';
import { commonGitIdentity, directoryIdentity, pathKey } from '../apps/server/src/projects/checkoutIdentity.ts';

assert(process.argv[2], 'Pass the unpacked desktop executable');
const executablePath = resolve(process.argv[2]);
const root = mkdtempSync(join(tmpdir(), 'controlos-packaged-restore-'));
const source = join(root, 'source'); mkdirSync(source);
const repo = join(root, 'local-work'); mkdirSync(repo);
const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
writeFileSync(join(repo, 'work.txt'), 'committed'); git(['add', '.']); git(['commit', '-qm', 'base']);
writeFileSync(join(repo, 'work.txt'), 'uncommitted work must survive');
const index = readFileSync(join(repo, '.git/index'));
const now = new Date().toISOString();
const seed = openDb(join(source, 'acc.sqlite'));
const projectId = randomUUID(), repositoryId = randomUUID(), taskId = randomUUID();
seed.db.insert(portfolioProjects).values({ id: projectId, name: 'DEMO restored project', kind: 'app', goal: 'Preserve planning', lifecycle: 'active', focus: true, manualPriority: 3, version: 1, createdTs: now, updatedTs: now }).run();
seed.db.insert(portfolioRepositories).values({ id: repositoryId, projectId, host: 'local', externalId: 'fixture', name: 'DEMO local work', observedTs: now }).run();
seed.db.insert(portfolioCheckouts).values({ id: randomUUID(), repositoryId, hostId: createHash('sha256').update(`${process.platform}:${hostname()}`).digest('hex'), canonicalPath: pathKey(repo), pathIdentity: directoryIdentity(repo), gitIdentity: commonGitIdentity(repo), sourceId: 'fixture', managed: false, observedTs: now }).run();
seed.db.insert(planningTasks).values({ id: taskId, projectId, repositoryId, title: 'DEMO preserved plan', outcome: 'Restore safely', scope: 'Review only', outOfScope: 'Execution', acceptanceJson: '[]', sourceRefsJson: '[]', priority: 3, status: 'draft', version: 1, createdTs: now, updatedTs: now }).run();
seed.db.insert(runs).values([{ id: 'old-queued', repoId: 'fixture', task: 'Must not start', model: 'default', status: 'queued', engineVersion: 1, startedTs: now }, { id: 'old-running', repoId: 'fixture', task: 'Do not infer process termination', model: 'default', status: 'running', engineVersion: 1, startedTs: now }]).run();
seed.db.insert(executionLocks).values({ resource: 'fixture', runId: 'old-running', owner: 'old-owner', acquiredTs: now }).run();
const tables = ['portfolio_projects', 'portfolio_repositories', 'portfolio_checkouts', 'planning_tasks', 'runs', 'execution_locks'];
const original = Object.fromEntries(tables.map((table) => [table, seed.sqlite.prepare(`SELECT * FROM ${table}`).all()]));
writeFileSync(join(source, 'connections.json'), JSON.stringify({ figma: { value: 'restore-provider-canary', updatedTs: now } }));
writeFileSync(join(source, 'acc-token'), 'restore-access-canary');
writeFileSync(join(source, 'project-settings.json'), JSON.stringify({ fixture: { agents: false } }));
const backup = backupDatabase(seed.sqlite, join(root, 'backups'), { dataDir: source }); seed.sqlite.close();
assert(!readFileSync(`${backup.file}.json`, 'utf8').includes('canary'));
const profile = join(root, 'restored'); restoreBackup(backup.file, profile);
assert(!existsSync(join(profile, 'connections.json'))); assert(!existsSync(join(profile, 'acc-token')));
const env: Record<string, string> = {};
for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE']) if (process.env[name]) env[name] = process.env[name]!;
for (const name of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) { env[name] = join(root, name); mkdirSync(env[name]); }
env.PATH = `${dirname(process.execPath)};${join(process.env.SystemRoot!, 'System32')}`;
env.PROJECT_DIRS = '';
for (const phase of ['restore', 'reopen']) {
  const app = await electron.launch({ executablePath, args: [`--profile-dir=${profile}`, '--hidden', '--no-update-check'], env, timeout: 60000 });
  try {
    const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
    const data = await page.evaluate(async () => {
      const config = (window as unknown as { __ACC_DESKTOP__: { accToken: string } }).__ACC_DESKTOP__;
      const headers = { 'x-acc-token': config.accToken };
      return { recovery: await (await fetch('/api/recovery', { headers })).json(), references: await (await fetch('/api/recovery/references', { headers })).json(), planning: await (await fetch('/api/planning', { headers })).json(), connections: await (await fetch('/api/connections', { headers })).json(), denied: (await fetch('/api/setup/probe', { method: 'POST', headers })).status };
    });
    assert.equal(data.recovery.recovery.mode, 'review'); assert.equal(data.denied, 423);
    assert.equal(data.references.pendingRuns, 2); assert.equal(data.references.retainedLocks, 1);
    assert.equal(data.references.references[0].status, 'identity_matches'); assert.equal(data.references.executionEnabled, false);
    assert(data.planning.tasks.some((task: { id: string }) => task.id === taskId));
    assert(data.connections.connections.every((connection: { configured: boolean }) => !connection.configured));
    await page.getByRole('status').filter({ hasText: 'Recovery review mode' }).waitFor();
    await page.getByRole('button', { name: 'Inspect restored references' }).click();
    await page.getByText('Local references (1)', { exact: true }).click();
    await page.getByText('Identity matches; content not checked', { exact: true }).waitFor();
    console.log(JSON.stringify({ phase, packaged: await app.evaluate(({ app }) => app.isPackaged), runtime: await app.evaluate(() => process.versions.node), reviewOnly: true }));
  } finally {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { await Promise.race([app.close(), new Promise<never>((_, reject) => { timer = setTimeout(() => { app.process().kill(); reject(new Error('Packaged restore did not close normally within 15 seconds')); }, 15000); })]); }
    finally { clearTimeout(timer); }
  }
  const checked = openDb(join(profile, 'acc.sqlite'));
  try {
    for (const table of tables) assert.deepEqual(checked.sqlite.prepare(`SELECT * FROM ${table}`).all(), original[table], `Restored ${table} changed`);
    assert.equal(checked.sqlite.pragma('integrity_check', { simple: true }), 'ok');
    assert.deepEqual(checked.sqlite.pragma('foreign_key_check'), []);
  } finally { checked.sqlite.close(); }
  assert.equal(readFileSync(join(repo, 'work.txt'), 'utf8'), 'uncommitted work must survive');
  assert.deepEqual(readFileSync(join(repo, '.git/index')), index);
}
console.log(JSON.stringify({ result: 'passed', executableSha256: createHash('sha256').update(readFileSync(executablePath)).digest('hex'), profileEvidence: root, scope: 'Synthetic profile backup/restore and two unpacked desktop starts. Preserved plans, run rows, locks and local dirty work; identity report only. No installer, active-profile promotion or real user-profile claim.' }));
