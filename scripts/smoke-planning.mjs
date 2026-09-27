import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

/** Real local HTTP/SQLite planning, synthetic user content, no provider or pilot project. */
export async function smokePlanning(browser, base, token, out) {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('console', (message) => {
    if (message.type() === 'error' && !(message.text().includes('409') && message.location().url.includes('/api/planning/tasks/'))) errors.push(message.text());
  });
  const api = async (path, body, method = body ? 'POST' : 'GET') => {
    const response = await fetch(base + path, { method, headers: { 'x-acc-token': token, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
    if (!response.ok) throw new Error(`Planning smoke API failed: ${response.status} ${await response.text()}`);
    return response.json();
  };
  const pair = async () => { await page.getByLabel('Access key').fill(token); await page.getByRole('button', { name: 'Connect', exact: true }).click(); await page.getByRole('heading', { name: 'Tasks & Inbox', exact: true }).waitFor(); };
  try {
    const runsBefore = await api('/api/runs'); // The demo host has historical fixture rows.
    for (const width of [1536, 390]) {
      const name = `DEMO planning ${width}`;
      const { project } = await api('/api/portfolio/projects', { name, kind: 'fixture', goal: 'DEMO only; no agent dispatch', lifecycle: 'active', focus: false, manualPriority: 0 });
      await page.setViewportSize({ width, height: 1024 }); await page.goto(base + '/tasks'); await pair();
      const aTitle = `DEMO task A ${width}`, bTitle = `DEMO task B ${width}`;
      for (const title of [aTitle, bTitle]) {
        await page.getByLabel('Task title', { exact: true }).fill(title);
        await page.getByLabel('Task project', { exact: true }).selectOption(project.id);
        await page.getByLabel('Expected outcome', { exact: true }).fill('DEMO: independent planning outcome');
        await page.getByLabel('In scope', { exact: true }).fill('Only disposable planning data');
        await page.getByLabel('Acceptance criteria (one per line; new criteria required)', { exact: true }).fill('DEMO criterion: preserve project ownership');
        if (title === bTitle) await page.getByLabel(`${aTitle} · ${name} · draft`, { exact: true }).check();
        await page.getByRole('button', { name: 'Create task', exact: true }).click();
        await page.getByRole('region', { name: 'Task list' }).getByRole('heading', { name: title, exact: true }).waitFor();
      }
      const initialA = (await api('/api/planning')).tasks.find((task) => task.title === aTitle);
      const editable = Object.fromEntries(['projectId', 'repositoryId', 'milestoneId', 'title', 'outcome', 'scope', 'outOfScope', 'acceptance', 'dependsOn', 'priority', 'status', 'sourceRefs', 'version'].map((key) => [key, initialA[key]]));
      await api(`/api/planning/tasks/${initialA.id}`, { ...editable, acceptance: [...initialA.acceptance, { id: randomUUID(), text: 'DEMO optional observation', required: false }] }, 'PUT');
      await page.reload(); await pair();
      const before = await api('/api/planning');
      const a = before.tasks.find((task) => task.title === aTitle);
      const b = before.tasks.find((task) => task.title === bTitle);
      if (b.dependsOn.length !== 1 || b.dependsOn[0] !== a.id) throw new Error('Dependency was not persisted');
      await page.getByRole('button', { name: `Edit ${aTitle}`, exact: true }).click();
      await page.getByLabel(`${bTitle} · ${name} · draft`, { exact: true }).check();
      await page.getByRole('button', { name: 'Save task', exact: true }).click();
      await page.getByRole('alert').filter({ hasText: 'Dependency cycle:' }).waitFor();
      const after = await api('/api/planning');
      if (JSON.stringify(after) !== JSON.stringify(before)) throw new Error('Rejected dependency cycle left a partial change');
      await page.getByRole('alert').scrollIntoViewIfNeeded();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Cycle message overflow');
      await page.screenshot({ path: join(out, `planning-cycle-${width}.png`) });
      await page.getByLabel(`${bTitle} · ${name} · draft`, { exact: true }).uncheck();
      await page.getByLabel('Task title', { exact: true }).fill(`${aTitle} revised`);
      await page.getByLabel('Acceptance criteria (one per line; new criteria required)', { exact: true }).fill([...a.acceptance].reverse().map((c) => c.text).join('\n'));
      await page.getByRole('button', { name: 'Save task', exact: true }).click();
      await page.getByRole('heading', { name: `${aTitle} revised`, exact: true }).waitFor();
      await page.getByLabel('Idea', { exact: true }).fill(`DEMO captured idea ${width}`);
      await page.getByRole('button', { name: 'Save idea', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Idea saved on this host.' }).waitFor();
      await page.getByRole('button', { name: 'Convert to task', exact: true }).click();
      await page.getByLabel('Project for idea', { exact: true }).selectOption(project.id);
      await page.getByRole('button', { name: 'Create draft from idea', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Idea converted to a draft task.' }).waitFor();
      await page.getByLabel('Milestone title', { exact: true }).fill(`DEMO milestone ${width}`);
      await page.getByLabel('Milestone project', { exact: true }).selectOption(project.id);
      await page.getByLabel('Exit criteria (one per line; new criteria required)', { exact: true }).fill('DEMO exit criterion');
      await page.getByLabel('Milestone status', { exact: true }).selectOption('active');
      await page.getByRole('button', { name: 'Create milestone', exact: true }).click();
      await page.getByRole('status').filter({ hasText: 'Milestone saved.' }).waitFor();
      await page.getByRole('button', { name: `Edit milestone DEMO milestone ${width}`, exact: true }).click();
      await page.getByLabel('Milestone title', { exact: true }).fill(`DEMO revised milestone ${width}`);
      await page.getByRole('button', { name: 'Save milestone', exact: true }).click();
      await page.getByRole('heading', { name: `DEMO revised milestone ${width}`, exact: true }).waitFor();
      await page.reload(); await pair();
      await page.getByLabel('Filter by project', { exact: true }).selectOption(project.id);
      const list = page.getByRole('region', { name: 'Task list' });
      await list.getByRole('heading', { name: `${aTitle} revised`, exact: true }).waitFor();
      await list.getByRole('heading', { name: `DEMO captured idea ${width}`, exact: true }).waitFor();
      await list.scrollIntoViewIfNeeded();
      if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)) throw new Error('Planning page overflow');
      await list.screenshot({ path: join(out, `planning-tasks-${width}.png`) });
      const final = await api('/api/planning');
      if (final.tasks.filter((t) => t.projectId === project.id).length !== 3 || final.tasks.find((t) => t.id === a.id).version !== a.version + 1) throw new Error('Planning changes did not survive reload');
      const normalizedCriteria = (criteria) => JSON.stringify([...criteria].sort((a, b) => a.id.localeCompare(b.id)));
      if (normalizedCriteria(final.tasks.find((t) => t.id === a.id).acceptance) !== normalizedCriteria(a.acceptance)) throw new Error('Editing/reordering changed acceptance requirements or criterion identities');
      if (final.milestones.find((m) => m.projectId === project.id).version !== 2) throw new Error('Milestone edit did not persist');
    }
    if (JSON.stringify(await api('/api/runs')) !== JSON.stringify(runsBefore)) throw new Error('Planning changed execution history');
    if (errors.length) throw new Error(errors.join('\n'));
  } finally { await page.close(); }
}
