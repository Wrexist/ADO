import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer } from '../apps/server/src/app.ts';

execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-health-invalidation-'));
const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const token = randomBytes(24).toString('hex'), base = `http://127.0.0.1:${port}`;
const server = await buildServer({ port, accToken: token, webOrigin: base, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.app.listen({ port, host: '127.0.0.1' });
  server.bus.publish({ id: randomUUID(), type: 'repo.upserted', ts: new Date().toISOString(), source: { kind: 'scanner', ref: 'DEMO' }, payload: { repo: { id: 'demo-health', name: 'DEMO health fixture', description: 'Synthetic check; no provider request', category: 'app', status: 'active', branch: 'fixture', updatedTs: new Date().toISOString() } } });
  const green = () => server.bus.publish({ id: randomUUID(), type: 'health.checked', ts: new Date().toISOString(), source: { kind: 'health', ref: 'DEMO prior check' }, payload: { service: 'anthropic', state: 'operational' } });
  green();
  browser = await chromium.launch(); const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const open = async () => { await page.goto(base + '/command'); await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click(); };
  await open();
  const row = page.getByText('Anthropic API', { exact: true }).locator('..');
  await row.getByText('Operational', { exact: true }).waitFor();
  const save = await fetch(base + '/api/connections/anthropic', { method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': token }, body: JSON.stringify({ value: 'DEMO-unverified-credential' }) });
  assert.equal(save.status, 200); const saved = await save.json();
  assert.equal(saved.status.configured, true); assert.equal(saved.status.authentication, 'unverified');
  await row.getByText('No data', { exact: true }).waitFor();
  await open(); await row.getByText('No data', { exact: true }).waitFor();
  green(); await row.getByText('Operational', { exact: true }).waitFor();
  const removed = await fetch(base + '/api/connections/anthropic', { method: 'DELETE', headers: { 'x-acc-token': token } });
  assert.equal(removed.status, 200); await row.getByText('No data', { exact: true }).waitFor();
  mkdirSync('smoke-shots', { recursive: true }); const shots: string[] = [];
  for (const theme of ['light', 'dark']) {
    if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
    assert.equal(await row.getByText('Operational', { exact: true }).count(), 0);
    const shot = `smoke-shots/health-invalidation-${theme}.png`; await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' }); shots.push(shot);
  }
  assert.deepEqual(errors, []);
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-health-invalidation.mts', 'apps/server/src/system/health.ts', 'apps/server/src/system/healthCredentials.test.ts', 'apps/server/src/app.ts', 'packages/shared/src/state.ts', 'apps/web/src/lib/selectors.ts'];
  writeFileSync('docs/controlos/health-invalidation-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, node: process.version, chromium: browser.version() }, checks: ['seeded prior health rendered operational', 'real credential save HTTP invalidates health over SSE', 'configured unverified credential does not preserve operational health', 'browser reload preserves unknown state', 'real credential removal HTTP invalidates prior health over SSE', 'light/dark desktop rendering without page errors'], sourceSha256: Object.fromEntries(sources.map(path => [path, hash(path)])), screenshotSha256: Object.fromEntries(shots.map(path => [path, hash(path)])), scope: 'Synthetic prior health, real isolated disk profile, credential API, SSE and built renderer. No provider request, actual expired credential, GitHub lifecycle, mobile health view or full T25 certification.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, screenshots: shots }));
} finally { await browser?.close(); await server.close(); }
