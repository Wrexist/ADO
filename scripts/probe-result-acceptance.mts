import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { buildServer, type AccServer } from '../apps/server/src/app.ts';
import { openDb } from '../apps/server/src/db/index.ts';
import { runs } from '../apps/server/src/db/schema.ts';
import { workspaceEvidence } from '../apps/server/src/runner/workspace.ts';
import type { OperationApproval, RunDetail } from '@ado/shared';

// Synthetic completed runs only. Verification, review and confirmation use the
// production server over HTTP and the built renderer, without route interception.
execFileSync(process.execPath, [resolve('node_modules/vite/bin/vite.js'), 'build'], { cwd: resolve('apps/web'), env: { ...process.env, VITE_SERVER_URL: '' }, windowsHide: true, stdio: 'pipe' });
const root = mkdtempSync(join(tmpdir(), 'controlos-result-review-'));
const dbPath = join(root, 'profile.sqlite'), token = randomBytes(24).toString('hex');
const port = await new Promise<number>((accept, reject) => { const socket = createServer(); socket.once('error', reject); socket.listen(0, '127.0.0.1', () => { const address = socket.address(); assert.ok(address && typeof address !== 'string'); socket.close(() => accept(address.port)); }); });
const base = `http://127.0.0.1:${port}`;
const env = { port, accToken: token, webOrigin: base, dbPath, projectDirs: [], demo: false, serveWebDir: resolve('apps/web/dist') };
const database = openDb(dbPath);
const fixtures = [];
try {
  for (const width of [1536, 390]) {
    const repo = join(root, `repo-${width}`); mkdirSync(repo);
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', windowsHide: true, stdio: 'pipe' }).trim();
    git('init', '-q'); git('config', 'user.name', 'DEMO review'); git('config', 'user.email', 'fixture@example.invalid');
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { verify: 'node verify.cjs' } }));
    writeFileSync(join(repo, 'verify.cjs'), 'console.log("DEMO independent verification");\n');
    // A leading-space binary filename must participate in the reviewed digest.
    const content = Buffer.from([0, 255, 1, 128]), file = join(repo, ' reviewed.bin');
    writeFileSync(file, content); git('add', '.'); git('commit', '-qm', 'DEMO baseline');
    const baseSha = git('rev-parse', 'HEAD'), result = await workspaceEvidence(repo, baseSha);
    const id = `demo-review-${width}`, repoId = `demo-repo-${width}`;
    database.db.insert(runs).values({ id, repoId, task: `DEMO exact result acceptance ${width}`, model: 'default', status: 'done', engineVersion: 1, startedTs: new Date().toISOString(), workspacePath: repo, baseSha, ...result }).run();
    fixtures.push({ width, repo, file, content, id, repoId, ...result });
  }
} finally { database.sqlite.close(); }

let server: AccServer | undefined, browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
const start = async () => {
  server = await buildServer(env, { startSystem: false, startScanner: false });
  await server.app.listen({ port, host: '127.0.0.1' });
};
const request = async (url: string, payload?: object, expected = 200) => {
  // Do not carry pooled sockets across the deliberate server close/reopen below.
  const response = await fetch(base + url, { method: payload === undefined ? 'GET' : 'POST', headers: { 'content-type': 'application/json', 'x-acc-token': token, connection: 'close' }, ...(payload === undefined ? {} : { body: JSON.stringify(payload) }) });
  const data = await response.json(); assert.equal(response.status, expected, JSON.stringify(data)); return data;
};
const detail = async (id: string): Promise<RunDetail> => (await request(`/api/runs/${id}`)).run;
const target = (review: OperationApproval) => ({ action: 'accepted', operation: review.operation, approvalId: review.id, headSha: review.headSha, diffDigest: review.diffDigest, policyVersion: review.policyVersion });
const saved: Array<{ runId: string; old: OperationApproval; accepted: OperationApproval }> = [];
const shots: string[] = [], errors: string[] = [];
try {
  await start(); browser = await chromium.launch();
  const page = await browser.newPage(); page.on('pageerror', error => errors.push(error.message));
  mkdirSync('smoke-shots', { recursive: true });
  for (const fixture of fixtures) {
    const { width, id, repoId, file, content } = fixture;
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(`${base}/agents?run=${id}`);
    await page.getByLabel('Access key').fill(token);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    const row = page.locator(`#run-${id}`);
    await row.getByRole('button', { name: 'Run npm verify', exact: true }).click();
    await row.getByText('Verification: pass', { exact: true }).waitFor();
    assert.equal((await detail(id)).verificationEvidence?.[0]?.exitCode, 0);
    await row.getByRole('button', { name: 'Accepted', exact: true }).click();
    const reviewPanel = row.getByRole('region', { name: 'Confirm result acceptance' });
    await reviewPanel.waitFor();
    assert.equal(await reviewPanel.getByRole('heading').evaluate(element => element === document.activeElement), true);
    const old = (await detail(id)).approvalHistory![0];
    assert.equal(old.diffDigest, fixture.diffDigest); assert.equal(old.consumedTs, null);
    await reviewPanel.getByText(`Content digest: ${old.diffDigest}`, { exact: true }).waitFor();
    // A distinct action cannot consume this prepared result decision.
    await request(`/api/runs/${id}/outcome`, { ...target(old), action: 'corrected' }, 400);
    const profile = (await request('/api/testflight/profiles', { repoId, name: 'DEMO separate deployment', scheme: 'Fixture', bundleId: 'test.fixture' })).profile;
    await request(`/api/testflight/profiles/${profile.id}/deploy`, { marketingVersion: '1.0', buildNumber: '1', ...target(old) }, 400);
    assert.equal((await detail(id)).humanAction, null);
    assert.equal((await detail(id)).approvalHistory![0].consumedTs, null);
    assert.equal((await request('/api/runs')).runs.length, fixtures.length);
    assert.equal((await request('/api/testflight/profiles')).profiles.find((p: { id: string }) => p.id === profile.id).lastDeployRunId, null);
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
      await reviewPanel.getByRole('heading').focus();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (width < 1024) {
        const heading = await reviewPanel.getByRole('heading').boundingBox(), header = await page.locator('header:visible').boundingBox();
        const confirmation = await reviewPanel.getByRole('button', { name: 'Confirm acceptance', exact: true }).boundingBox();
        assert.ok(heading && header && heading.y >= header.y + header.height, 'Review heading must clear mobile navigation');
        assert.ok(confirmation && confirmation.y + confirmation.height <= 1024, 'Review confirmation must be visible');
      }
      const path = `smoke-shots/result-review-${width}-${theme}.png`;
      await page.screenshot({ path, animations: 'disabled' }); shots.push(path);
    }
    writeFileSync(file, Buffer.from([0, 255, 2, 128]));
    const rejected = page.waitForResponse(response => response.request().method() === 'POST' && response.url().endsWith(`/runs/${id}/outcome`));
    await reviewPanel.getByRole('button', { name: 'Confirm acceptance', exact: true }).focus(); await page.keyboard.press('Enter');
    assert.equal((await rejected).status(), 409);
    await row.getByRole('alert').filter({ hasText: 'approval is stale' }).waitFor();
    await row.getByText('Verification: not independently verified', { exact: true }).waitFor();
    assert.equal(await row.getByRole('alert').evaluate(element => element === document.activeElement), true);
    assert.equal(await reviewPanel.count(), 0);
    const stale = await detail(id);
    assert.equal(stale.humanAction, null); assert.equal(stale.verifyVerdict, null);
    assert.ok(stale.approvalHistory!.find(review => review.id === old.id)?.revokedTs);
    const refusedShot = `smoke-shots/result-review-${width}-stale.png`;
    await row.getByRole('alert').scrollIntoViewIfNeeded(); await page.screenshot({ path: refusedShot, animations: 'disabled' }); shots.push(refusedShot);
    // Even restoring identical bytes does not revive the old decision.
    writeFileSync(file, content);
    await row.getByRole('button', { name: 'Run npm verify', exact: true }).click();
    await row.getByText('Verification: pass', { exact: true }).waitFor();
    await request(`/api/runs/${id}/outcome`, target(old), 409);
    await row.getByRole('button', { name: 'Accepted', exact: true }).click(); await reviewPanel.waitFor();
    const accepted = (await detail(id)).approvalHistory![0]; assert.notEqual(accepted.id, old.id);
    assert.equal(accepted.diffDigest, old.diffDigest);
    await reviewPanel.getByRole('button', { name: 'Confirm acceptance', exact: true }).click();
    await row.getByText('Human decision recorded.', { exact: true }).waitFor();
    assert.equal((await detail(id)).humanAction, 'accepted');
    await request(`/api/runs/${id}/outcome`, target(accepted), 409);
    assert.equal((await detail(id)).approvalHistory!.filter(review => review.consumedTs).length, 1);
    saved.push({ runId: id, old, accepted });
  }
  await page.goto('about:blank'); await server!.close(); server = undefined; await start();
  for (const item of saved) {
    const current = await detail(item.runId); assert.equal(current.humanAction, 'accepted');
    assert.equal(current.approvalHistory!.filter(review => review.consumedTs).length, 1);
    assert.ok(current.approvalHistory!.find(review => review.id === item.old.id)?.revokedTs);
    await request(`/api/runs/${item.runId}/outcome`, target(item.old), 409);
    await request(`/api/runs/${item.runId}/outcome`, target(item.accepted), 409);
  }
  assert.equal((await request('/api/runs')).runs.length, fixtures.length); assert.deepEqual(errors, []);
  const hash = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
  const sources = ['scripts/probe-result-acceptance.mts', 'apps/web/src/views/RunHistory.tsx', 'apps/server/src/app.ts', 'apps/server/src/runner/verification.ts', 'apps/server/src/runner/approvals.ts', 'packages/shared/src/testflight.ts'];
  const assets = readdirSync('apps/web/dist/assets').filter(name => /\.(js|css)$/.test(name)).map(name => `apps/web/dist/assets/${name}`);
  writeFileSync('docs/controlos/result-acceptance-ui-evidence.json', JSON.stringify({ date: new Date().toISOString(), baseRevision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), environment: { platform: process.platform, arch: process.arch, node: process.version, chromium: browser.version() }, checks: ['built renderer with production HTTP, no route interception', 'real npm verification before review', 'separate preparation and keyboard confirmation', 'different human action and TestFlight dispatch refuse result approval without side effects', 'leading-space binary file mutation invalidates reviewed digest', 'UI removes old verdict and review after 409', 'identical restored bytes still require new verification and new decision', 'fresh decision accepted exactly once', 'revoked and consumed decisions remain refused after disk-profile reopen', '1536/390 px light/dark, no horizontal overflow or page errors'], sourceSha256: Object.fromEntries(sources.map(path => [path, hash(path)])), assetSha256: Object.fromEntries(assets.map(path => [path, hash(path)])), screenshotSha256: Object.fromEntries(shots.map(path => [path, hash(path)])), scope: 'Synthetic seeded completed runs, disposable Git repositories and disk profile. Production verification/approval HTTP and built UI; no live provider, task.accept browser scenario, sandbox, iOS upload or full T26 certification.' }, null, 2) + '\n');
  console.log(JSON.stringify({ result: 'passed', fixture: root, screenshots: shots }));
} finally { await browser?.close(); await server?.close(); }
