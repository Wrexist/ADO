import { TodayRequest, TodayProposal, PortfolioSnapshot, type PlanningSnapshot } from '@ado/shared';

/** Read-only alternatives, never a schedule, task mutation or execution request. */
export function proposeToday(input: unknown, plan: PlanningSnapshot, portfolioInput: unknown, lockedRunIds: Set<string>, now = new Date().toISOString()): TodayProposal {
  const request = TodayRequest.parse(input);
  const portfolio = PortfolioSnapshot.parse(portfolioInput);
  if (request.projectId && !portfolio.projects.some((p) => p.id === request.projectId)) throw new Error('Focus project is missing; reload planning');
  const focus = plan.tasks.find((t) => t.id === request.lockedTaskId);
  if (request.lockedTaskId && (!focus || (request.projectId && focus.projectId !== request.projectId))) throw new Error('Locked task is missing or outside the chosen project');
  const estimates = new Map(request.estimates.map((e) => [e.taskId, e]));
  for (const estimate of estimates.values()) {
    if (plan.tasks.find((t) => t.id === estimate.taskId)?.version !== estimate.taskVersion) throw new Error('Task estimate is stale or its task is missing; review the current task');
  }
  const lockedTasks = new Set(plan.executions.filter((e) => lockedRunIds.has(e.runId)).map((e) => e.taskId));
  const alternatives: TodayProposal['alternatives'] = [], excluded: TodayProposal['excluded'] = [];
  const ordered = [...plan.tasks].sort((a, b) => b.priority - a.priority || a.createdTs.localeCompare(b.createdTs) || a.id.localeCompare(b.id));
  for (const task of ordered) {
    const project = portfolio.projects.find((p) => p.id === task.projectId), estimate = estimates.get(task.id);
    let reason: TodayProposal['excluded'][number]['reason'] | undefined;
    if ((request.lockedTaskId && task.id !== request.lockedTaskId) || (request.projectId && task.projectId !== request.projectId)) reason = 'outside_focus';
    else if (!project || project.lifecycle !== 'active') reason = 'inactive_project';
    else if (task.status !== 'ready') reason = 'not_ready';
    else if (task.blockedBy.length) reason = 'dependencies';
    else if (lockedTasks.has(task.id)) reason = 'writer_lock';
    else if (!estimate) reason = 'estimate_missing';
    else if (estimate.maxMinutes > request.availableMinutes) reason = 'outside_window';
    else if (alternatives.length === 3) reason = 'lower_priority';
    if (reason) { excluded.push({ taskId: task.id, reason }); continue; }
    alternatives.push({ taskId: task.id, taskVersion: task.version, title: task.title, estimate: estimate!, uncertainty: 'User estimate; actual duration is unknown', reason: `${request.lockedTaskId ? 'Locked focus. ' : ''}Upper estimate ${estimate!.maxMinutes} minutes fits ${request.availableMinutes} minutes. Manual task priority ${task.priority}; dependencies accepted in this planning snapshot.` });
  }
  return TodayProposal.parse({ generatedTs: now, availableMinutes: request.availableMinutes, lockedTaskId: request.lockedTaskId, alternatives, excluded, scope: 'Manual planning alternatives only; execution eligibility must be reviewed separately' });
}
