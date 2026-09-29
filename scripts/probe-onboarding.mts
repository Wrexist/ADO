import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer } from '../apps/server/src/app.ts';

// First run on an empty profile through the built renderer and production server: the
// Get started checklist shows real step status, a folder added from it is scanned, and
// the checklist gives way to the repository. Setup is probed for real on this machine
// (read-only `--version` / `claude auth status`); no GitHub token or provider run is used.
execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-onboarding-'));
const code = join(root, 'code'), repo = join(code, 'hello-app');
mkdirSync(repo, { recursive: true });
const git = (args: string[]) => execFileSync('git', args, { cwd: repo, stdio: 'ignore' });
git(['init', '-q']); git(['config', 'user.name', 'Fixture']); git(['config', 'user.email', 'fixture@example.test']);
writeFileSync(join(repo, 'README.md'), '# hello'); git(['add', '.']); git(['commit', '-qm', 'init']);

const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const token = randomBytes(24).toString('hex'), base = `http://127.0.0.1:${port}`;
const server = await buildServer({ port, accToken: token, webOrigin: base, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  await server.app.listen({ port, host: '127.0.0.1' });
  const probe = await fetch(`${base}/api/setup/probe`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': token }, body: '{}' });
  const results = (await probe.json()).results as Array<{ id: string; status: string }>;
  const signedIn = ['installed', 'verified'].includes(results.find((r) => r.id === 'claude-login')?.status ?? '');
  browser = await chromium.launch();
  const page = await browser.newPage(), errors: string[] = [], shots: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message)); mkdirSync('smoke-shots', { recursive: true });
  const open = async () => { await page.goto(`${base}/command`); await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click(); };
  const shot = async (name: string) => { const path = `smoke-shots/onboarding-${name}.png`; await page.screenshot({ path, fullPage: true }); shots.push(path); };

  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await open();
    const card = page.getByRole('region', { name: 'Get started' });
    await card.waitFor({ timeout: 15000 }).catch(async (e) => { await page.screenshot({ path: 'smoke-shots/onboarding-debug.png', fullPage: true }); console.log('BODY', (await page.locator('main').first().innerText()).slice(0, 1200)); throw e; });
    await card.getByText(`${signedIn ? 1 : 0} of 2 required steps done`, { exact: true }).waitFor();
    await card.getByText('Add the folder with your code', { exact: false }).waitFor();
    await card.getByRole('link', { name: 'Create a token ↗' }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `overflow at ${width}px`);
    await shot(`empty-${width}`);
  }

  await page.setViewportSize({ width: 1536, height: 1000 });
  await open();
  const checklist = page.getByRole('region', { name: 'Get started' });
  await checklist.waitFor();
  await checklist.getByLabel('Project folder path').fill(code);
  await checklist.getByRole('button', { name: 'Add & scan', exact: true }).click();
  await page.getByRole('button', { name: 'Open hello-app' }).waitFor({ timeout: 30000 });
  assert.equal(await page.getByRole('region', { name: 'Get started' }).count(), 0, 'checklist should give way to repositories');
  assert.equal(await page.getByText(/^Finish setup:/).count(), signedIn ? 0 : 1);
  await shot('after-folder-1536');
  const setupAfter = await (await fetch(`${base}/api/setup`, { headers: { 'x-acc-token': token } })).json();
  assert.equal(setupAfter.results.find((r: { id: string }) => r.id === 'project-dirs').status, 'installed');
  assert.deepEqual(errors, []);

  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-onboarding.mts', 'apps/web/src/views/command/GettingStarted.tsx', 'apps/web/src/views/command/MainColumn.tsx', 'apps/web/src/views/AddProjectPanel.tsx', 'apps/server/src/setup/probe.ts', 'apps/server/src/app.ts'];
  writeFileSync('docs/controlos/onboarding-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, node: process.version, chromium: browser.version(), claudeSignedIn: signedIn }, checks: ['empty profile shows Get started with real step status', '1536/390 px without horizontal overflow', 'folder added from the checklist is scanned and its repository appears', 'checklist gives way to repositories; finish-setup reminder only if Claude sign-in is missing', 'Setup reports project folders installed after adding in the app', 'no page errors'], sourceSha256: Object.fromEntries(sources.map((p) => [p, hash(p)])), screenshotSha256: Object.fromEntries(shots.map((p) => [p, hash(p)])), scope: 'Built renderer and production server with an empty profile. Setup probed on this machine (read-only). No GitHub token, provider run or installer.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', claudeSignedIn: signedIn, screenshots: shots }));
} finally { await browser?.close(); await server.close(); }
