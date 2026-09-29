/**
 * Capture real ControlOS screens for the commercial: the production server with the
 * deterministic --demo seed, the built renderer, dark theme, 2x pixel density. The
 * first-run shot uses a separate empty profile. Nothing is mocked in the page itself.
 *
 * Usage: node --import tsx marketing/commercial/capture.mts
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium, type Page } from 'playwright';
import { buildServer } from '../../apps/server/src/app.ts';

const out = resolve('marketing/commercial/build/shots');
mkdirSync(out, { recursive: true });
execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });

const freePort = () => new Promise<number>((accept, reject) => { const s = createServer(); s.once('error', reject); s.listen(0, '127.0.0.1', () => { const a = s.address(); assert.ok(a && typeof a !== 'string'); s.close(() => accept(a.port)); }); });

async function serve(demo: boolean) {
  const port = await freePort(), token = randomBytes(24).toString('hex'), base = `http://127.0.0.1:${port}`;
  const root = mkdtempSync(join(tmpdir(), 'controlos-commercial-'));
  const server = await buildServer({ port, accToken: token, webOrigin: base, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false });
  await server.app.listen({ port, host: '127.0.0.1' });
  return { server, token, base };
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1536, height: 960 }, deviceScaleFactor: 2, colorScheme: 'dark' });
await context.addInitScript(() => { try { localStorage.setItem('controlos.appearance', 'dark'); } catch { /* storage unavailable */ } });
const page = await context.newPage();

async function shot(page: Page, base: string, token: string, route: string, name: string, ready: (p: Page) => Promise<unknown>, prepare?: (p: Page) => Promise<unknown>) {
  await page.goto(base + route);
  await page.getByLabel('Access key').fill(token);
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await ready(page);
  await prepare?.(page);
  await page.waitForTimeout(600); // let fonts and the first SSE frames settle
  // Browser-pairing control (the desktop app has none) and the demo profile's
  // "finish setup" strip (a real profile with folders shows neither) are not product UI here.
  await page.evaluate(() => {
    for (const el of Array.from(document.querySelectorAll('button, [role="status"]'))) {
      const text = el.textContent ?? '';
      if (text.trim() === 'Disconnect browser' || text.startsWith('Finish setup:')) (el as HTMLElement).style.display = 'none';
    }
  });
  await page.mouse.move(0, 0);
  await page.screenshot({ path: join(out, `${name}.png`), animations: 'disabled' });
  console.log('captured', name);
}

const demo = await serve(true);
try {
  await shot(page, demo.base, demo.token, '/command', 'command', (p) => p.getByText('Workspace overview').waitFor());
  await shot(page, demo.base, demo.token, '/ops', 'ops', (p) => p.getByText('Operations', { exact: true }).waitFor());
  await shot(page, demo.base, demo.token, '/repositories/sentinel', 'project', (p) => p.getByText('SENTINEL', { exact: true }).first().waitFor());
  await shot(page, demo.base, demo.token, '/agents', 'agents', (p) => p.getByRole('heading', { name: 'Agents' }).waitFor());
  await shot(page, demo.base, demo.token, '/settings', 'settings', (p) => p.getByText('Active integrations').waitFor(), (p) => p.getByLabel('Filter services').fill('git'));
} finally { await demo.server.close(); }

const empty = await serve(false);
try {
  // Real, read-only Setup probe on this machine so the Claude step shows its true state.
  await fetch(`${empty.base}/api/setup/probe`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': empty.token }, body: '{}' });
  await shot(page, empty.base, empty.token, '/command', 'first-run', (p) => p.getByRole('region', { name: 'Get started' }).waitFor());
} finally { await empty.server.close(); await browser.close(); }
