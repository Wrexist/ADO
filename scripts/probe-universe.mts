import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer } from 'node:net';
import { join, resolve } from 'node:path';
import { chromium, type Page, type Locator } from 'playwright';
import { UniverseSnapshot } from '@ado/shared';
import { buildServer } from '../apps/server/src/app.ts';

execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-universe-ui-'));
const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const token = randomBytes(24).toString('hex');
const server = await buildServer({ port, accToken: token, webOrigin: `http://127.0.0.1:${port}`, dbPath: join(root, 'profile.sqlite'), projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') }, { startSystem: false, startScanner: false });
const headers = { host: `127.0.0.1:${port}`, 'x-acc-token': token };
const api = async (url: string, payload?: object) => {
  const result = await server.app.inject({ method: payload ? 'POST' : 'GET', url, headers, ...(payload ? { payload } : {}) });
  assert.equal(result.statusCode, 200, result.body); return result.json();
};
let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
try {
  const base = await server.app.listen({ port, host: '127.0.0.1' });
  browser = await chromium.launch();
  const page = await browser.newPage(), errors: string[] = [], shots: string[] = [];
  page.on('pageerror', e => errors.push(e.message)); mkdirSync('smoke-shots', { recursive: true });
  const open = async (path: string) => {
    await page.goto(`${base}${path}`); await page.getByLabel('Access key').fill(token);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
  };
  // Tab through real focus order rather than calling focus() on the target control.
  const tabTo = async (target: Locator) => {
    for (let i = 0; i < 180; i++) {
      if (await target.evaluate(el => el === document.activeElement)) return;
      await page.keyboard.press('Tab');
    }
    throw new Error(`Keyboard could not reach ${await target.textContent()}`);
  };
  const activate = async (target: Locator) => { await tabTo(target); await page.keyboard.press('Enter'); };
  const noOverflow = async (p: Page) => assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await open('/universe');
  await page.getByText('No records yet. Create a project or capture an idea to begin.', { exact: true }).waitFor();
  const project = async (name: string) => (await api('/api/portfolio/projects', { name, kind: 'app', goal: 'DEMO isolated browser acceptance fixture', lifecycle: 'active', focus: false, manualPriority: 1 })).project;
  const a = await project('DEMO North'), b = await project('DEMO North'), c = await project('DEMO South with a deliberately long project title for mobile layout');
  await api('/api/planning/inbox', { idempotencyKey: randomUUID(), text: 'DEMO reusable design idea', projectId: a.id });
  await api('/api/planning/milestones', { projectId: c.id, title: 'DEMO accessible milestone', exitCriteria: [], status: 'planned' });
  const initial = UniverseSnapshot.parse(await api('/api/universe'));
  const idea = initial.nodes.find(n => n.kind === 'idea')!, milestone = initial.nodes.find(n => n.kind === 'milestone')!;
  const resource = { id: randomUUID(), projectId: a.id, title: 'DEMO shared resource', reference: 'file://DEMO/reference-only/never-read', source: 'DEMO manual resource source' };
  await api('/api/universe/resources', resource);
  for (const [fromKey, toKey, kind] of [
    [idea.key, `project:${a.id}`, 'belongs_to'], [milestone.key, `project:${c.id}`, 'depends_on'],
    [`project:${a.id}`, `resource:${resource.id}`, 'shares_resource'], [`project:${a.id}`, `project:${b.id}`, 'related_to'],
  ]) await api('/api/universe/relations', { id: randomUUID(), fromKey, toKey, kind, source: `DEMO explicit ${kind} decision` });
  const planningBefore = await api('/api/planning');
  const portfolio = await api('/api/portfolio');
  await open('/projects');
  await page.getByText('Repositories & identity', { exact: true }).first().waitFor();
  for (const disclosure of await page.getByText('Repositories & identity', { exact: true }).all()) await activate(disclosure);
  for (const p of portfolio.projects) await page.getByText(`Project ID: ${p.id}`, { exact: true }).waitFor();
  await activate(page.getByRole('navigation', { name: 'Project tools' }).getByRole('link', { name: 'Universe', exact: true }));
  await page.getByText('6 of 6 records shown', { exact: true }).waitFor();
  const snapshot = UniverseSnapshot.parse(await api('/api/universe'));
  assert.deepEqual(snapshot.nodes.filter(n => n.kind === 'project').map(n => n.projectId).sort(), portfolio.projects.map((p: { id: string }) => p.id).sort());
  for (const width of [1536, 768, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByLabel('Project filter', { exact: true }).selectOption('');
    for (const node of snapshot.nodes) {
      const button = page.getByRole('button', { name: `View ${node.kind}: ${node.title} (${node.key.slice(-8)})`, exact: true });
      await activate(button);
      assert.equal(await page.getByRole('heading', { name: node.title, exact: true, level: 2 }).evaluate(el => el === document.activeElement), true);
      await page.getByText(`Record: ${node.key}`, { exact: true }).waitFor();
      await noOverflow(page);
    }
    await page.getByLabel('Project filter', { exact: true }).selectOption(a.id);
    // Endpoint navigation must remain possible when its project is filtered out.
    const allRelations = page.getByRole('heading', { name: 'All explicit relations', exact: true }).locator('..');
    const dependency = allRelations.locator('li').filter({ hasText: 'DEMO explicit depends_on decision' });
    await activate(dependency.getByRole('button', { name: `${c.name} · ${c.id.slice(-8)}`, exact: true }));
    await page.getByText(`Record: project:${c.id}`, { exact: true }).waitFor();
    assert.equal(await allRelations.locator('li').count(), 4);
    await page.getByLabel('Project filter', { exact: true }).selectOption('');
    await page.getByLabel('Search records', { exact: true }).fill('no-record-matches-this');
    await page.getByText('No records match these filters. Clear search or choose All types / All projects.', { exact: true }).waitFor();
    await page.getByLabel('Search records', { exact: true }).fill('');
    for (const theme of ['light', 'dark']) {
      const toggle = page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true });
      if (await toggle.count() && await toggle.isVisible()) await toggle.click();
      assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
      await noOverflow(page); await page.evaluate(() => window.scrollTo(0, 0));
      const shot = `smoke-shots/universe-${width}-${theme}.png`; await page.screenshot({ path: shot, fullPage: true, animations: 'disabled' }); shots.push(shot);
    }
  }
  await page.setViewportSize({ width: 1536, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.evaluate(() => { document.documentElement.style.zoom = '2'; });
  await noOverflow(page);
  await activate(page.getByRole('button', { name: `View idea: ${idea.title} (${idea.key.slice(-8)})`, exact: true }));
  assert.equal(await page.getByRole('heading', { name: idea.title, exact: true, level: 2 }).evaluate(el => el === document.activeElement), true);
  await page.screenshot({ path: 'smoke-shots/universe-200-css-zoom.png', fullPage: true, animations: 'disabled' });
  shots.push('smoke-shots/universe-200-css-zoom.png');
  await page.evaluate(() => { document.documentElement.style.zoom = ''; });
  await page.setViewportSize({ width: 390, height: 1000 });
  // Complete creation and removal on the narrow layout using keyboard activation.
  await activate(page.locator('summary').filter({ hasText: /^Add a resource reference$/ }));
  await page.getByLabel('Resource title', { exact: true }).fill('DEMO temporary reference');
  await page.getByLabel('Reference', { exact: true }).fill('https://example.invalid/not-fetched');
  await page.getByLabel('Resource source', { exact: true }).fill('DEMO keyboard decision');
  const longError = 'DEMO rejected save: ' + 'long-unbroken-reference-'.repeat(80);
  await page.route('**/api/universe/resources', route => route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: longError }) }));
  await activate(page.getByRole('button', { name: 'Save resource reference', exact: true }));
  await page.getByRole('alert').filter({ hasText: longError }).waitFor();
  assert.equal(await page.getByLabel('Resource title', { exact: true }).inputValue(), 'DEMO temporary reference');
  await noOverflow(page);
  await page.unroute('**/api/universe/resources');
  await activate(page.getByRole('button', { name: 'Save resource reference', exact: true }));
  await page.getByText('Resource reference saved.', { exact: true }).waitFor();
  const created = UniverseSnapshot.parse(await api('/api/universe')).nodes.find(n => n.title === 'DEMO temporary reference')!;
  await activate(page.locator('summary').filter({ hasText: /^Add a relation$/ }));
  await page.getByLabel('From record', { exact: true }).selectOption(`project:${a.id}`);
  await page.getByLabel('To record', { exact: true }).selectOption(created.key);
  await page.getByLabel('Relation source', { exact: true }).fill('DEMO temporary link');
  await activate(page.getByRole('button', { name: 'Save relation', exact: true }));
  await page.getByText('Relation saved.', { exact: true }).waitFor();
  await activate(page.getByRole('button', { name: `View resource: ${created.title} (${created.key.slice(-8)})`, exact: true }));
  await activate(page.getByRole('button', { name: 'Remove resource reference', exact: true }));
  await page.getByRole('alert').filter({ hasText: /relations first/ }).waitFor();
  const temporaryRelation = page.getByRole('heading', { name: 'All explicit relations', exact: true }).locator('..').locator('li').filter({ hasText: 'DEMO temporary link' });
  await activate(temporaryRelation.getByRole('button', { name: /^Remove relation:/ }));
  await page.getByText('Relation removed.', { exact: true }).waitFor();
  await activate(page.getByRole('button', { name: 'Remove resource reference', exact: true }));
  await page.getByText('Resource reference removed.', { exact: true }).waitFor();
  await page.route('**/api/universe', route => route.abort());
  await activate(page.getByRole('button', { name: 'Refresh Universe', exact: true }));
  await page.getByText(/Refresh failed; any displayed data is last known and may be stale/).waitFor();
  assert.equal(await page.getByRole('list', { name: 'Universe records' }).locator(':scope > li').count(), 6);
  assert.equal(await page.getByRole('button', { name: 'Save relation', exact: true }).isDisabled(), true);
  assert.equal(await page.getByRole('button', { name: 'Save resource reference', exact: true }).isDisabled(), true);
  await page.unroute('**/api/universe');
  await activate(page.getByRole('button', { name: 'Refresh Universe', exact: true }));
  await page.getByText(/Refresh failed; any displayed data is last known and may be stale/).waitFor({ state: 'hidden' });
  assert.equal(await page.getByRole('button', { name: 'Save relation', exact: true }).isEnabled(), true);
  assert.deepEqual(await api('/api/planning'), planningBefore);
  assert.deepEqual((await api('/api/runs')).runs, []);
  assert.deepEqual(errors, []);
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-universe.mts', 'apps/web/src/pages/UniversePage.tsx', 'apps/web/src/lib/universe.ts', 'apps/server/src/projects/universe.ts', 'apps/server/src/projects/universe.test.ts', 'apps/server/src/app.ts', 'packages/shared/src/universe.ts', 'apps/server/drizzle/0021_universe.sql'];
  const assets = readdirSync('apps/web/dist/assets').map(name => `apps/web/dist/assets/${name}`);
  writeFileSync('docs/controlos/universe-ui-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version() }, checks: ['empty and no-match states', 'same project identities as Projects', 'all four node and relation kinds', 'duplicate project names disambiguated by identity', 'Tab/Enter reaches every record and relation endpoints', 'focus moves to selected detail', 'cross-project navigation survives filters', '1536/768/390 px in light and dark without horizontal overflow', '200 percent CSS zoom with reduced motion (not native browser zoom)', 'long save error retains draft without overflow', 'narrow-layout create and remove with keyboard activation', 'linked resource removal refused', 'failed refresh retains snapshot and disables mutation; retry recovers', 'planning unchanged and no agent run', 'no page errors'], sourceSha256: Object.fromEntries(sources.map(p => [p, hash(p)])), assetSha256: Object.fromEntries(assets.map(p => [p, hash(p)])), screenshotSha256: Object.fromEntries(shots.map(p => [p, hash(p)])), scope: 'Isolated synthetic portfolio through production APIs and the built renderer. List-first Universe; no spatial graph, assistive-technology user study, native installer migration or real pilot acceptance.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, screenshots: shots }));
} finally { await browser?.close(); await server.close(); }
