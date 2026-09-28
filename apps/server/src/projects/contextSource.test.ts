import { execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { previewContextSources } from './contextSource';
import { commonGitIdentity } from './checkoutIdentity';
import { buildServer } from '../app';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'controlos-context-source-')), repo = join(root, 'repo'); mkdirSync(repo);
  const git = (args: string[], input?: string) => execFileSync('git', args, { cwd: repo, input, encoding: 'utf8', windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
  for (const path of ['notes.md', ' leading.md', 'literal[1].md']) writeFileSync(join(repo, path), 'Committed reference text');
  writeFileSync(join(repo, 'canary.md'), 'FIXTURE_PRIVATE_CONTEXT_CANARY');
  writeFileSync(join(repo, 'binary.txt'), Buffer.from([0, 1, 2])); writeFileSync(join(repo, 'invalid.txt'), Buffer.from([255, 254, 253]));
  writeFileSync(join(repo, 'large.md'), 'a'.repeat(16385));
  for (let i = 0; i < 5; i++) writeFileSync(join(repo, `budget-${i}.md`), 'b'.repeat(14000));
  writeFileSync(join(repo, '.env'), 'FIXTURE_PRIVATE_CONTEXT_CANARY');
  writeFileSync(join(repo, '.gitattributes'), '*.md filter=probe diff=probe\n');
  git(['add', '.']); git(['commit', '-qm', 'base']);
  const previous = git(['rev-parse', 'HEAD']), link = git(['hash-object', '-w', '--stdin'], '../outside/secret.txt');
  git(['update-index', '--add', '--cacheinfo', `120000,${link},link.md`]);
  git(['update-index', '--add', '--cacheinfo', `160000,${previous},module.md`]);
  git(['commit', '-qm', 'special entries']);
  const baseSha = git(['rev-parse', 'HEAD']), identity = commonGitIdentity(repo), checkoutId = randomUUID();
  return { root, repo, git, baseSha, identity, request: { version: 1, checkoutId, baseSha, files: [{ path: 'notes.md' }] } };
}

it('reads exact committed blobs with provenance, ignores dirty files and never executes repository filters', async () => {
  const h = fixture(), marker = join(h.root, 'unexpected-script');
  const script = join(h.root, 'probe.cjs'); writeFileSync(script, `require('node:fs').writeFileSync(${JSON.stringify(marker)},'executed')`);
  const command = `"${process.execPath.replace(/\\/g, '/')}" "${script.replace(/\\/g, '/')}"`;
  for (const key of ['core.fsmonitor', 'filter.probe.clean', 'filter.probe.process', 'diff.probe.textconv']) h.git(['config', key, command]);
  writeFileSync(join(h.repo, 'notes.md'), 'UNCOMMITTED MUST NOT ENTER CONTEXT');
  const config = readFileSync(join(h.repo, '.git/config')), index = readFileSync(join(h.repo, '.git/index'));
  const hash = createHash('sha256').update('Committed reference text').digest('hex');
  const result = await previewContextSources(h.repo, h.identity, { ...h.request, files: [{ path: 'notes.md', expectedSha256: hash }, { path: ' leading.md', expectedSha256: '0'.repeat(64) }, { path: 'literal[1].md' }] }, []);
  expect(result.status).toBe('review_required');
  expect(result.files.map(f => f.text)).toEqual(Array(3).fill('Committed reference text'));
  expect(result.files.map(f => f.comparison)).toEqual(['matches_supplied_hash', 'differs_from_supplied_hash', 'not_supplied']);
  expect(result.files.every(f => f.sha256 === hash && /^[a-f0-9]{40}$/.test(f.blobId))).toBe(true);
  expect(existsSync(marker)).toBe(false); expect(readFileSync(join(h.repo, '.git/config'))).toEqual(config); expect(readFileSync(join(h.repo, '.git/index'))).toEqual(index);
});

it('refuses excluded paths, symbolic links, submodules, binary/invalid text, known secrets and excess bytes', async () => {
  const h = fixture();
  for (const path of ['../other/notes.md', '/absolute.md', 'C:/other.md', 'folder\\file.md', '.env', 'credentials.json', 'node_modules/a.md', 'dist/a.md', 'missing.md', 'link.md', 'module.md', 'binary.txt', 'invalid.txt', 'large.md', 'canary.md']) {
    await expect(previewContextSources(h.repo, h.identity, { ...h.request, files: [{ path }] }, ['FIXTURE_PRIVATE_CONTEXT_CANARY'])).rejects.toThrow();
  }
  await expect(previewContextSources(h.repo, 'wrong-identity', h.request, [])).rejects.toThrow('identity changed');
  await expect(previewContextSources(h.repo, h.identity, { ...h.request, files: Array.from({ length: 5 }, (_, i) => ({ path: `budget-${i}.md` })) }, [])).rejects.toThrow('byte budget exceeded');
  h.git(['commit', '--allow-empty', '-qm', 'new base']);
  await expect(previewContextSources(h.repo, h.identity, h.request, [])).rejects.toThrow('base revision changed');
});

it('binds the production preview API to current task and checkout identities without changing planning or dispatching', async () => {
  const h = fixture(), token = 'FIXTURE_PRIVATE_CONTEXT_CANARY';
  const server = await buildServer({ port: 8787, webOrigin: 'http://localhost:5173', accToken: token, dbPath: join(h.root, 'profile.sqlite'), projectDirs: [], demo: false }, { startSystem: false });
  const headers = { host: '127.0.0.1:8787', 'x-acc-token': token };
  try {
    const post = (url: string, payload: object) => server.app.inject({ method: 'POST', url, headers, payload });
    const get = async (url: string) => (await server.app.inject({ url, headers })).json();
    await post('/api/projects', { dir: h.repo });
    const source = (await get('/api/portfolio')).sources.find((s: { kind: string }) => s.kind === 'local');
    const project = (await post('/api/portfolio/projects', { name: 'Preview fixture', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 })).json().project;
    const imported = (await post('/api/portfolio/import', { projectId: project.id, sourceId: source.id })).json();
    const task = (await post('/api/planning/tasks', { projectId: project.id, repositoryId: imported.repositoryId, milestoneId: null, title: 'Context review', outcome: '', scope: '', outOfScope: '', acceptance: [], dependsOn: [], priority: 0, status: 'draft', sourceRefs: [] })).json().task;
    const route = `/api/planning/tasks/${task.id}/context/preview`, body = { ...h.request, checkoutId: imported.checkoutId, version: task.version };
    const before = await get('/api/planning');
    const other = fixture();
    await post('/api/projects', { dir: other.repo });
    const otherSource = (await get('/api/portfolio')).sources.find((s: { kind: string; location: string }) => s.kind === 'local' && s.location.toLowerCase() === other.repo.toLowerCase());
    const otherProject = (await post('/api/portfolio/projects', { name: 'Other project', kind: 'app', goal: '', lifecycle: 'active', focus: false, manualPriority: 0 })).json().project;
    const otherImport = (await post('/api/portfolio/import', { projectId: otherProject.id, sourceId: otherSource.id })).json();
    expect((await post(route, { ...body, checkoutId: otherImport.checkoutId, baseSha: other.baseSha })).statusCode).toBe(409);
    expect((await server.app.inject({ method: 'POST', url: route, headers: { host: headers.host }, payload: body })).statusCode).toBe(401);
    const result = await post(route, body); expect(result.statusCode, result.body).toBe(200);
    expect(result.headers['cache-control']).toBe('no-store');
    expect(result.json()).toMatchObject({ taskId: task.id, projectId: project.id, repositoryId: imported.repositoryId, baseSha: h.baseSha, authority: 'reference_only', executionEnabled: false, status: 'unreviewed' });
    expect((await post(route, { ...body, version: task.version + 1 })).statusCode).toBe(409);
    expect((await post(route, { ...body, checkoutId: randomUUID() })).statusCode).toBe(409);
    expect((await post(route, { ...body, cwd: h.root })).statusCode).toBe(400);
    const secret = await post(route, { ...body, files: [{ path: 'canary.md' }] }); expect(secret.statusCode).toBe(409); expect(secret.body).not.toContain(token);
    expect(await get('/api/planning')).toEqual(before); expect((await get('/api/runs')).runs).toEqual([]);
  } finally { await server.close(); }
});
