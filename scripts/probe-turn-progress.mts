import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer } from '../apps/server/src/app.ts';
import { parseStreamLine } from '../apps/server/src/runner/adapter.ts';
import type { Spawner } from '../apps/server/src/runner/spawner.ts';

// Own synthetic repository/profile. Real runner, adapter, HTTP, SSE and built renderer;
// the provider is an offline fixture and never launches a process or contacts a model.
execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-turn-progress-')), repo = join(root, 'OFFLINE-T38'); mkdirSync(repo);
const git = (args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
git(['init', '-q']); git(['config', 'user.name', 'Offline fixture']); git(['config', 'user.email', 'fixture@example.test']);
writeFileSync(join(repo, 'README.md'), 'Synthetic T38 fixture only.'); git(['add', '.']); git(['commit', '-qm', 'Offline fixture']);
let finish!: (code: number) => void;
const done = new Promise<number>(accept => { finish = accept; });
let streamConsumed = false, observedCap: number | null = null, starts = 0;
const reportedTurns = 8;
const resultLine = JSON.stringify({ type: 'result', subtype: 'success', num_turns: reportedTurns });
assert.equal(parseStreamLine(resultLine).find(update => update.kind === 'done')?.turns, reportedTurns);
const spawner: Spawner = { spawn(options) {
  starts++; observedCap = options.turnCap;
  return { lines: (async function* () {
    yield JSON.stringify({ type: 'system', subtype: 'init' });
    yield JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Offline fixture waiting for process exit' }] } });
    yield resultLine; streamConsumed = true;
  })(), done, kill() { finish(1); }, terminationConfirmed: () => true };
} };
const port = await new Promise<number>((accept, reject) => {
  const socket = createServer(); socket.once('error', reject);
  socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); });
});
const token = randomBytes(24).toString('hex'), headers = { host: `127.0.0.1:${port}`, 'x-acc-token': token };
const server = await buildServer({ port, accToken: token, webOrigin: `http://127.0.0.1:${port}`, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false, spawner });
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const until = async (check: () => boolean) => { const deadline = Date.now() + 30000; while (!check() && Date.now() < deadline) await new Promise(accept => setTimeout(accept, 20)); assert.ok(check(), 'Fixture did not reach its expected state'); };
try {
  const registered = await server.app.inject({ method: 'POST', url: '/api/projects', headers, payload: { dir: repo } }); assert.equal(registered.statusCode, 200, registered.body);
  const ids = Object.keys(server.bus.snapshot().state.repos); assert.equal(ids.length, 1);
  const dispatched = await server.app.inject({ method: 'POST', url: '/api/dispatch', headers, payload: { repoId: ids[0], task: 'OFFLINE T38: observe progress only', model: 'default' } });
  assert.equal(dispatched.statusCode, 200, dispatched.body); const { runId } = dispatched.json();
  await until(() => streamConsumed);
  assert.equal(starts, 1); assert.equal(observedCap, 20);
  assert.equal(server.bus.snapshot().state.agents[runId].pct, null);
  assert.equal(server.bus.snapshot().state.agents[runId].status, 'running');
  const base = await server.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch(); const page = await browser.newPage(); const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const shots: string[] = []; const out = resolve('smoke-shots'); mkdirSync(out, { recursive: true });
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 900 }); await page.goto(`${base}/agents`);
    await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const card = page.getByText('Offline fixture waiting for process exit', { exact: true }).locator('../../..');
    await card.getByText('Progress unknown', { exact: true }).waitFor();
    assert.equal(await card.getByRole('progressbar').count(), 0);
    assert.ok(!(await card.innerText()).includes('%'), 'Task card implies a completion percentage');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const shot = `smoke-shots/turn-progress-${width}.png`; await page.screenshot({ path: resolve(shot), fullPage: true }); shots.push(shot);
  }
  finish(0); await until(() => !server.runner.isLive(runId));
  const stored = (await server.app.inject({ url: `/api/runs/${encodeURIComponent(runId)}`, headers })).json().run;
  assert.equal(stored.turns, 8); assert.equal(stored.status, 'done'); assert.equal(stored.humanAction, null);
  assert.deepEqual(errors, []);
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-turn-progress.mts', 'apps/server/src/runner/adapter.ts', 'apps/server/src/runner/index.ts', 'apps/web/src/kit/AgentTile.tsx', 'apps/web/src/pages/AgentsPage.tsx', 'apps/web/src/lib/selectors.ts', 'packages/shared/src/state.ts'];
  const assets = ['apps/web/dist/index.html', ...readdirSync('apps/web/dist/assets').filter(name => name.endsWith('.js') || name.endsWith('.css')).map(name => `apps/web/dist/assets/${name}`)];
  const evidence = { date: new Date().toISOString(), scenario: 'T38', baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version() }, reportedTurns, observedCap, statusDuringRender: 'running', taskProgress: 'unknown', completionPercentRendered: false, viewports: [1536, 390], sourceSha256: Object.fromEntries(sources.map(path => [path, hash(path)])), assetSha256: Object.fromEntries(assets.map(path => [path, hash(path)])), screenshotSha256: Object.fromEntries(shots.map(path => [path, hash(path)])), command: 'node --import tsx scripts/probe-turn-progress.mts', scope: 'Offline provider fixture through real adapter/runner, authenticated HTTP/SSE and built Chromium renderer. Provider reports 8 turns with configured cap 20; process completion is held until screenshots, then stored turns are checked. No real model, billing, sandbox or packaged-desktop acceptance.' };
  writeFileSync('docs/controlos/turn-progress-evidence.json', JSON.stringify(evidence, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', ...evidence.environment, runId, reportedTurns, observedCap, fixture: root, screenshots: shots }));
} finally { finish(1); await browser?.close(); await server.close(); }
