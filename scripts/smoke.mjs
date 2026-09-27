import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';

const out = resolve(process.argv[2] ?? 'smoke-shots'); await mkdir(out, { recursive: true });
const token = randomBytes(24).toString('hex');
const marker = 'CONTROL_OS_LEGACY_SECRET_MUST_NOT_SHIP';
const env = { ...process.env, VITE_SERVER_URL: '', VITE_ACC_TOKEN: marker };
await new Promise((accept, reject) => {
  const build = spawn(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env, windowsHide: true, stdio: 'inherit' });
  build.once('error', reject); build.once('exit', (code) => code === 0 ? accept() : reject(new Error(`web build failed (${code})`)));
});
for (const name of await readdir('apps/web/dist/assets')) {
  if (name.endsWith('.js') && (await readFile(join('apps/web/dist/assets', name), 'utf8')).includes(marker)) throw new Error('Credential found in public web assets');
}
const port = await new Promise((accept, reject) => {
  const probe = createServer(); probe.once('error', reject);
  probe.listen(0, '127.0.0.1', () => { const p = probe.address().port; probe.close(() => accept(p)); });
});
const base = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'scripts/smoke-server.mts'], { env: { ...env, PORT: String(port), ACC_TOKEN: token }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let diagnostics = ''; server.stderr.on('data', (b) => { diagnostics = (diagnostics + b).slice(-4000); }); server.stdout.resume();
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error(`Demo server exited: ${diagnostics}`);
    try { ready = (await fetch(`${base}/health`)).ok; } catch { /* wait for owned server */ }
    if (ready) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!ready) throw new Error(`Demo server did not become ready: ${diagnostics}`);
  browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1536, height: 1024 } });
  await page.goto(base); await page.getByRole('heading', { name: 'Connect to ControlOS' }).waitFor();
  await page.getByLabel('Access key').fill('wrong'); await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'not accepted' }).waitFor();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()); });
  async function pair() {
    await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: 'Disconnect browser' }).waitFor();
    await page.waitForTimeout(700);
  }
  await pair();
  for (const route of ['/command', '/ops', '/agents', '/settings']) {
    await page.goto(base + route); await pair();
    await page.screenshot({ path: join(out, `${route.slice(1)}.png`), fullPage: true });
  }
  await page.getByRole('button', { name: 'Disconnect browser' }).click();
  await page.getByRole('heading', { name: 'Connect to ControlOS' }).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ['/command', '/ops', '/agents']) {
    await page.goto(base + route); await pair();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
    if (overflow) throw new Error(`Mobile overflow on ${route}`);
    await page.screenshot({ path: join(out, `mobile-${route.slice(1)}.png`), fullPage: true });
  }
  const desktop = await browser.newPage();
  // Explicit API fixtures: exercise terminal process-stop UI without starting an agent.
  const runFixture = {
    id: 'demo-stop', repoId: 'demo-process-fixture', task: 'DEMO: process stop confirmation', model: 'fixture', provider: 'codex', status: 'failed',
    startedTs: new Date().toISOString(), endedTs: new Date().toISOString(), durationMs: 1000, tokensIn: null, tokensOut: null, turns: null,
    exitCode: null, note: 'Demo fixture; no provider or pilot process was started.', humanAction: null, processTermination: 'unconfirmed',
    timelineState: 'ended', timeline: [], resultText: null,
  };
  await page.route('**/api/runs**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/runs') await route.fulfill({ json: { runs: [runFixture] } });
    else if (path === '/api/runs/demo-stop') await route.fulfill({ json: { run: runFixture } });
    else await route.continue();
  });
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const state of ['unconfirmed', 'confirmed', null]) {
      runFixture.processTermination = state;
      await page.goto(base + '/agents?run=demo-stop'); await pair();
      const message = state === 'confirmed' ? 'Agent processes: stopped.' : state === 'unconfirmed'
        ? 'Process stop is unconfirmed. This repository remains locked.' : 'Process stop confirmation: not recorded.';
      await page.getByText(message, { exact: true }).waitFor();
      if (await page.getByRole('button', { name: 'Dispatch again', exact: true }).isDisabled() !== (state === 'unconfirmed')) throw new Error(`Incorrect redispatch state: ${state}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Run detail overflow at ${width}px`);
      await page.screenshot({ path: join(out, `process-stop-${state ?? 'legacy'}-${width}.png`), fullPage: true });
    }
  }
  await desktop.addInitScript((accToken) => { window.__ACC_DESKTOP__ = { serverUrl: '', accToken }; }, token);
  await desktop.setViewportSize({ width: 1536, height: 1024 });
  await desktop.goto(base); await desktop.getByRole('heading', { name: 'Welcome back' }).waitFor({ timeout: 10000 });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Smoke passed: no bundled credential, pairing/rejection/disconnect/reload, desktop runtime access, desktop and mobile routes, process-stop fixtures and redispatch controls.');
} finally {
  await browser?.close(); server.kill();
}
