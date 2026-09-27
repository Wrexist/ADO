import { randomUUID } from 'node:crypto';
import { join } from 'node:path';

/** Explicit DEMO API fixtures for review UI only. Actual process behavior has separate integration tests. */
export async function smokeTaskExecution(browser, base, token, out) {
  const page = await browser.newPage(), errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const projectId = randomUUID(), repositoryId = randomUUID(), checkoutId = randomUUID(), taskId = randomUUID();
  const ts = new Date().toISOString(), baseSha = 'a'.repeat(40);
  const portfolio = {
    projects: [{ id: projectId, name: 'DEMO task execution', kind: 'fixture', goal: 'UI fixture only', lifecycle: 'active', focus: false, manualPriority: 0, nextTaskId: null, version: 1, createdTs: ts, updatedTs: ts }],
    repositories: [{ id: repositoryId, projectId, host: 'local', externalId: 'demo', name: 'DEMO repository', canonicalRemote: null, defaultBranch: 'main', observedTs: ts }],
    checkouts: [{ id: checkoutId, repositoryId, hostId: 'demo', canonicalPath: 'C:/DEMO/disposable-task-checkout', pathIdentity: 'demo', gitIdentity: 'demo', sourceId: 'demo', managed: false, headSha: baseSha, observedTs: ts }], sources: [],
  };
  const task = { id: taskId, projectId, repositoryId, milestoneId: null, title: 'DEMO reviewed task', outcome: 'DEMO: show process success awaiting human criterion review', scope: 'UI fixture only', outOfScope: 'No real provider execution', acceptance: [{ id: randomUUID(), text: 'DEMO independent check', required: true }], dependsOn: [], blockedBy: [], priority: 0, status: 'ready', sourceRefs: [], version: 3, createdTs: ts, updatedTs: ts };
  const planning = { tasks: [task], milestones: [], inbox: [], executions: [] };
  let requests = [];
  await page.route('**/api/portfolio', (route) => route.fulfill({ json: portfolio }));
  await page.route('**/api/planning', (route) => route.fulfill({ json: planning }));
  await page.route(`**/api/planning/tasks/${taskId}/dispatch`, async (route) => {
    const body = route.request().postDataJSON(); requests.push(body);
    if (route.request().method() !== 'POST' || body.version !== 3 || body.checkoutId !== checkoutId || body.baseSha !== baseSha || body.provider !== 'codex' || !/^[0-9a-f-]{36}$/.test(body.idempotencyKey) || Object.keys(body).length !== 5) throw new Error('Review did not bind the exact displayed task and checkout');
    const runId = randomUUID();
    task.status = 'awaiting_review'; task.version = 6;
    planning.executions = [{ runId, taskId, taskVersion: 3, checkoutId, baseSha, currentTaskVersion: 6, state: 'done', createdTs: ts }];
    await route.fulfill({ json: { runId } });
  });
  try {
    for (const width of [1536, 390]) {
      task.status = 'ready'; task.version = 3; planning.executions = []; requests = [];
      await page.setViewportSize({ width, height: 1024 }); await page.goto(base + '/tasks');
      await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click();
      await page.getByRole('button', { name: `Review run for ${task.title}`, exact: true }).click();
      const review = page.getByRole('region', { name: 'Review task run' });
      await review.waitFor();
      if (requests.length) throw new Error('Opening review started a run');
      if (!await review.getByRole('heading').evaluate((el) => document.activeElement === el)) throw new Error('Run review did not receive focus');
      await review.getByLabel('Run checkout', { exact: true }).selectOption(checkoutId);
      await review.getByLabel('Run provider', { exact: true }).selectOption('codex');
      await review.getByText(`Reviewed base: ${baseSha}`, { exact: true }).waitFor();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Run review overflow at ${width}px`);
      await page.screenshot({ path: join(out, `task-run-review-${width}.png`), fullPage: true });
      await review.getByRole('button', { name: 'Start reviewed run', exact: true }).focus(); await page.keyboard.press('Enter');
      await page.getByRole('link', { name: 'Run for task version 3: process succeeded', exact: true }).waitFor();
      await page.getByText(/awaiting review.*priority 0.*version 6/).waitFor();
      if (requests.length !== 1 || task.status === 'accepted') throw new Error('Task run confirmation or acceptance mismatch');
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error(`Task outcome overflow at ${width}px`);
      await page.screenshot({ path: join(out, `task-run-outcome-${width}.png`), fullPage: true });
    }
    if (errors.length) throw new Error(errors.join('\n'));
    console.log('Task execution UI smoke passed: explicit DEMO review, exact revision/checkout/provider payload, keyboard confirmation, awaiting review at 1536/390px. No real provider execution.');
  } finally { await page.close(); }
}
