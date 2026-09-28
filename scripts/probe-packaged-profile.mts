import { _electron as electron } from 'playwright';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { openDb } from '../apps/server/src/db/index.ts';
import { inspectProfileDatabase } from '../apps/server/src/db/inspection.ts';
import { PromptStore } from '../apps/server/src/prompts/store.ts';

const executablePath = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass the unpacked desktop executable');
const baseline = Number(process.argv[3] ?? 8);
assert([8, 19].includes(baseline), 'Supported migration fixture baselines are 8 and 19');
const migrations = join(dirname(executablePath), 'resources/drizzle');
const fullJournal = JSON.parse(readFileSync('apps/server/drizzle/meta/_journal.json', 'utf8'));
assert.deepEqual(JSON.parse(readFileSync(join(migrations, 'meta/_journal.json'), 'utf8')), fullJournal, 'Packaged migration journal differs from current source');
for (const entry of fullJournal.entries) assert.equal(readFileSync(join(migrations, `${entry.tag}.sql`), 'utf8').replace(/\r\n/g, '\n'), readFileSync(`apps/server/drizzle/${entry.tag}.sql`, 'utf8').replace(/\r\n/g, '\n'), `Packaged migration differs: ${entry.tag}`);
const root = mkdtempSync(join(tmpdir(), 'controlos-packaged-profile-'));
const profile = join(root, 'profile'); mkdirSync(profile);
const old = join(root, 'old-migrations'); mkdirSync(join(old, 'meta'), { recursive: true });
const journal = structuredClone(fullJournal);
journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx <= baseline);
writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
for (const entry of journal.entries) copyFileSync(join(migrations, `${entry.tag}.sql`), join(old, `${entry.tag}.sql`));
const previous = process.env.ACC_MIGRATIONS_DIR;
process.env.ACC_MIGRATIONS_DIR = old;
const seed = openDb(join(profile, 'acc.sqlite'));
seed.sqlite.prepare('INSERT INTO runs(id,repo_id,task,model,status,human_action,started_ts) VALUES(?,?,?,?,?,?,?)').run('legacy', 'fixture-repo', 'DEMO historical judgment', 'default', 'done', 'accepted', '2026-07-01T00:00:00Z');
const originalRun = seed.sqlite.prepare('SELECT * FROM runs WHERE id=?').get('legacy') as Record<string, unknown>;
const retainedTables: Record<string, unknown[]> = {};
if (baseline === 19) {
  const projectId = randomUUID(), repositoryId = randomUUID(), checkoutId = randomUUID(), taskId = randomUUID(), ts = '2026-09-27T00:00:00.000Z';
  seed.sqlite.prepare('INSERT INTO portfolio_projects(id,name,kind,goal,lifecycle,focus,manual_priority,version,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,?)').run(projectId, 'DEMO migration project', 'fixture', 'Retain planning across native upgrade', 'active', 1, 3, 1, ts, ts);
  seed.sqlite.prepare('INSERT INTO portfolio_repositories(id,project_id,host,external_id,name,observed_ts) VALUES(?,?,?,?,?,?)').run(repositoryId, projectId, 'local', 'DEMO recorded identity', 'DEMO repository', ts);
  seed.sqlite.prepare('INSERT INTO portfolio_checkouts(id,repository_id,host_id,canonical_path,path_identity,git_identity,source_id,managed,observed_ts) VALUES(?,?,?,?,?,?,?,?,?)').run(checkoutId, repositoryId, 'DEMO absent host', 'C:/DEMO/not-scanned', 'DEMO path', 'DEMO Git', 'DEMO source', 0, ts);
  const task = { id: taskId, projectId, repositoryId, milestoneId: null, title: 'DEMO retained task', outcome: 'Preserve exact stored definition', scope: 'Migration fixture', outOfScope: 'Execution', acceptance: [], dependsOn: [], blockedBy: [], priority: 3, status: 'draft', sourceRefs: [], version: 1, createdTs: ts, updatedTs: ts };
  seed.sqlite.prepare('INSERT INTO planning_tasks(id,project_id,repository_id,title,outcome,scope,out_of_scope,acceptance_json,source_refs_json,priority,status,version,created_ts,updated_ts) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(taskId, projectId, repositoryId, task.title, task.outcome, task.scope, task.outOfScope, '[]', '[]', 3, 'draft', 1, ts, ts);
  seed.sqlite.prepare('INSERT INTO planning_revisions(id,entity_id,kind,version,snapshot_json,recorded_ts) VALUES(?,?,?,?,?,?)').run(randomUUID(), taskId, 'task', 1, JSON.stringify(task), ts);
  seed.sqlite.prepare('INSERT INTO task_executions(run_id,task_id,task_version,task_snapshot_json,checkout_id,base_sha,current_task_version,state,created_ts) VALUES(?,?,?,?,?,?,?,?,?)').run('legacy', taskId, 1, JSON.stringify(task), checkoutId, 'a'.repeat(40), 1, 'done', ts);
  for (const table of ['portfolio_projects', 'portfolio_repositories', 'portfolio_checkouts', 'planning_tasks', 'planning_revisions', 'task_executions']) retainedTables[table] = seed.sqlite.prepare(`SELECT * FROM ${table}`).all();
}
seed.sqlite.close();
if (previous === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previous;
const beforeInspection = readFileSync(join(profile, 'acc.sqlite'));
assert.throws(() => inspectProfileDatabase(join(profile, 'acc.sqlite'), migrations), /migration ledger/);
assert.deepEqual(readFileSync(join(profile, 'acc.sqlite')), beforeInspection, 'Negative inspection must not migrate the fixture');
writeFileSync(join(profile, 'acc-token'), 'packaged-fixture-access\n');
writeFileSync(join(profile, 'connections.json'), JSON.stringify({ figma: { value: 'packaged-fixture-provider', updatedTs: '2026-09-27T00:00:00Z' } }));
writeFileSync(join(profile, 'project-settings.json'), JSON.stringify({ 'fixture-repo': { agents: false } }));
new PromptStore(join(profile, 'prompts.json')).upsert({ title: 'DEMO retained prompt', category: 'testing', summary: 'Offline migration fixture', body: 'Do not dispatch this fixture.', dispatchable: false });
const retained = Object.fromEntries(['prompts.json', 'project-settings.json'].map((name) => [name, readFileSync(join(profile, name), 'utf8')]));
const env: Record<string, string> = {};
for (const name of ['SystemRoot', 'WINDIR', 'COMSPEC', 'USERPROFILE']) if (process.env[name]) env[name] = process.env[name]!;
for (const name of ['APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP']) { env[name] = join(root, name); mkdirSync(env[name]); }
env.PATH = `${dirname(process.execPath)};${join(process.env.SystemRoot!, 'System32')}`;
env.PROJECT_DIRS = '';

for (const phase of ['migrate', 'legacy-migrate', 'reopen']) {
  const app = await electron.launch({ executablePath, args: [`--profile-dir=${profile}`, '--hidden', '--no-update-check'], env, timeout: 60000 });
  try {
    const paths = await app.evaluate(({ app }) => ({ profile: app.getPath('userData'), session: app.getPath('sessionData'), packaged: app.isPackaged }));
    assert.deepEqual(paths, { profile, session: profile, packaged: true });
    const page = await app.firstWindow(); await page.waitForLoadState('domcontentloaded');
    const data = await page.evaluate(async () => {
      const config = (window as unknown as { __ACC_DESKTOP__: { accToken: string } }).__ACC_DESKTOP__;
      const headers = { 'x-acc-token': config.accToken };
      const currentApis = await Promise.all(['/api/planning', '/api/universe'].map(async path => ({ path, status: (await fetch(path, { headers })).status })));
      return { tokenMatches: config.accToken === 'packaged-fixture-access', runs: await (await fetch('/api/runs', { headers })).json(), connections: await (await fetch('/api/connections', { headers })).json(), currentApis };
    });
    assert(data.tokenMatches);
    assert(data.currentApis.every(api => api.status === 200), JSON.stringify(data.currentApis));
    assert(data.runs.runs.some((run: { id: string; task: string }) => run.id === 'legacy' && run.task === 'DEMO historical judgment'));
    assert(data.connections.connections.some((c: { id: string; configured: boolean; authentication: string }) => c.id === 'figma' && c.configured && c.authentication === 'unverified'));
    assert.match(readFileSync(join(profile, 'acc-token'), 'utf8'), /^os:dpapi:v1:/);
    const connections = readFileSync(join(profile, 'connections.json'), 'utf8');
    assert(connections.includes('windows-dpapi-v1')); assert(!connections.includes('packaged-fixture-provider'));
    if (phase === 'migrate') {
      // Produce genuine legacy Electron ciphertext in this exact app/profile.
      const legacy = await app.evaluate(({ safeStorage }) => ({
        token: safeStorage.encryptString('packaged-fixture-access').toString('base64'),
        connection: safeStorage.encryptString('packaged-fixture-provider').toString('base64'),
      }));
      writeFileSync(join(profile, 'acc-token'), `os:v1:${legacy.token}`);
      writeFileSync(join(profile, 'connections.json'), JSON.stringify({ figma: { value: legacy.connection, encoding: 'electron-safe-storage-v1', updatedTs: '2026-09-27T00:00:00Z' } }));
    }
    console.log(JSON.stringify({ phase, packaged: true, profileIsolated: true, runtime: await app.evaluate(() => process.versions.node) }));
  } finally {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([app.close(), new Promise<never>((_, reject) => {
        timer = setTimeout(() => { app.process().kill(); reject(new Error('Packaged desktop did not close normally within 15 seconds')); }, 15000);
      })]);
    } finally { clearTimeout(timer); }
  }
  for (const [name, bytes] of Object.entries(retained)) assert.equal(readFileSync(join(profile, name), 'utf8'), bytes);
  const sqlite = inspectProfileDatabase(join(profile, 'acc.sqlite'), migrations);
  try {
    const after = sqlite.prepare('SELECT * FROM runs WHERE id=?').get('legacy') as Record<string, unknown>;
    for (const [key, value] of Object.entries(originalRun)) assert.deepEqual(after[key], value, `Historical field changed: ${key}`);
    assert.equal((sqlite.prepare('SELECT COUNT(*) AS count FROM operation_approvals').get() as { count: number }).count, 0);
    for (const [table, rows] of Object.entries(retainedTables)) {
      const observed = sqlite.prepare(`SELECT * FROM ${table}`).all() as Record<string, unknown>[];
      assert.equal(observed.length, rows.length);
      rows.forEach((row, index) => { for (const [key, value] of Object.entries(row as Record<string, unknown>)) assert.deepEqual(observed[index][key], value, `${table}.${key} changed`); });
      if (table === 'task_executions') for (const row of observed) for (const key of ['context_package_id', 'context_digest', 'context_review_version']) assert.equal(row[key], null);
    }
    for (const table of ['today_preferences', 'universe_resources', 'universe_relations', 'context_packages', 'context_package_reviews']) assert.equal((sqlite.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as { count: number }).count, 0);
  } finally { sqlite.close(); }
}
console.log(JSON.stringify({ result: 'passed', baseline, migrationCount: fullJournal.entries.length, executableSha256: createHash('sha256').update(readFileSync(executablePath)).digest('hex'), profileEvidence: root, scope: 'Unpacked packaged desktop; synthetic legacy profile, credential migration, preserved historical rows/prompt/policy and reopen. Read-only schema/ledger/integrity audit, negative pre-upgrade control. No installer/update or real user-profile acceptance.' }));
