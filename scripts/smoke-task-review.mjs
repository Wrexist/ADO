import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/** DEMO rendering only; real Git/npm/SQLite acceptance is exercised in taskReviewApi.test.ts. */
export async function smokeTaskReview(browser, base, token, out) {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const projectId = randomUUID(), taskId = randomUUID(), runId = 'demo-criterion-run', checkoutId = randomUUID();
  const ts = new Date().toISOString(), headSha = 'b'.repeat(40), diffDigest = 'c'.repeat(64), policyVersion = randomUUID(), verificationId = randomUUID();
  const task = { id: taskId, projectId, repositoryId: randomUUID(), milestoneId: null, title: 'DEMO criterion review', outcome: 'DEMO: explicit criterion acceptance', scope: 'Synthetic UI data only', outOfScope: 'No actual provider', acceptance: [{ id: randomUUID(), text: 'DEMO required behavior', required: true }, { id: randomUUID(), text: 'DEMO optional observation', required: false }], dependsOn: [], blockedBy: [], priority: 0, status: 'awaiting_review', sourceRefs: [], version: 4, createdTs: ts, updatedTs: ts };
  const originalCriteria = structuredClone(task.acceptance);
  const planning = { tasks: [task], milestones: [], inbox: [], executions: [{ runId, taskId, taskVersion: 1, checkoutId, baseSha: headSha, currentTaskVersion: 4, state: 'done', createdTs: ts }], reviews: [], reopenings: [] };
  const portfolio = { projects: [{ id: projectId, name: 'DEMO review project', kind: 'fixture', goal: '', lifecycle: 'active', focus: false, manualPriority: 0, nextTaskId: null, version: 1, createdTs: ts, updatedTs: ts }], repositories: [], checkouts: [], sources: [] };
  const evidence = { id: verificationId, runId, headSha, diffDigest, command: 'npm run verify', exitCode: 0, verdict: 'pass', output: 'DEMO: synthetic verification output; not a real provider result.', recordedTs: ts };
  const run = { id: runId, repoId: 'demo', task: task.title, model: 'demo', provider: 'codex', status: 'done', startedTs: ts, endedTs: ts, durationMs: 1, tokensIn: null, tokensOut: null, turns: null, exitCode: 0, note: 'DEMO', humanAction: null, workspacePath: 'DEMO workspace', baseSha: headSha, headSha, diffDigest, verifyVerdict: 'pass', timelineState: 'ended', timeline: [], resultText: 'DEMO result', approvalPolicyVersion: policyVersion, approvalHistory: [], verificationEvidence: [evidence] };
  let prepared, acceptanceCount = 0, rejectStale = false;
  let reopeningRequest, reopeningId, reopeningRequests = 0;
  await page.route('**/api/portfolio', (route) => route.fulfill({ json: portfolio }));
  await page.route('**/api/planning', (route) => route.fulfill({ json: planning }));
  await page.route(`**/api/runs/${runId}`, (route) => route.fulfill({ json: { run } }));
  await page.route(`**/api/planning/tasks/${taskId}/approval`, async (route) => {
    const request = route.request().postDataJSON();
    if (request.operation !== 'task.accept' || request.runId !== runId || request.version !== task.version || request.headSha !== headSha || request.diffDigest !== diffDigest || request.verificationId !== verificationId || request.policyVersion !== policyVersion || request.criteria.length !== 2 || request.criteria[0].verdict !== 'pass' || request.criteria[1].verdict !== 'not_checked') throw new Error('Criterion review does not bind the displayed evidence');
    prepared = { request, approval: { id: randomUUID(), actorId: 'local-owner', operation: 'task.accept', runId, repoId: 'demo', headSha, diffDigest, payloadHash: 'd'.repeat(64), policyVersion, policySnapshot: 'DEMO', issuedTs: new Date().toISOString(), expiresTs: new Date(Date.now() + 300000).toISOString(), consumedTs: null, revokedTs: null, revokeReason: null } };
    await route.fulfill({ json: { approval: prepared.approval } });
  });
  await page.route(`**/api/planning/tasks/${taskId}/accept`, async (route) => {
    acceptanceCount++;
    const body = route.request().postDataJSON(), { approvalId, ...request } = body;
    if (approvalId !== prepared.approval.id || JSON.stringify(request) !== JSON.stringify(prepared.request)) throw new Error('Confirmation changed the criterion review');
    if (rejectStale) { run.verifyVerdict = null; await route.fulfill({ status: 409, json: { error: 'DEMO result changed; approval is stale' } }); return; }
    task.status = 'accepted'; task.version++;
    planning.executions[0].currentTaskVersion = task.version;
    planning.reviews = [{ id: approvalId, taskId, taskVersion: task.version - 1, definitionVersion: 1, acceptedTaskVersion: task.version, runId, verificationId, headSha, diffDigest, criteria: body.criteria, definitionCriteria: structuredClone(task.acceptance), actorId: 'local-owner', recordedTs: ts, invalidatedTs: null, invalidationReason: null }];
    await route.fulfill({ json: { task } });
  });
  await page.route(`**/api/planning/tasks/${taskId}/recheck`, async (route) => {
    task.status = 'awaiting_review'; task.version++; planning.executions[0].currentTaskVersion = task.version;
    planning.reviews[0].invalidatedTs = new Date().toISOString(); planning.reviews[0].invalidationReason = 'DEMO content changed';
    run.verifyVerdict = null;
    await route.fulfill({ json: { current: false, task } });
  });
  await page.route(`**/api/planning/tasks/${taskId}/reopen`, async (route) => {
    const request = route.request().postDataJSON(); reopeningRequests++;
    if (reopeningRequest) {
      if (JSON.stringify(request) !== JSON.stringify(reopeningRequest)) throw new Error('Retry changed the reopening request');
      await route.fulfill({ json: { reopeningId, task } }); return;
    }
    if (request.version !== task.version || request.runId !== runId || request.reason !== 'DEMO: add the missing edge case' || !/^[a-f0-9-]{36}$/.test(request.idempotencyKey)) throw new Error('Reopening did not bind current task and reason');
    reopeningRequest = request; reopeningId = randomUUID();
    const fromVersion = task.version; task.status = 'draft'; task.version++;
    planning.reopenings.push({ id: reopeningId, taskId, runId, fromVersion, toVersion: task.version, reason: request.reason, actorId: 'local-owner', recordedTs: ts });
    // Simulate an accepted write whose response is unavailable. Retry must not duplicate it.
    await route.fulfill({ status: 503, json: { error: 'DEMO response lost after saving; retry the same request' } });
  });
  await page.route(`**/api/planning/tasks/${taskId}`, async (route) => {
    const request = route.request().postDataJSON();
    if (route.request().method() !== 'PUT' || request.version !== task.version || task.status !== 'draft') throw new Error('Revision editor did not use the reopened version');
    Object.assign(task, request, { version: task.version + 1 });
    await route.fulfill({ json: { task } });
  });
  const open = async () => {
    await page.goto(base + '/tasks'); await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await page.getByRole('button', { name: `Review criteria for ${task.title}`, exact: true }).click();
    const panel = page.getByRole('region', { name: 'Task criterion review', exact: true }); await panel.getByText('Independent verification: pass', { exact: true }).waitFor();
    await panel.getByText('Inspect verification evidence', { exact: true }).click(); await panel.getByText(evidence.output, { exact: true }).waitFor();
    if (!await panel.getByRole('button', { name: 'Prepare task acceptance', exact: true }).isDisabled()) throw new Error('Unchecked required criterion must block preparation');
    await panel.getByLabel(`Decision: ${task.acceptance[0].text}`, { exact: true }).selectOption('pass');
    for (const c of task.acceptance) await panel.getByLabel(`Evidence: ${c.text}`, { exact: true }).fill(c.required ? 'DEMO: inspected behavior and test output' : 'DEMO: optional observation not checked');
    await panel.getByRole('button', { name: 'Prepare task acceptance', exact: true }).click();
    await panel.getByRole('region', { name: 'Confirm task acceptance', exact: true }).waitFor();
    return panel;
  };
  try {
    for (const width of [1536, 390]) {
      await page.setViewportSize({ width, height: 1024 });
      task.status = 'awaiting_review'; task.version = 4; planning.executions[0].currentTaskVersion = 4; planning.reviews = []; run.verifyVerdict = 'pass'; rejectStale = false;
      task.title = 'DEMO criterion review'; task.acceptance = structuredClone(originalCriteria); planning.reopenings = []; reopeningRequest = undefined; reopeningId = undefined; reopeningRequests = 0;
      const before = acceptanceCount, panel = await open();
      if (acceptanceCount !== before || task.status !== 'awaiting_review') throw new Error('Preparation must not accept the task');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Criterion review overflow');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: join(out, `task-criteria-review-${width}.png`), fullPage: true });
      await panel.getByRole('button', { name: 'Confirm task acceptance', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.getByRole('button', { name: 'Recheck accepted result', exact: true }).waitFor();
      if (acceptanceCount !== before + 1) throw new Error('Confirmation did not submit one acceptance');
      await page.getByText('Criterion review history', { exact: true }).click();
      await page.getByText(/DEMO required behavior: pass/).waitFor();
      await page.getByRole('button', { name: 'Recheck accepted result', exact: true }).click();
      await page.getByText(/Stale: DEMO content changed/).waitFor();
      if (task.status !== 'awaiting_review') throw new Error('Stale acceptance did not return to review');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Criterion history overflow');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: join(out, `task-criteria-stale-${width}.png`), fullPage: true });
      run.verifyVerdict = 'pass'; rejectStale = true;
      const stalePanel = await open();
      await stalePanel.getByRole('button', { name: 'Confirm task acceptance', exact: true }).click();
      await stalePanel.getByRole('alert').filter({ hasText: 'DEMO result changed; approval is stale' }).waitFor();
      await stalePanel.getByText('Independent verification: not verified', { exact: true }).waitFor();
      if (!await stalePanel.getByRole('button', { name: 'Prepare task acceptance', exact: true }).isDisabled()) throw new Error('Stale evidence still permits acceptance');
      await stalePanel.getByRole('button', { name: 'Close criterion review', exact: true }).click();
      await page.getByRole('button', { name: `Revise task ${task.title}`, exact: true }).click();
      const revision = page.getByRole('region', { name: 'Revise completed task', exact: true }); await revision.waitFor();
      if (reopeningRequests) throw new Error('Opening the revision form changed the task');
      await revision.getByLabel('Reason for revision', { exact: true }).fill('DEMO: add the missing edge case');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Revision form overflow');
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.screenshot({ path: join(out, `task-revision-${width}.png`), fullPage: true });
      await revision.getByRole('button', { name: 'Return task to draft', exact: true }).click();
      await revision.getByRole('alert').filter({ hasText: 'DEMO response lost after saving' }).waitFor();
      await revision.getByRole('button', { name: 'Retry revision request', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.getByRole('heading', { name: 'Edit task', exact: true }).waitFor();
      if (reopeningRequests !== 2 || planning.reopenings.length !== 1 || task.status !== 'draft') throw new Error('Retry duplicated or failed to reopen the task');
      await page.getByLabel('Task title', { exact: true }).fill(`DEMO revised criterion task ${width}`);
      await page.getByLabel('Acceptance criteria (one per line; new criteria required)', { exact: true }).fill('DEMO revised required behavior\nDEMO optional observation');
      await page.getByLabel('Planning status', { exact: true }).selectOption('ready');
      await page.getByRole('button', { name: 'Save task', exact: true }).click();
      await page.getByRole('region', { name: 'Task list' }).getByRole('heading', { name: `DEMO revised criterion task ${width}`, exact: true }).waitFor();
      await page.getByText('Revision requests', { exact: true }).click();
      await page.getByText('DEMO: add the missing edge case', { exact: true }).waitFor();
      await page.getByText('Criterion review history', { exact: true }).click();
      await page.getByText(/DEMO required behavior: pass/).waitFor();
      if (task.acceptance[0].text !== 'DEMO revised required behavior') throw new Error('Task criteria were not revised');
      if (task.status !== 'ready' || planning.executions.length !== 1) throw new Error('Revision must not start a new run');
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Task criterion UI smoke passed: explicit DEMO evidence, per-criterion decisions, keyboard confirmation, stale rejection, revision/retry/edit and retained history at 1536/390px.');
  } finally { await page.close(); }
}
