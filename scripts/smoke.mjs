import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { chromium } from 'playwright';
import { smokePlanning } from './smoke-planning.mjs';
import { smokeTaskExecution } from './smoke-task-execution.mjs';
import { smokeTaskReview } from './smoke-task-review.mjs';
import { smokeAppearance } from './smoke-appearance.mjs';

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
  let expectedConnectionRejections = 0, observedConnectionRejections = 0;
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    if (message.text().includes('400') && message.location().url === `${base}/api/connections/github` && observedConnectionRejections < expectedConnectionRejections) { observedConnectionRejections++; return; }
    if (message.text().includes('409') && /\/api\/runs\/demo-stop\/(outcome|verify)$/.test(message.location().url)) return; // explicit stale-review fixtures below
    errors.push(`${message.text()} (${message.location().url.split(/[?#]/)[0] || 'inline'})`);
  });
  async function pair() {
    await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: 'Disconnect browser' }).waitFor();
    await page.waitForTimeout(700);
  }
  await pair();
  // Appearance is local preference only; both palettes keep real connection state visible.
  await page.getByRole('button', { name: 'Switch to dark theme' }).click();
  await page.waitForTimeout(250);
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('Dark appearance was not applied');
  await page.screenshot({ path: join(out, 'command-dark.png'), fullPage: true });
  await page.reload(); await pair();
  if (await page.locator('html').getAttribute('data-theme') !== 'dark') throw new Error('Appearance did not survive reload');
  await page.getByRole('button', { name: 'Switch to light theme' }).click();
  for (const route of ['/command', '/ops', '/agents', '/settings']) {
    await page.goto(base + route); await pair();
    await page.screenshot({ path: join(out, `${route.slice(1)}.png`), fullPage: true });
  }
  await smokeAppearance(page, base, pair, out);
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
  // Explicit recovery display fixture; actual restore/restart blocking is tested by the server suite.
  await page.route('**/api/recovery', (route) => route.fulfill({ json: { recovery: { mode: 'review' }, message: 'Recovery review mode: jobs and changes are paused. Connection credentials must be entered again.' } }));
  await page.route('**/api/recovery/references', (route) => route.fulfill({ json: {
    checkedAt: '2026-09-27T12:00:00Z', pendingRuns: 2, pendingVerifications: 1, retainedLocks: 3, contentVerified: false, executionEnabled: false,
    references: ['identity_matches', 'missing', 'replaced', 'other_host', 'unrecorded', 'unavailable'].map((status, index) => ({ kind: 'run_workspace', id: `DEMO-reference-${index}`, path: `C:/DEMO/restored-workspaces/${status}/a-long-local-project-path-for-responsive-review`, status })),
  } }));
  await page.route('**/api/recovery/runs/*/content', (route) => route.fulfill({ json: { runId: 'DEMO-reference-0', checkedAt: '2026-09-27T12:00:00Z', status: 'matches_recorded', executionEnabled: false } }));
  let activationBlocked = true;
  let queuedCancelled = false;
  const reviewedReceipts = new Set();
  await page.route('**/api/recovery/automation-receipts', (route) => route.fulfill({ json: { receipts: ['existing', 'missing', 'ambiguous'].filter(id => !reviewedReceipts.has(id)).map(id => ({
    runId: `DEMO-${id}`, automationId: `DEMO-automation-${id}`, automationName: id === 'missing' ? null : 'DEMO automation', repoId: 'DEMO-project', task: 'DEMO accepted task; execution status is historical', runStatus: 'queued', acceptedAt: '2026-09-27T12:00:00Z', retainedLocks: 1, definitionPresent: id !== 'missing', eligible: id !== 'ambiguous', reason: id === 'ambiguous' ? 'Existing automation history is newer or ambiguous.' : 'History-only review; execution and ownership remain unchanged.', digest: `DEMO-receipt-${id}`,
  })) } }));
  await page.route('**/api/recovery/runs/*/review-automation', (route) => {
    const id = route.request().url().split('/').at(-2).replace('DEMO-', ''), body = route.request().postDataJSON();
    if (body.digest !== `DEMO-receipt-${id}` || body.confirmation !== (id === 'missing' ? 'ACKNOWLEDGE MISSING AUTOMATION' : 'RECORD AUTOMATION HISTORY') || id === 'ambiguous') throw new Error('Automation history review was not bound to the eligible receipt');
    reviewedReceipts.add(id);
    return route.fulfill({ json: { reviewed: true, executionEnabled: false, locksReleased: false } });
  });
  await page.route('**/api/recovery/queue', (route) => route.fulfill({ json: { jobs: [
    ...(!queuedCancelled ? [{ id: 'DEMO-queued', repoId: 'DEMO-project', task: 'DEMO unstarted job', eligible: true, digest: 'DEMO-reviewed-queue', reason: 'No process or workspace recorded.' }] : []),
    { id: 'DEMO-locked', repoId: 'DEMO-project', task: 'DEMO unresolved process', eligible: false, digest: 'DEMO-locked', reason: 'Preserve this writer lock for process review.' },
  ] } }));
  await page.route('**/api/recovery/runs/DEMO-queued/cancel-queued', (route) => {
    const body = route.request().postDataJSON();
    if (body.digest !== 'DEMO-reviewed-queue' || body.confirmation !== 'CANCEL QUEUED JOB') throw new Error('Cancellation was not bound to the displayed job review');
    queuedCancelled = true;
    return route.fulfill({ json: { cancelled: true, locksReleased: false } });
  });
  await page.route('**/api/recovery/prepare', (route) => route.fulfill({ json: { blockers: activationBlocked ? ['Retained writer locks require confirmed process termination. Activation cannot release them.'] : [], token: activationBlocked ? null : 'DEMO-idle-review', references: 0, comparedResults: 0 } }));
  await page.route('**/api/recovery/activate', (route) => {
    const body = route.request().postDataJSON();
    if (body.token !== 'DEMO-idle-review' || body.confirmation !== 'ENABLE MANUAL OPERATION') throw new Error('Activation did not bind the explicit review');
    return route.fulfill({ json: { restartRequired: true, mode: 'manual' } });
  });
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto(base + '/agents'); await pair();
    await page.getByRole('status').filter({ hasText: 'Recovery review mode' }).waitFor();
    await page.getByRole('button', { name: 'Inspect restored references', exact: true }).click();
    await page.getByText('Local references (6)', { exact: true }).click();
    await page.getByText('Identity matches; content not checked', { exact: true }).waitFor();
    await page.getByText('Directory or Git identity changed', { exact: true }).waitFor();
    await page.getByText('Registered on another host; not inspected', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Compare saved result', exact: true }).first().click();
    await page.getByText('Matches the saved revision and fingerprint at inspection time. This is not a new verification or approval.', { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Recovery banner overflow');
    await page.screenshot({ path: join(out, `recovery-review-${width}.png`), fullPage: true });
    queuedCancelled = false;
    await page.getByText('Review restored queued jobs', { exact: true }).click();
    await page.getByRole('button', { name: 'Load queued jobs', exact: true }).click();
    const cancelReview = page.getByRole('button', { name: 'Review cancellation', exact: true });
    await cancelReview.waitFor(); if (await cancelReview.count() !== 1) throw new Error('Uncertain queued record was offered for cancellation');
    await cancelReview.click();
    const confirmCancel = page.getByRole('button', { name: 'Confirm queued-job cancellation', exact: true });
    if (await confirmCancel.isEnabled()) throw new Error('Queued cancellation did not require typed confirmation');
    await page.getByLabel('Type CANCEL QUEUED JOB').fill('CANCEL QUEUED JOB');
    await confirmCancel.click();
    await page.getByRole('status').filter({ hasText: 'Queued job DEMO-queued cancelled' }).waitFor();
    await page.getByText('DEMO unresolved process', { exact: true }).waitFor();
    await page.screenshot({ path: join(out, `recovery-cancel-queue-${width}.png`), fullPage: true });
    reviewedReceipts.clear();
    await page.getByText('Review restored automation history', { exact: true }).click();
    await page.getByRole('button', { name: 'Load automation receipts', exact: true }).click();
    const receiptButtons = page.getByRole('button', { name: 'Review history receipt', exact: true });
    await receiptButtons.first().waitFor();
    if (await receiptButtons.count() !== 2) throw new Error('Ambiguous history was offered for overwrite');
    for (const id of ['existing', 'missing']) {
      await receiptButtons.first().click();
      const confirmHistory = page.getByRole('button', { name: 'Confirm history review', exact: true });
      if (await confirmHistory.isEnabled()) throw new Error('History review did not require typed confirmation');
      const phrase = id === 'missing' ? 'ACKNOWLEDGE MISSING AUTOMATION' : 'RECORD AUTOMATION HISTORY';
      await page.getByLabel(`Type ${phrase}`).fill(phrase);
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`History review overflows at ${width}px`);
      await page.screenshot({ path: join(out, `recovery-automation-${id}-${width}.png`), fullPage: true });
      await confirmHistory.click();
      await page.getByRole('status').filter({ hasText: `Receipt for DEMO-${id} reviewed` }).waitFor();
    }
    if (await receiptButtons.count()) throw new Error('Ambiguous receipt became actionable');
    activationBlocked = true;
    await page.getByText('Resume manual operation', { exact: true }).click();
    await page.getByRole('button', { name: 'Review activation', exact: true }).click();
    await page.getByText('Retained writer locks require confirmed process termination. Activation cannot release them.', { exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Approve manual operation after restart' }).count()) throw new Error('Blocked activation was offered for approval');
    // Separate idle-profile UI fixture; the real API tests prove unresolved rows cannot be cleared here.
    activationBlocked = false;
    await page.reload(); await pair();
    await page.getByText('Resume manual operation', { exact: true }).click();
    await page.getByRole('button', { name: 'Review activation', exact: true }).click();
    const approve = page.getByRole('button', { name: 'Approve manual operation after restart', exact: true });
    await approve.waitFor(); if (await approve.isEnabled()) throw new Error('Activation did not require typed confirmation');
    await page.getByLabel('Type ENABLE MANUAL OPERATION').fill('ENABLE MANUAL OPERATION');
    await approve.click();
    await page.getByText('Manual operation approved. Close and restart ControlOS with this same profile. This session remains paused until restart.', { exact: true }).waitFor();
    await page.screenshot({ path: join(out, `recovery-activation-${width}.png`), fullPage: true });
  }
  await page.unroute('**/api/recovery');
  await page.unroute('**/api/recovery/references');
  await page.unroute('**/api/recovery/runs/*/content');
  await page.unroute('**/api/recovery/prepare');
  await page.unroute('**/api/recovery/activate');
  await page.unroute('**/api/recovery/queue');
  await page.unroute('**/api/recovery/runs/DEMO-queued/cancel-queued');
  await page.unroute('**/api/recovery/automation-receipts');
  await page.unroute('**/api/recovery/runs/*/review-automation');
  // Explicit planning fixture. Persistence and Git preservation have separate real API tests.
  const portfolioProjectId = '11111111-1111-4111-8111-111111111111';
  const portfolioRepositoryId = '22222222-2222-4222-8222-222222222222';
  const portfolioCheckoutId = '33333333-3333-4333-8333-333333333333';
  const observedTs = new Date().toISOString();
  const portfolio = { projects: [], repositories: [], checkouts: [], sources: [{ id: 'local:demo', kind: 'local', name: 'DEMO observed repository', location: 'C:/DEMO/projects/example-working-copy', observedTs }] };
  let importRequests = 0;
  await page.route('**/api/portfolio**', async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'GET') await route.fulfill({ json: portfolio });
    else if (path === '/api/portfolio/projects') {
      const project = { ...request.postDataJSON(), id: portfolioProjectId, nextTaskId: null, version: 1, createdTs: observedTs, updatedTs: observedTs };
      portfolio.projects.push(project); await route.fulfill({ json: { project } });
    } else if (path === `/api/portfolio/projects/${portfolioProjectId}` && request.method() === 'PUT') {
      const data = request.postDataJSON();
      if (data.version !== portfolio.projects[0].version) throw new Error('Project edit lost its version');
      Object.assign(portfolio.projects[0], data, { version: data.version + 1 });
      await route.fulfill({ json: { project: portfolio.projects[0] } });
    } else if (path === '/api/portfolio/import') {
      importRequests++;
      const data = request.postDataJSON();
      if (data.projectId !== portfolioProjectId || data.sourceId !== 'local:demo' || data.repositoryId) throw new Error('Wrong explicit project import target');
      portfolio.repositories = [{ id: portfolioRepositoryId, projectId: portfolioProjectId, host: 'local', externalId: 'DEMO-physical-git-identity', name: 'DEMO repository', canonicalRemote: null, defaultBranch: null, observedTs }];
      portfolio.checkouts = [{ id: portfolioCheckoutId, repositoryId: portfolioRepositoryId, hostId: 'DEMO-host', canonicalPath: portfolio.sources[0].location, pathIdentity: 'DEMO-folder', gitIdentity: 'DEMO-git', sourceId: 'demo', managed: false, headSha: null, observedTs }];
      await route.fulfill({ json: { repositoryId: portfolioRepositoryId, checkoutId: portfolioCheckoutId } });
    } else throw new Error(`Unexpected portfolio fixture request ${request.method()} ${path}`);
  });
  for (const width of [1536, 390]) {
    portfolio.projects = []; portfolio.repositories = []; portfolio.checkouts = [];
    const importsBefore = importRequests;
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/projects'); await pair();
    await page.getByRole('heading', { name: 'Your next project starts here' }).waitFor();
    await page.getByText('Import observed repository metadata', { exact: true }).click();
    if (!await page.getByRole('button', { name: 'Import DEMO observed repository', exact: true }).isDisabled()) throw new Error('Import requires an owning project');
    await page.getByRole('button', { name: 'New project', exact: true }).focus();
    await page.keyboard.press('Enter');
    if (!await page.getByLabel('Project name', { exact: true }).evaluate((element) => element === document.activeElement)) throw new Error('New project must focus its name');
    await page.getByLabel('Project name', { exact: true }).fill('DEMO product');
    await page.getByLabel('Project goal', { exact: true }).fill('DEMO: preserve the manually chosen project goal.');
    await page.getByLabel('Focus project', { exact: true }).check();
    await page.getByRole('button', { name: 'Create project', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Project saved.' }).waitFor();
    if (importRequests !== importsBefore) throw new Error('Creating a project must not auto-import sources');
    await page.getByRole('button', { name: 'Edit DEMO product', exact: true }).click();
    if (!await page.getByLabel('Project name', { exact: true }).evaluate((element) => element === document.activeElement)) throw new Error('Edit form needs keyboard focus');
    await page.getByLabel('Project name', { exact: true }).fill('DEMO product renamed');
    await page.getByRole('button', { name: 'Reload registry', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Registry reloaded.' }).waitFor();
    if (await page.getByLabel('Project name', { exact: true }).inputValue() !== 'DEMO product renamed') throw new Error('Reload discarded an unsaved project draft');
    await page.getByRole('button', { name: 'Save project', exact: true }).click();
    await page.getByRole('heading', { name: 'DEMO product renamed', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Import DEMO observed repository', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Repository metadata imported.' }).waitFor();
    if (importRequests !== importsBefore + 1) throw new Error('Expected exactly one explicit import');
    await page.reload(); await pair();
    await page.getByText('Repositories & identity', { exact: true }).focus();
    await page.keyboard.press('Enter');
    await page.getByText(`Checkout ID: ${portfolioCheckoutId}`, { exact: true }).waitFor();
    await page.getByText('DEMO: preserve the manually chosen project goal.', { exact: true }).waitFor();
    await page.getByText('Default branch: not verified', { exact: true }).waitFor();
    if (portfolio.projects.length !== 1 || portfolio.projects[0].version !== 2) throw new Error('Edit created a duplicate project');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Project registry overflow at ${width}px`);
    await page.screenshot({ path: join(out, `project-registry-${width}.png`), fullPage: true });
  }
  // Explicit DEMO design fixture: no pilot data, real provider or deployment.
  portfolio.projects.push(
    { ...portfolio.projects[0], id: '44444444-4444-4444-8444-444444444444', name: 'DEMO Design system', kind: 'library', goal: 'Shared components and accessible patterns for the next release.', lifecycle: 'maintenance', focus: false },
    { ...portfolio.projects[0], id: '55555555-5555-4555-8555-555555555555', name: 'DEMO Mobile companion', kind: 'mobile', goal: 'Capture ideas on the move. Connection work is still pending.', lifecycle: 'paused', focus: false },
  );
  for (const width of [1536, 768, 390, 375, 844]) {
    await page.setViewportSize({ width, height: width === 844 ? 390 : 1024 });
    await page.emulateMedia({ reducedMotion: width === 375 ? 'reduce' : 'no-preference' });
    await page.goto(base + '/projects'); await pair();
    await page.getByRole('heading', { name: 'DEMO Mobile companion', exact: true }).waitFor();
    const before = JSON.stringify(portfolio);
    await page.getByLabel('Search projects', { exact: true }).fill('mobile');
    if (await page.getByRole('region', { name: 'Project list', exact: true }).getByRole('heading').count() !== 1) throw new Error('Project search did not narrow the list');
    await page.getByLabel('Project status', { exact: true }).selectOption('active');
    await page.getByRole('heading', { name: 'No matching projects' }).waitFor();
    await page.getByRole('button', { name: 'Clear filters' }).click();
    if (await page.getByRole('region', { name: 'Project list', exact: true }).getByRole('heading').count() !== 3) throw new Error('Clear filters did not restore projects');
    await page.getByRole('button', { name: 'List view', exact: true }).focus(); await page.keyboard.press('Enter');
    if (await page.getByRole('button', { name: 'List view', exact: true }).getAttribute('aria-pressed') !== 'true') throw new Error('Keyboard list view failed');
    await page.screenshot({ path: join(out, `openship-projects-list-${width}.png`), fullPage: true, animations: 'disabled' });
    await page.getByRole('button', { name: 'Grid view', exact: true }).click();
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme` }).click();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Project overview overflow at ${width}px/${theme}`);
      await page.screenshot({ path: join(out, `openship-projects-${theme}-${width}.png`), fullPage: true, animations: 'disabled' });
    }
    await page.getByRole('button', { name: 'Switch to light theme' }).click();
    if (JSON.stringify(portfolio) !== before) throw new Error('Presentation controls mutated project data');
  }
  // Credential state fixture: no real provider request or saved credential.
  const connectionFixture = { id: 'github', configured: true, authentication: 'unverified', checkedTs: null,
    verificationMessage: 'DEMO credential fixture', hint: '••••demo', updatedTs: null };
  const connectionRecovery = 'Connection store is unreadable, invalid or changed outside this instance. Original file preserved. Close ControlOS, unlock the original file or restore a verified backup into a new profile, then reopen.';
  await page.route('**/api/connections**', async (route) => {
    if (new URL(route.request().url()).pathname.endsWith('/verify')) {
      connectionFixture.authentication = 'rejected';
      connectionFixture.checkedTs = new Date().toISOString();
      connectionFixture.verificationMessage = 'DEMO: GitHub rejected this credential.';
      await route.fulfill({ json: { status: connectionFixture } });
    } else if (route.request().method() !== 'GET') { expectedConnectionRejections++; await route.fulfill({ status: 400, json: { error: connectionRecovery } }); }
    else await route.fulfill({ json: { connections: [connectionFixture] } });
  });
  for (const width of [1536, 390]) {
    connectionFixture.authentication = 'unverified';
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/settings'); await pair();
    await page.getByLabel('Filter services').fill('github');
    // Opening Settings checks a saved, unchecked key once without a click.
    await page.getByText('Key rejected', { exact: true }).waitFor();
    await page.getByText('DEMO: GitHub rejected this credential.', { exact: true }).waitFor();
    await page.getByRole('link', { name: 'Create a new key ↗' }).waitFor();
    connectionFixture.authentication = 'unverified';
    await page.getByRole('button', { name: 'Check GitHub again', exact: true }).click();
    await page.getByText('Key rejected', { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Credential verification mobile overflow');
    await page.screenshot({ path: join(out, `credential-rejected-${width}.png`), fullPage: true });
    await page.locator('input[type="password"]').fill('DEMO replacement fixture');
    await page.getByText('This doesn’t look like the expected format (GitHub tokens start with ghp_ or github_pat_). You can still save it.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Replace', exact: true }).click();
    await page.getByText(connectionRecovery, { exact: true }).waitFor();
    await Promise.all([
      page.waitForResponse((response) => response.url() === `${base}/api/connections/github` && response.request().method() === 'DELETE' && response.status() === 400),
      page.getByRole('button', { name: 'Disconnect', exact: true }).click(),
    ]);
    await page.getByText(connectionRecovery, { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Connection recovery overflow');
    await page.screenshot({ path: join(out, `connection-recovery-${width}.png`), fullPage: true });
  }
  const setupCredential = { id: 'github-token', status: 'configured', version: null, detail: 'DEMO: Credential rejected. Update it in Connections and verify again.', installable: false, checkedTs: new Date().toISOString() };
  const setupRuntime = { id: 'node', status: 'manual', version: '22.12.0', detail: 'DEMO: Unsupported running server runtime. Requires Node 22.18+ (22.x) or 24.11+; restart with a supported runtime.', installable: false, checkedTs: new Date().toISOString() };
  await page.route('**/api/setup**', (route) => route.fulfill({ json: { results: [setupCredential, setupRuntime] } }));
  for (const width of [1536, 390]) {
    setupCredential.status = 'configured'; setupCredential.detail = 'DEMO: Credential rejected. Update it in Connections and verify again.';
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/setup'); await pair();
    await page.getByText('Node 22.18+ (22.x) or 24.11+', { exact: true }).waitFor();
    await page.getByText('Note: ' + setupRuntime.detail, { exact: true }).waitFor();
    await page.getByText('Windows packaging is under validation.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'View releases', exact: false }).waitFor();
    await page.getByText('Configured · not verified', { exact: true }).waitFor();
    await page.getByText('Note: ' + setupCredential.detail, { exact: true }).waitFor();
    setupCredential.status = 'verified'; setupCredential.detail = 'DEMO: Credential accepted. Repository permissions were not checked.';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('Verified recently', { exact: true }).waitFor();
    setupCredential.status = 'configured'; setupCredential.detail = 'DEMO: Credential verification expired. Verify again in Connections.';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByText('Configured · not verified', { exact: true }).waitFor();
    await page.getByText('Note: ' + setupCredential.detail, { exact: true }).waitFor();
    if (await page.getByText('Ready', { exact: true }).count()) throw new Error('Unverified setup credential shown as Ready');
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Setup authentication overflow');
    await page.screenshot({ path: join(out, `setup-credential-expired-${width}.png`), fullPage: true });
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
    else if (path === '/api/runs/demo-stop/verify/stop') {
      if (route.request().method() !== 'POST') throw new Error('Verification stop must use POST');
      runFixture.verificationAttempts[0].status = 'termination_unconfirmed';
      runFixture.verificationAttempts[0].processTermination = 'unconfirmed';
      await route.fulfill({ json: { requested: true } });
    }
    else if (path === '/api/runs/demo-stop/verify/reconcile') {
      if (route.request().method() !== 'POST') throw new Error('Verification recovery must use POST');
      runFixture.verificationAttempts[0].status = 'interrupted';
      runFixture.verificationAttempts[0].processTermination = 'confirmed';
      runFixture.verificationLocked = false;
      await route.fulfill({ json: { recovered: 1 } });
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
        // A retry is a new attempt: risks are shown before anything is dispatched (T31).
        await page.getByRole('button', { name: 'Dispatch again', exact: true }).click();
        await page.getByText('This starts a new attempt; it does not resume this run.', { exact: true }).waitFor();
        await page.getByRole('button', { name: 'Start new attempt', exact: true }).waitFor();
        if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Retry confirmation overflow at ${width}px`);
        await page.screenshot({ path: join(out, `retry-confirm-${width}.png`), fullPage: true });
        await page.getByRole('button', { name: 'Keep this run only', exact: true }).click();
        await page.getByRole('button', { name: 'Dispatch again', exact: true }).waitFor();
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
  for (const width of [1536, 390]) {
    Object.assign(runFixture, { verifyVerdict: null, humanAction: null, verificationLocked: true,
      verificationAttempts: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', status: 'running', processTermination: 'unconfirmed', startedTs: new Date().toISOString(), endedTs: null, note: 'DEMO verification lifecycle; no actual command started.' }] });
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/agents?run=demo-stop'); await pair();
    await page.getByRole('button', { name: 'Stop verification', exact: true }).waitFor();
    if (await page.getByRole('button', { name: 'Run npm verify', exact: true }).isEnabled()) throw new Error('Locked verifier cannot start another verification');
    await page.getByRole('button', { name: 'Stop verification', exact: true }).click();
    await page.getByRole('button', { name: 'Recheck verification stop', exact: true }).waitFor();
    await page.getByText("Verification is holding this repository's writer lock.", { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Verification lifecycle mobile overflow');
    await page.screenshot({ path: join(out, `verification-quarantine-${width}.png`), fullPage: true });
    await page.getByRole('button', { name: 'Recheck verification stop', exact: true }).click();
    await page.getByText('Verification processes: stopped.', { exact: true }).waitFor();
    await page.getByText('Verification: not independently verified', { exact: true }).waitFor();
    if (!(await page.getByRole('button', { name: 'Run npm verify', exact: true }).isEnabled())) throw new Error('Confirmed stop should release verification control');
  }
  for (const width of [1536, 390]) {
    await page.setViewportSize({ width, height: 1024 });
    for (const kind of ['isolated_clone', null]) {
      Object.assign(runFixture, { status: 'done', workspacePath: 'DEMO independent result', workspaceKind: kind });
      await page.goto(base + '/agents?run=demo-stop'); await pair();
      await page.getByText(`Workspace type: ${kind ? 'isolated clone' : 'not recorded'}`, { exact: true }).waitFor();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Workspace provenance overflow');
      await page.screenshot({ path: join(out, `workspace-provenance-${kind ?? 'legacy'}-${width}.png`), fullPage: true });
    }
  }
  for (const width of [1536, 390]) {
    const repositoryWait = 'Waiting for the current or quarantined writer in this repository.';
    const capacityWait = 'Waiting for execution capacity: active or quarantined writers occupy the profile limit (2).';
    Object.assign(runFixture, { status: 'queued', executionStatus: 'queued', timelineState: 'live', waitingReason: repositoryWait,
      verificationAttempts: [], verificationLocked: false, workspacePath: null, workspaceKind: null, headSha: null, diffDigest: null, approvalPolicyVersion: null, verifyVerdict: null, humanAction: null, processTermination: null });
    await page.setViewportSize({ width, height: 1024 });
    await page.goto(base + '/agents?run=demo-stop'); await pair();
    await page.getByRole('status').filter({ hasText: repositoryWait }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Repository waiting reason mobile overflow');
    await page.screenshot({ path: join(out, `queue-repository-${width}.png`), fullPage: true });
    await page.locator('#run-demo-stop > button').click();
    runFixture.waitingReason = capacityWait;
    await page.getByText(capacityWait, { exact: true }).waitFor();
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Capacity waiting reason mobile overflow');
    await page.screenshot({ path: join(out, `queue-capacity-${width}.png`), fullPage: true });
    runFixture.status = 'running'; runFixture.executionStatus = 'running'; runFixture.waitingReason = null;
    await page.getByText(capacityWait, { exact: true }).waitFor({ state: 'hidden' });
    await page.locator('#run-demo-stop').getByText('running', { exact: true }).waitFor();
    runFixture.status = 'done'; runFixture.executionStatus = 'succeeded'; runFixture.timelineState = 'ended';
    await page.locator('#run-demo-stop').getByText('done', { exact: true }).waitFor();
  }
  await desktop.addInitScript((accToken) => { window.__ACC_DESKTOP__ = { serverUrl: '', accToken }; }, token);
  await desktop.setViewportSize({ width: 1536, height: 1024 });
  await desktop.goto(base); await desktop.getByRole('heading', { name: 'Workspace overview' }).waitFor({ timeout: 10000 });
  await smokePlanning(browser, base, token, out);
  await smokeTaskExecution(browser, base, token, out);
  await smokeTaskReview(browser, base, token, out);
  if (expectedConnectionRejections !== 4 || observedConnectionRejections !== 4) throw new Error('Expected four explicit connection preservation rejections');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log('Smoke passed: no bundled credential, pairing/rejection/disconnect/reload, desktop runtime access, desktop and mobile routes, process-stop fixtures and redispatch controls.');
} finally {
  await browser?.close(); server.kill();
}
