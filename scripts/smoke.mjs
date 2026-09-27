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
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('409') && /\/api\/runs\/demo-stop\/(outcome|verify)$/.test(message.location().url)) return; // explicit stale-review fixtures below
    errors.push(message.text());
  });
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
  // Credential state fixture: no real provider request or saved credential.
  const connectionFixture = { id: 'github', configured: true, authentication: 'unverified', checkedTs: null,
    verificationMessage: 'DEMO credential fixture', hint: '••••demo', updatedTs: null };
  await page.route('**/api/connections**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/verify')) {
      connectionFixture.authentication = 'rejected';
      connectionFixture.checkedTs = new Date().toISOString();
      connectionFixture.verificationMessage = 'DEMO: GitHub rejected this credential.';
      await route.fulfill({ json: { status: connectionFixture } });
    } else await route.fulfill({ json: { connections: [connectionFixture] } });
  });
  for (const width of [1536, 390]) {
    connectionFixture.authentication = 'unverified';
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/settings'); await pair();
    await page.getByLabel('Filter services').fill('github');
    await page.getByText('Configured · not verified', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Verify GitHub', exact: true }).click();
    await page.getByText('Credential rejected', { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Credential verification mobile overflow');
    await page.screenshot({ path: join(out, `credential-rejected-${width}.png`), fullPage: true });
  }
  // Explicit API fixtures: exercise terminal process-stop UI without starting an agent.
  const runFixture = {
    id: 'demo-stop', repoId: 'demo-process-fixture', task: 'DEMO: process stop confirmation', model: 'fixture', provider: 'codex', status: 'failed',
    startedTs: new Date().toISOString(), endedTs: new Date().toISOString(), durationMs: 1000, tokensIn: null, tokensOut: null, turns: null,
    exitCode: null, note: 'Demo fixture; no provider or pilot process was started.', humanAction: null, processTermination: 'unconfirmed',
    timelineState: 'ended', timeline: [], resultText: null,
    diagnostics: '[diagnostics truncated: output was discarded]\nDEMO diagnostic with [redacted] credential',
  };
  let allowAcceptance = false;
  let acceptanceRequests = 0;
  const policyVersion = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const approvalFixture = {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', actorId: 'local-owner', operation: 'result.accept',
    runId: runFixture.id, repoId: runFixture.repoId, headSha: 'a'.repeat(40), diffDigest: 'b'.repeat(64), payloadHash: 'c'.repeat(64),
    policyVersion, policySnapshot: JSON.stringify({ contract: 'DEMO result acceptance policy' }), issuedTs: new Date().toISOString(), expiresTs: new Date(Date.now() + 300000).toISOString(),
    consumedTs: null, revokedTs: null, revokeReason: null,
  };
  await page.route('**/api/runs**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/runs') await route.fulfill({ json: { runs: [runFixture] } });
    else if (path === '/api/runs/demo-stop') await route.fulfill({ json: { run: runFixture } });
    else if (path === '/api/runs/demo-stop/approval') {
      const body = route.request().postDataJSON();
      if (body.operation !== 'result.accept' || body.policyVersion !== policyVersion || body.headSha !== approvalFixture.headSha || body.diffDigest !== approvalFixture.diffDigest) throw new Error('Review does not bind the displayed target');
      await route.fulfill({ json: { approval: approvalFixture } });
    }
    else if (path === '/api/runs/demo-stop/outcome' || path === '/api/runs/demo-stop/verify') {
      if (path.endsWith('/outcome')) {
        acceptanceRequests++;
        const body = route.request().postDataJSON();
        if (body.approvalId !== approvalFixture.id || body.operation !== 'result.accept' || body.policyVersion !== policyVersion) throw new Error('Acceptance does not bind the confirmed review');
        if (allowAcceptance) {
          runFixture.humanAction = 'accepted';
          approvalFixture.consumedTs = new Date().toISOString();
          runFixture.approvalHistory = [{ ...approvalFixture }];
          await route.fulfill({ json: { run: runFixture } });
          return;
        }
      }
      runFixture.verifyVerdict = null; runFixture.humanAction = null;
      await route.fulfill({ status: 409, json: { error: 'DEMO: result changed; previous verification and acceptance cleared.' } });
    }
    else if (path === '/api/runs/demo-stop/reconcile') {
      if (route.request().method() !== 'POST') throw new Error('Recovery must use POST');
      runFixture.processTermination = 'confirmed';
      await route.fulfill({ json: { ok: true } });
    }
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
      await page.getByText(runFixture.diagnostics, { exact: true }).waitFor();
      if (await page.getByRole('button', { name: 'Dispatch again', exact: true }).isDisabled() !== (state === 'unconfirmed')) throw new Error(`Incorrect redispatch state: ${state}`);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Run detail overflow at ${width}px`);
      await page.screenshot({ path: join(out, `process-stop-${state ?? 'legacy'}-${width}.png`), fullPage: true });
      if (state === 'unconfirmed') {
        await page.getByRole('button', { name: 'Recheck process stop', exact: true }).click();
        await page.getByText('Process stop confirmed. The previous attempt remains failed.', { exact: true }).waitFor();
        await page.getByText('Agent processes: stopped.', { exact: true }).waitFor();
        if (await page.getByRole('button', { name: 'Dispatch again', exact: true }).isDisabled()) throw new Error('Confirmed receipt did not update run controls');
      }
    }
  }
  for (const action of ['Accepted', 'Run npm verify']) {
    Object.assign(runFixture, { status: 'done', workspacePath: 'DEMO working copy', verifyVerdict: 'pass', humanAction: null, processTermination: 'confirmed', headSha: approvalFixture.headSha, diffDigest: approvalFixture.diffDigest, approvalPolicyVersion: policyVersion });
    await page.goto(base + '/agents?run=demo-stop'); await pair();
    await page.getByText('Verification: pass', { exact: true }).waitFor();
    await page.getByRole('button', { name: action, exact: true }).click();
    if (action === 'Accepted') await page.getByRole('button', { name: 'Confirm acceptance', exact: true }).click();
    await page.getByText('Verification: not independently verified', { exact: true }).waitFor();
    await page.getByText('DEMO: result changed; previous verification and acceptance cleared.', { exact: true }).waitFor();
  }
  allowAcceptance = true;
  for (const width of [1536, 390]) {
    approvalFixture.consumedTs = null;
    Object.assign(runFixture, { verifyVerdict: 'pass', humanAction: null, approvalHistory: [] });
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/agents?run=demo-stop'); await pair();
    const before = acceptanceRequests;
    await page.getByRole('button', { name: 'Accepted', exact: true }).click();
    await page.getByRole('region', { name: 'Confirm result acceptance' }).waitFor();
    await page.getByRole('status').filter({ hasText: 'Review the exact result below before confirming.' }).waitFor();
    if (acceptanceRequests !== before || runFixture.humanAction !== null) throw new Error('Preparing a review must not record acceptance');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Result approval mobile overflow');
    await page.screenshot({ path: join(out, `result-approval-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Confirm acceptance', exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('status').filter({ hasText: 'Human decision recorded.' }).waitFor();
    if (acceptanceRequests !== before + 1) throw new Error('Confirmation must submit exactly one decision');
    await page.getByText('Recent result reviews', { exact: true }).click();
    await page.getByText(/Acceptance recorded · result.accept/).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Review history mobile overflow');
  }
  await desktop.addInitScript((accToken) => { window.__ACC_DESKTOP__ = { serverUrl: '', accToken }; }, token);
  await desktop.setViewportSize({ width: 1536, height: 1024 });
  await desktop.goto(base); await desktop.getByRole('heading', { name: 'Welcome back' }).waitFor({ timeout: 10000 });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Smoke passed: no bundled credential, pairing/rejection/disconnect/reload, desktop runtime access, desktop and mobile routes, process-stop fixtures and redispatch controls.');
} finally {
  await browser?.close(); server.kill();
}
