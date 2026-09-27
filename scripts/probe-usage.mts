import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer } from '../apps/server/src/app.ts';
import { openDb } from '../apps/server/src/db/index.ts';
import { runs } from '../apps/server/src/db/schema.ts';

execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-usage-ui-'));
const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const token = randomBytes(24).toString('hex'), dbPath = join(root, 'profile.sqlite');
const server = await buildServer({ port, accToken: token, webOrigin: `http://127.0.0.1:${port}`, dbPath, projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false });
const { db, sqlite } = openDb(dbPath);
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const startedTs = new Date().toISOString();
  const seed = (id: string, name: string, tokensIn: number | null, tokensOut: number | null) => db.insert(runs).values({ id, repoId: name, model: name, task: 'DEMO usage fixture', status: 'done', startedTs, tokensIn, tokensOut }).run();
  const base = await server.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch();
  const page = await browser.newPage(), errors: string[] = [], shots: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); mkdirSync('smoke-shots', { recursive: true });
  for (const width of [1536, 390]) {
    db.delete(runs).run(); seed('unknown', 'DEMO unknown', null, null);
    await page.setViewportSize({ width, height: 1000 });
    const open = async () => {
      await page.goto(`${base}/analytics`);
      await page.getByLabel('Access key').fill(token);
      await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await page.getByText('Cost: unknown. No verified price or billing data is available.', { exact: true }).waitFor();
    };
    await open();
    assert.match(await page.locator('body').innerText(), /Unknown tokens in · Unknown out/);
    assert.equal(await page.getByText('Unknown', { exact: true }).count(), 4);
    seed('zero', 'DEMO zero', 0, 0); seed('partial', 'DEMO partial', 125, null);
    await open();
    const body = await page.locator('body').innerText();
    assert.match(body, /125 reported · partial tokens in · 0 reported · partial out/);
    assert.match(body, /Input usage reported by 2\/3 runs; output usage by 1\/3/);
    for (const name of ['DEMO unknown', 'DEMO zero', 'DEMO partial']) assert.equal(await page.getByText(name, { exact: true }).count(), 2);
    assert.equal(await page.getByText('Unknown', { exact: true }).count(), 2);
    assert.equal(await page.getByText('125 reported · partial', { exact: true }).count(), 3);
    assert.equal(await page.getByText('0', { exact: true }).count() >= 2, true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.evaluate(() => window.scrollTo(0, 0));
    const shot = `smoke-shots/usage-${width}.png`; await page.screenshot({ path: shot, fullPage: true }); shots.push(shot);
  }
  assert.deepEqual(errors, []);
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-usage.mts', 'apps/web/src/pages/AnalyticsPage.tsx', 'apps/web/src/lib/usage.ts', 'apps/server/src/app.ts', 'packages/shared/src/runs.ts'];
  const assets = readdirSync('apps/web/dist/assets').map(name => `apps/web/dist/assets/${name}`);
  writeFileSync('docs/controlos/usage-ui-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version() }, checks: ['unknown usage is not zero', 'reported zero retained', 'partial counters labelled', 'coverage per direction', 'unknown cost', '1536/390 px without horizontal overflow', 'no page errors'], sourceSha256: Object.fromEntries(sources.map(p => [p, hash(p)])), assetSha256: Object.fromEntries(assets.map(p => [p, hash(p)])), screenshotSha256: Object.fromEntries(shots.map(p => [p, hash(p)])), scope: 'Synthetic run metadata through the production API and built renderer. No provider call or billing/pricing validation.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, screenshots: shots }));
} finally { await browser?.close(); sqlite.close(); await server.close(); }
