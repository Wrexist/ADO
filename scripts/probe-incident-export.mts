import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer } from '../apps/server/src/app.ts';

execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-incident-export-'));
const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const token = `CANARY-${randomBytes(24).toString('hex')}`;
const server = await buildServer({ port, accToken: token, webOrigin: `http://127.0.0.1:${port}`, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false, spawner: { spawn() { throw new Error('No agent may start'); } } });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const incident = server.incidents.report({ source: 'runner', kind: 'DEMO provider failure', message: `Provider failed: ${token}`, stack: `stderr: ${token}`, context: `https://example.invalid/?value=${encodeURIComponent(token)}` });
  assert.ok(incident); await server.incidents.settled();
  const base = await server.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch(); const page = await browser.newPage(), errors: string[] = [], shots: string[] = [], reports: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); mkdirSync('smoke-shots', { recursive: true });
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 1000 }); await page.goto(`${base}/diagnostics`);
    await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByText('DEMO provider failure', { exact: true }).waitFor();
    assert.ok((await page.locator('body').innerText()).includes('[redacted]'));
    assert.ok(!(await page.content()).includes('CANARY'));
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download report', exact: true }).click();
    const download = await pending; assert.equal(download.suggestedFilename(), 'controlos-incident.json');
    const reportPath = join(root, `report-${width}.json`); await download.saveAs(reportPath); reports.push(reportPath);
    const raw = readFileSync(reportPath, 'utf8'), report = JSON.parse(raw);
    assert.equal(report.format, 'controlos-incident-v1'); assert.equal(report.incident.id, incident.id);
    assert.ok(!raw.includes('CANARY')); assert.ok(raw.includes('[redacted]')); assert.equal(report.incident.stack, 'stderr: [redacted]');
    let unexpectedDownload = false; const onDownload = () => { unexpectedDownload = true; }; page.on('download', onDownload);
    await page.route('**/api/incidents/*/export', route => route.abort());
    await page.getByRole('button', { name: 'Download report', exact: true }).click();
    await page.getByRole('alert').waitFor();
    assert.equal(unexpectedDownload, false);
    page.off('download', onDownload); await page.unroute('**/api/incidents/*/export');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const shot = `smoke-shots/incident-export-${width}.png`; await page.screenshot({ path: shot, fullPage: true }); shots.push(shot);
  }
  assert.deepEqual(errors, []);
  const headers = { host: `127.0.0.1:${port}`, 'x-acc-token': token };
  assert.deepEqual((await server.app.inject({ url: '/api/runs', headers })).json().runs, []);
  assert.ok(!JSON.stringify(server.bus.snapshot()).includes('CANARY'));
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-incident-export.mts', 'apps/web/src/pages/DiagnosticsPage.tsx', 'apps/web/src/lib/incidents.ts', 'apps/server/src/app.ts', 'apps/server/src/incidents/export.ts', 'apps/server/src/incidents/reporter.ts', 'apps/server/src/security.ts'];
  const assets = readdirSync('apps/web/dist/assets').map(name => `apps/web/dist/assets/${name}`);
  writeFileSync('docs/controlos/incident-export-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version() }, checks: ['redacted incident over real SSE', 'no canary in rendered DOM', 'authenticated report download', 'no canary in downloaded JSON', 'network failure has no raw/local fallback', '1536/390 px without horizontal overflow', 'zero runs and no page errors'], sourceSha256: Object.fromEntries(sources.map(p => [p, hash(p)])), assetSha256: Object.fromEntries(assets.map(p => [p, hash(p)])), screenshotSha256: Object.fromEntries(shots.map(p => [p, hash(p)])), reportSha256: reports.map(hash), scope: 'Synthetic incident through the production reporter, SSE, API and built renderer. No external provider, remote phone or complete T23/T27 acceptance.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, screenshots: shots }));
} finally { await browser?.close(); await server.close(); }
