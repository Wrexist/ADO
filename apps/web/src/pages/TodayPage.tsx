import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TodayProposal, type PlanningSnapshot, type PortfolioSnapshot } from '@ado/shared';
import { PageShell } from '../chrome/PageShell';
import { Button, Card } from '../kit';
import { fetchPlanning, planningRequest } from '../lib/planning';
import { fetchPortfolio } from '../lib/portfolio';

const field = 'mt-1 w-full min-w-0 rounded-tile border bg-card px-3 py-2 text-body text-text1';
const reasons: Record<TodayProposal['excluded'][number]['reason'], string> = {
  outside_focus: 'Outside your locked task or project focus', inactive_project: 'Project is not active', not_ready: 'Task is not ready',
  dependencies: 'Dependencies are not accepted', writer_lock: 'An earlier attempt still holds a writer lock', estimate_missing: 'Add a time estimate',
  outside_window: 'Upper estimate exceeds your available time', lower_priority: 'Three higher-priority alternatives already fit',
};
type EstimateDraft = { taskVersion: number; min: string; max: string };

export function TodayPage() {
  const [data, setData] = useState<{ plan: PlanningSnapshot; portfolio: PortfolioSnapshot; loadedTs: string } | null>(null);
  const [minutes, setMinutes] = useState('30'), [projectId, setProjectId] = useState(''), [lockedTaskId, setLockedTaskId] = useState('');
  const [estimates, setEstimates] = useState<Record<string, EstimateDraft>>({});
  const [proposal, setProposal] = useState<TodayProposal | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const load = async () => {
    setBusy(true); setError(''); setProposal(null);
    try { const [plan, portfolio] = await Promise.all([fetchPlanning(), fetchPortfolio()]); setData({ plan, portfolio, loadedTs: new Date().toISOString() }); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  useEffect(() => { void load(); }, []);
  const tasks = data?.plan.tasks ?? [];
  const projectName = (id: string) => `${data?.portfolio.projects.find((p) => p.id === id)?.name ?? 'Project'} · ${id.slice(0, 8)}`;
  const visible = tasks.filter((t) => (!projectId || t.projectId === projectId) && (!lockedTaskId || t.id === lockedTaskId));
  const estimateTasks = visible.filter((t) => t.status === 'ready' || t.id === lockedTaskId);
  const changeEstimate = (id: string, version: number, key: 'min' | 'max', value: string) => {
    setProposal(null); setEstimates((previous) => ({ ...previous, [id]: { ...(previous[id] ?? { min: '', max: '' }), taskVersion: version, [key]: value } }));
  };
  return <PageShell title="Today" subtitle="Choose a useful next step for the time you have.">
    <div className="mt-5 min-w-0 space-y-5">
      <div className="flex flex-wrap items-center gap-3"><Link to="/tasks" className="text-body text-primary">Tasks & Inbox</Link><Button variant="outline" disabled={busy} onClick={() => void load()}>Refresh planning</Button></div>
      {error && <p role="alert" className="break-words text-body text-danger">{error}</p>}
      {!data && <p role="status" className="text-body text-text2">{busy ? 'Loading planning…' : 'Planning is unavailable. Retry with Refresh planning.'}</p>}
      {data && <>
        <Card className="min-w-0 p-4">
          <h2 className="text-title font-semibold">Your focus</h2>
          <p className="mt-2 text-body text-text2">Choose alternatives for manual work. Nothing starts or changes your calendar. These choices stay on this page until you leave or reload.</p>
          <p className="mt-1 text-label text-text3">Planning loaded {new Date(data.loadedTs).toLocaleString()}. Refresh before relying on changed tasks.</p>
          <form className="mt-4 space-y-4" onSubmit={(event) => {
            event.preventDefault(); setBusy(true); setError(''); setProposal(null);
            const request = { availableMinutes: Number(minutes), projectId: projectId || null, lockedTaskId: lockedTaskId || null, estimates: estimateTasks.flatMap((task) => {
              const e = estimates[task.id]; return e?.min && e.max ? [{ taskId: task.id, taskVersion: e.taskVersion, minMinutes: Number(e.min), maxMinutes: Number(e.max) }] : [];
            }) };
            void planningRequest('/today', 'POST', request).then((result) => setProposal(TodayProposal.parse(result))).catch((e: Error) => setError(e.message)).finally(() => setBusy(false));
          }}>
            <fieldset disabled={busy} className="min-w-0 space-y-4">
              <div className="grid min-w-0 gap-3 md:grid-cols-3">
                <label className="min-w-0 text-body">Available minutes<input aria-label="Available minutes" className={field} type="number" min={1} max={1440} required value={minutes} onChange={(e) => { setMinutes(e.target.value); setProposal(null); }} /></label>
                <label className="min-w-0 text-body">Project focus<select aria-label="Project focus" className={field} value={projectId} onChange={(e) => { setProjectId(e.target.value); setLockedTaskId(''); setProposal(null); }}><option value="">All projects</option>{data.portfolio.projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select><span className="text-label text-text3">Changing project clears the task lock.</span></label>
                <label className="min-w-0 text-body">Locked task<select aria-label="Locked task" className={field} value={lockedTaskId} onChange={(e) => { setLockedTaskId(e.target.value); setProposal(null); }}><option value="">No task locked</option>{tasks.filter((t) => !projectId || t.projectId === projectId).map((t) => <option key={t.id} value={t.id}>{t.title} · {projectName(t.projectId)} · {t.status}</option>)}</select></label>
              </div>
              {lockedTaskId && <p className="text-body text-text2">This task stays your focus even if it does not fit. No other task will replace it.</p>}
              <details className="min-w-0 rounded-tile border p-3" open>
                <summary className="cursor-pointer text-body font-semibold">Time estimates ({estimateTasks.length})</summary>
                <p className="mt-2 text-body text-text2">Give a rough range in minutes. The upper end must fit your window. Leave both fields empty when duration is unknown.</p>
                {estimateTasks.map((task) => {
                  const draft = estimates[task.id];
                  return <div key={task.id} className="mt-3 min-w-0 break-words border-t pt-3">
                    <h3 className="text-body font-semibold">{task.title}</h3><p className="mt-1 whitespace-pre-wrap text-body text-text2">{task.outcome}</p>
                    <p className="text-label text-text3">{projectName(task.projectId)} · Task version {task.version} · {task.status}</p>
                    {draft && draft.taskVersion !== task.version && <p role="alert" className="text-body text-warning">Task changed. Review its outcome and update the estimate before requesting suggestions.</p>}
                    <div className="mt-2 grid min-w-0 grid-cols-2 gap-3">
                      <label className="min-w-0 text-body">Minimum<input aria-label={`Minimum minutes: ${task.title}`} type="number" min={1} max={10080} required={Boolean(draft?.max)} className={field} value={draft?.min ?? ''} onChange={(e) => changeEstimate(task.id, task.version, 'min', e.target.value)} /></label>
                      <label className="min-w-0 text-body">Maximum<input aria-label={`Maximum minutes: ${task.title}`} type="number" min={Number(draft?.min) || 1} max={10080} required={Boolean(draft?.min)} className={field} value={draft?.max ?? ''} onChange={(e) => changeEstimate(task.id, task.version, 'max', e.target.value)} /></label>
                    </div>
                  </div>;
                })}
                {!estimateTasks.length && <p className="mt-3 text-body text-text2">No ready tasks in this focus. Define a task in Tasks & Inbox.</p>}
              </details>
              <Button type="submit">{busy ? 'Finding alternatives…' : 'Suggest next steps'}</Button>
            </fieldset>
          </form>
        </Card>
        {proposal && <Card role="region" aria-label="Today suggestions" className="min-w-0 break-words p-4">
          <h2 className="text-title font-semibold">Your alternatives</h2>
          <p role="status" className="mt-1 text-label text-text2">{proposal.alternatives.length} {proposal.alternatives.length === 1 ? 'alternative' : 'alternatives'} found.</p>
          <p className="mt-2 text-body text-text2">Choose one alternative, not a combined schedule. Generated {new Date(proposal.generatedTs).toLocaleString()} for {proposal.availableMinutes} minutes.</p>
          <p className="mt-2 text-body text-text2">Execution permissions and the working environment need a separate review before starting an agent.</p>
          {!proposal.alternatives.length && <p role="status" className="mt-3 text-body">No task fits this focus and time window. Review the reasons below.</p>}
          {proposal.alternatives.map((choice) => <article key={choice.taskId} className="mt-4 border-t pt-3"><h3 className="text-title font-semibold">{choice.title}</h3><p className="mt-1 text-body">{choice.estimate.minMinutes}–{choice.estimate.maxMinutes} minutes · {choice.uncertainty}</p><p className="mt-2 text-body text-text2">{choice.reason}</p></article>)}
          <details className="mt-4"><summary className="cursor-pointer text-body font-semibold">Why other tasks were excluded ({proposal.excluded.length})</summary><ul className="mt-2 space-y-2 text-body text-text2">{proposal.excluded.map((item) => <li key={item.taskId}>{tasks.find((t) => t.id === item.taskId)?.title ?? 'Task no longer in this view'}: {reasons[item.reason]}</li>)}</ul></details>
        </Card>}
      </>}
    </div>
  </PageShell>;
}
