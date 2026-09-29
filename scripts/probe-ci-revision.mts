import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer } from '../apps/server/src/app.ts';

// T03: an older commit's green run must render with SHA and age, never as a check of
// the current head. Synthetic bus events through the production server and built renderer.
execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-ci-revision-'));
const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const token = randomBytes(24).toString('hex'), base = `http://127.0.0.1:${port}`;
const server = await buildServer({ port, accToken: token, webOrigin: base, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false });
const OLD = 'a1b2c3d'.padEnd(40, '0'), NEW = 'e4f5a6b'.padEnd(40, '0');
const runTs = new Date(Date.now() - 3 * 3600_000).toISOString();
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.app.listen({ port, host: '127.0.0.1' });
  const publish = (type: string, payload: unknown) => server.bus.publish({ id: randomUUID(), type, ts: new Date().toISOString(), source: { kind: 'github', ref: 'DEMO/ci-fixture' }, payload });
  publish('repo.upserted', { repo: { id: 'demo-ci', name: 'DEMO CI fixture', description: 'Synthetic run; no GitHub request', category: 'web', status: 'active', branch: 'Main', updatedTs: new Date().toISOString() } });
  const ci = (headSha: string) => publish('repo.enriched', { repoId: 'demo-ci', patch: { ci: { label: 'CI', pct: 100, state: 'success', headSha, runTs, branchHeadSha: NEW } } });
  ci(OLD);
  browser = await chromium.launch();
  const page = await browser.newPage(), errors: string[] = [], shots: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); mkdirSync('smoke-shots', { recursive: true });
  // Browser access lasts until reload, so each navigation reconnects with the key.
  const open = async (path: string) => {
    await page.goto(base + path);
    await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  };
  const note = 'Run for a1b2c3d · 3h ago · not head e4f5a6b (success)';
  const shot = async (name: string) => { const path = `smoke-shots/ci-revision-${name}.png`; await page.screenshot({ path, fullPage: true }); shots.push(path); };

  await page.setViewportSize({ width: 1536, height: 1024 });
  await open('/repositories');
  await page.getByText(note, { exact: true }).first().waitFor();
  assert.equal(await page.getByText('older', { exact: true }).count() >= 1, true);
  await shot('repositories-1536');
  await open('/repositories/demo-ci');
  await page.getByText(note, { exact: true }).waitFor();
  await shot('project-1536');
  await open('/ops');
  await page.getByText('Older commit a1b2c3d', { exact: true }).waitFor();
  assert.equal(await page.getByText('Passing', { exact: true }).count(), 0);
  await shot('ops-older-1536');

  // Positive control: once the run matches the head, the same data renders as passing.
  ci(NEW);
  await page.getByText('Passing', { exact: true }).waitFor();
  assert.equal(await page.getByText('Older commit a1b2c3d', { exact: true }).count(), 0);
  await shot('ops-current-1536');

  ci(OLD);
  await page.setViewportSize({ width: 390, height: 900 });
  await open('/command');
  await page.getByText(new RegExp(`CI ${note.replace(/[()]/g, '\\$&')}`)).waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await shot('mobile-390');
  assert.deepEqual(errors, []);

  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-ci-revision.mts', 'apps/web/src/lib/ci.ts', 'apps/web/src/lib/selectors.ts', 'apps/web/src/views/command/RepoCard.tsx', 'apps/web/src/pages/ProjectPage.tsx', 'apps/web/src/views/MobileOverview.tsx', 'packages/shared/src/state.ts'];
  writeFileSync('docs/controlos/ci-revision-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version() }, checks: ['older green run shows SHA and age on repositories, project and mobile views', 'Ops shows Older commit and no Passing', 'matching run renders Passing (positive control)', '390 px without horizontal overflow', 'no page errors'], sourceSha256: Object.fromEntries(sources.map(p => [p, hash(p)])), screenshotSha256: Object.fromEntries(shots.map(p => [p, hash(p)])), scope: 'Synthetic CI events through the production server and built renderer. No GitHub request.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, screenshots: shots }));
} finally { await browser?.close(); await server.close(); }
