import { _electron as electron } from 'playwright';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { openDb } from '../apps/server/src/db/index.ts';
import { PromptStore } from '../apps/server/src/prompts/store.ts';

const executablePath = resolve(process.argv[2] ?? '');
assert(process.argv[2], 'Pass the unpacked desktop executable');
const root = mkdtempSync(join(tmpdir(), 'controlos-packaged-profile-'));
const profile = join(root, 'profile'); mkdirSync(profile);
const old = join(root, 'old-migrations'); mkdirSync(join(old, 'meta'), { recursive: true });
const journal = JSON.parse(readFileSync('apps/server/drizzle/meta/_journal.json', 'utf8'));
journal.entries = journal.entries.filter((entry: { idx: number }) => entry.idx < 9);
writeFileSync(join(old, 'meta/_journal.json'), JSON.stringify(journal));
for (const entry of journal.entries) copyFileSync(`apps/server/drizzle/${entry.tag}.sql`, join(old, `${entry.tag}.sql`));
const previous = process.env.ACC_MIGRATIONS_DIR;
process.env.ACC_MIGRATIONS_DIR = old;
const seed = openDb(join(profile, 'acc.sqlite'));
seed.sqlite.prepare('INSERT INTO runs(id,repo_id,task,model,status,human_action,started_ts) VALUES(?,?,?,?,?,?,?)').run('legacy', 'fixture-repo', 'DEMO historical judgment', 'default', 'done', 'accepted', '2026-07-01T00:00:00Z');
const originalRun = seed.sqlite.prepare('SELECT * FROM runs WHERE id=?').get('legacy') as Record<string, unknown>;
seed.sqlite.close();
if (previous === undefined) delete process.env.ACC_MIGRATIONS_DIR; else process.env.ACC_MIGRATIONS_DIR = previous;
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
      return { tokenMatches: config.accToken === 'packaged-fixture-access', runs: await (await fetch('/api/runs', { headers })).json(), connections: await (await fetch('/api/connections', { headers })).json() };
    });
    assert(data.tokenMatches);
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
  const opened = openDb(join(profile, 'acc.sqlite'));
  try {
    const after = opened.sqlite.prepare('SELECT * FROM runs WHERE id=?').get('legacy') as Record<string, unknown>;
    for (const [key, value] of Object.entries(originalRun)) assert.deepEqual(after[key], value, `Historical field changed: ${key}`);
    assert.equal((opened.sqlite.prepare('SELECT COUNT(*) AS count FROM operation_approvals').get() as { count: number }).count, 0);
    assert.equal(opened.sqlite.pragma('integrity_check', { simple: true }), 'ok');
  } finally { opened.sqlite.close(); }
}
console.log(JSON.stringify({ result: 'passed', executableSha256: createHash('sha256').update(readFileSync(executablePath)).digest('hex'), profileEvidence: root, scope: 'Unpacked packaged desktop; synthetic legacy profile, credential migration, preserved historical row/prompt/policy and reopen. No installer/update or real user-profile acceptance.' }));
