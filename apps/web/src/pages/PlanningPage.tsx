import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type { ContextExecutionBinding, PlanningMilestone, PlanningSnapshot, PlanningTask, PortfolioSnapshot } from '@ado/shared';
import { PageShell } from '../chrome/PageShell';
import { Button, Card } from '../kit';
import { fetchPortfolio } from '../lib/portfolio';
import { fetchPlanning, planningRequest } from '../lib/planning';
import { TaskCriterionReview } from './TaskCriterionReview';
import { TaskReopeningPanel } from './TaskReopeningPanel';
import { ContextPackagePanel } from './ContextPackagePanel';

const field = 'mt-1 w-full min-w-0 rounded-tile border bg-card px-3 py-2 text-body text-text1';
const emptyTask = { projectId: '', repositoryId: '', milestoneId: '', title: '', outcome: '', scope: '', outOfScope: '', acceptance: '', dependsOn: [] as string[], priority: 0, status: 'draft', sourceRefs: '' };
const emptyMilestone = { projectId: '', title: '', exitCriteria: '', status: 'planned' };
const taskLabels = { outcome: 'Expected outcome', scope: 'In scope', outOfScope: 'Out of scope', acceptance: 'Acceptance criteria (one per line; new criteria required)', sourceRefs: 'GitHub issue links (one per line; reference only)' };
const lines = (text: string) => text.split('\n').map((s) => s.trim()).filter(Boolean);
const criteria = (text: string, previous: PlanningTask['acceptance'] = []) => {
  const remaining = [...previous];
  return lines(text).map((text) => {
    const index = remaining.findIndex((criterion) => criterion.text === text);
    return index < 0 ? { id: crypto.randomUUID(), text, required: true } : remaining.splice(index, 1)[0];
  });
};

export function PlanningPage() {
  const [data, setData] = useState<PlanningSnapshot | null>(null);
  const [portfolio, setPortfolio] = useState<PortfolioSnapshot | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const [idea, setIdea] = useState(''), [ideaProject, setIdeaProject] = useState('');
  const [capture, setCapture] = useState<{ idempotencyKey: string; text: string; projectId: string | null } | null>(null);
  const [promotion, setPromotion] = useState<{ id: string; version: number; projectId: string; title: string } | null>(null);
  const [task, setTask] = useState(emptyTask), [editing, setEditing] = useState<PlanningTask | null>(null);
  const [milestone, setMilestone] = useState(emptyMilestone), [editingMilestone, setEditingMilestone] = useState<PlanningMilestone | null>(null);
  const [filter, setFilter] = useState('');
  const [criterionReview, setCriterionReview] = useState<{ taskId: string; runId: string } | null>(null);
  const [reopening, setReopening] = useState<{ task: PlanningTask; runId: string } | null>(null);
  const [runReview, setRunReview] = useState<{ task: PlanningTask; checkoutId: string; provider: string; contextPackage?: ContextExecutionBinding; contextReady?: boolean; submission: { version: number; checkoutId: string; baseSha: string; provider: string; idempotencyKey: string; contextPackage?: ContextExecutionBinding } | null } | null>(null);
  const taskTitle = useRef<HTMLInputElement>(null), promotionTitle = useRef<HTMLInputElement>(null), milestoneTitle = useRef<HTMLInputElement>(null);
  const runReviewTitle = useRef<HTMLHeadingElement>(null);
  useEffect(() => { if (runReview) runReviewTitle.current?.focus(); }, [runReview?.task.id]);
  useEffect(() => { if (editing) taskTitle.current?.focus(); }, [editing]);
  useEffect(() => { if (promotion) promotionTitle.current?.focus(); }, [promotion?.id]);
  useEffect(() => { if (editingMilestone) milestoneTitle.current?.focus(); }, [editingMilestone]);
  const load = async () => { const [next, projects] = await Promise.all([fetchPlanning(), fetchPortfolio()]); setData(next); setPortfolio(projects); };
  useEffect(() => { void load().catch((e: Error) => setError(e.message)); }, []);
  useEffect(() => {
    if (!data?.executions.some((run) => run.state === 'queued' || run.state === 'running')) return;
    const timer = setTimeout(() => { void fetchPlanning().then(setData).catch((e: Error) => setError(`Run status refresh failed: ${e.message}`)); }, 1500);
    return () => clearTimeout(timer);
  }, [data]);
  const act = async (work: () => Promise<unknown>, success: string) => {
    setBusy(true); setError(''); setMessage('');
    try { await work(); await load(); setMessage(success); }
    catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  };
  const projects = portfolio?.projects ?? [];
  const projectOptions = projects.map((p) => <option key={p.id} value={p.id}>{p.name} · {p.id.slice(0, 8)}</option>);
  const projectName = (id: string) => projects.find((p) => p.id === id)?.name ?? id;
  const editTask = (t: PlanningTask) => {
    setEditing(t); setTask({ projectId: t.projectId, repositoryId: t.repositoryId ?? '', milestoneId: t.milestoneId ?? '', title: t.title, outcome: t.outcome, scope: t.scope, outOfScope: t.outOfScope, priority: t.priority, status: t.status, dependsOn: t.dependsOn, acceptance: t.acceptance.map((c) => c.text).join('\n'), sourceRefs: t.sourceRefs.join('\n') });
  };
  return <PageShell title="Tasks & Inbox" subtitle="Capture ideas, define outcomes and review explicitly started runs.">
    <div className="mt-5 min-w-0 space-y-5">
      <Link to="/today" className="block text-body text-primary">Choose a next step in Today →</Link>
      <div className="flex flex-wrap items-center gap-3"><Link className="text-body text-primary" to="/projects">Manage projects</Link><Button variant="outline" disabled={busy} onClick={() => void act(async () => { setEditing(null); setTask(emptyTask); setEditingMilestone(null); setMilestone(emptyMilestone); setPromotion(null); }, 'Planning reloaded.')}>Reload planning</Button></div>
      {error && <p role="alert" className="break-words text-body text-danger">{error}</p>}
      {message && <p role="status" className="text-body text-text2">{message}</p>}
      {reopening && <TaskReopeningPanel key={`${reopening.runId}:${reopening.task.version}`} task={reopening.task} runId={reopening.runId} onClose={() => setReopening(null)} onComplete={async (next) => { await load(); setReopening(null); if (next.status === 'draft') editTask(next); setMessage('Revision request recorded. Review and save the current task before starting another run.'); }} />}
      {criterionReview && data?.tasks.find((t) => t.id === criterionReview.taskId && t.status === 'awaiting_review') && <TaskCriterionReview key={criterionReview.runId} task={data.tasks.find((t) => t.id === criterionReview.taskId)!} runId={criterionReview.runId} onChanged={load} onClose={() => setCriterionReview(null)} />}
      {runReview && <Card role="region" aria-label="Review task run" className="min-w-0 break-words p-4">
        <h2 ref={runReviewTitle} tabIndex={-1} className="scroll-mt-48 text-title font-semibold">Review task run</h2>
        <p className="mt-2 text-body">{runReview.task.title} · task version {runReview.task.version}</p>
        <p className="mt-2 whitespace-pre-wrap text-body">{runReview.task.outcome}</p>
        <p className="mt-2 text-body text-text2">Trusted local execution in a separate Git repository from the reviewed commit. Uncommitted source changes are excluded and preserved. This is not an OS sandbox. A successful process leaves the task awaiting review.</p>
        <form id="task-run-form" className="mt-3 space-y-3" onSubmit={(event) => {
          event.preventDefault();
          if (busy || runReview.contextReady === false) return;
          const checkout = portfolio?.checkouts.find((c) => c.id === runReview.checkoutId);
          if (!checkout?.headSha) return;
          const submission = runReview.submission ?? { version: runReview.task.version, checkoutId: checkout.id, baseSha: checkout.headSha, provider: runReview.provider, idempotencyKey: crypto.randomUUID(), ...(runReview.contextPackage ? { contextPackage: runReview.contextPackage } : {}) };
          setRunReview({ ...runReview, submission });
          void act(async () => { await planningRequest(`/tasks/${runReview.task.id}/dispatch`, 'POST', submission); setRunReview(null); }, 'Run accepted. Task acceptance requires separate criterion review.');
        }}>
          <label className="block text-body">Run checkout<select aria-label="Run checkout" required disabled={Boolean(runReview.submission)} className={field} value={runReview.checkoutId} onChange={(e) => setRunReview({ ...runReview, checkoutId: e.target.value, contextPackage: undefined, contextReady: true })}><option value="">Select a committed working copy</option>{portfolio?.checkouts.filter((c) => c.repositoryId === runReview.task.repositoryId && c.headSha).map((c) => <option key={c.id} value={c.id}>{c.canonicalPath} · {c.headSha!.slice(0, 12)}</option>)}</select></label>
          <p className="break-all text-label text-text2">Reviewed base: {runReview.submission?.baseSha ?? portfolio?.checkouts.find((c) => c.id === runReview.checkoutId)?.headSha ?? 'Select a checkout'}</p>
          <label className="block text-body">Run provider<select aria-label="Run provider" required disabled={Boolean(runReview.submission)} className={field} value={runReview.provider} onChange={(e) => setRunReview({ ...runReview, provider: e.target.value })}><option value="">Choose provider</option><option value="claude">Claude</option><option value="codex">Codex (experimental, ChatGPT login)</option></select></label>
        </form>
        {portfolio?.checkouts.find(c => c.id === runReview.checkoutId)?.headSha && <ContextPackagePanel
          key={`${runReview.task.id}:${runReview.task.version}:${runReview.checkoutId}:${portfolio.checkouts.find(c => c.id === runReview.checkoutId)!.headSha}`}
          task={runReview.task} checkoutId={runReview.checkoutId} baseSha={portfolio.checkouts.find(c => c.id === runReview.checkoutId)!.headSha!}
          selected={runReview.contextPackage} disabled={busy || Boolean(runReview.submission)}
          onSelect={binding => setRunReview(current => current && ({ ...current, contextPackage: binding, contextReady: !binding }))}
          onReady={ready => setRunReview(current => !current || current.contextReady === ready ? current : { ...current, contextReady: ready })}
        />}
        {runReview.contextPackage && runReview.contextReady === false && <p role="status" className="my-3 text-body text-text2">The selected package is not ready. Reload and review it, or explicitly choose no reference package.</p>}
        <div className="mt-3 flex flex-wrap gap-2"><Button type="submit" form="task-run-form" disabled={busy || runReview.contextReady === false}>{runReview.submission ? 'Retry same run request' : 'Start reviewed run'}</Button><Button variant="outline" disabled={busy} onClick={() => setRunReview(null)}>Cancel run review</Button></div>
      </Card>}
      <Card className="p-4">
        <h2 className="text-title font-semibold">Inbox</h2>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); const request = capture ?? { idempotencyKey: crypto.randomUUID(), text: idea, projectId: ideaProject || null }; setCapture(request); void act(async () => { await planningRequest('/inbox', 'POST', request); setCapture(null); setIdea(''); }, 'Idea saved on this host.'); }}>
          <label className="block text-body">Idea<textarea aria-label="Idea" required maxLength={16000} rows={3} className={field} value={idea} disabled={Boolean(capture)} onChange={(e) => setIdea(e.target.value)} /></label>
          <label className="block text-body">Optional project<select aria-label="Optional project" className={field} value={ideaProject} disabled={Boolean(capture)} onChange={(e) => setIdeaProject(e.target.value)}><option value="">Unsorted</option>{projectOptions}</select></label>
          <Button type="submit" disabled={busy}>{capture ? 'Retry same capture' : 'Save idea'}</Button>
          {capture && <p className="text-body text-text2">Awaiting confirmation. Retrying sends the same capture key and content.</p>}
        </form>
        {data?.inbox.filter((i) => i.status === 'captured').map((item) => <div className="mt-4 min-w-0 break-words border-t pt-3" key={item.id}>
          <p className="whitespace-pre-wrap text-body">{item.text}</p><p className="text-label text-text2">{item.projectId ? projectName(item.projectId) : 'Unsorted'} · {new Date(item.createdTs).toLocaleString()}</p>
          <div className="mt-2 flex flex-wrap gap-2"><Button disabled={busy} variant="outline" size="sm" onClick={() => setPromotion({ id: item.id, version: item.version, projectId: item.projectId ?? '', title: item.text.slice(0, 200) })}>Convert to task</Button><Button disabled={busy} variant="outline" size="sm" onClick={() => void act(() => planningRequest(`/inbox/${item.id}/archive`, 'POST', { version: item.version }), 'Idea archived; history retained.')}>Archive idea</Button></div>
        </div>)}
        {data && !data.inbox.some((i) => i.status === 'captured') && <p className="mt-3 text-body text-text2">No unsorted ideas.</p>}
        {promotion && <form className="mt-4 space-y-3 border-t pt-3" onSubmit={(e) => { e.preventDefault(); void act(async () => { const { id, ...body } = promotion; await planningRequest(`/inbox/${id}/promote`, 'POST', body); setPromotion(null); }, 'Idea converted to a draft task.'); }}>
          <label className="block text-body">Task title from idea<input ref={promotionTitle} required maxLength={200} className={field} value={promotion.title} onChange={(e) => setPromotion({ ...promotion, title: e.target.value })} /></label>
          <label className="block text-body">Project for idea<select aria-label="Project for idea" required className={field} value={promotion.projectId} onChange={(e) => setPromotion({ ...promotion, projectId: e.target.value })}><option value="">Select project</option>{projectOptions}</select></label>
          <div className="flex flex-wrap gap-2"><Button type="submit" disabled={busy}>Create draft from idea</Button><Button variant="outline" onClick={() => setPromotion(null)}>Cancel conversion</Button></div>
        </form>}
      </Card>
      <Card className="p-4">
        <h2 className="text-title font-semibold">{editing ? 'Edit task' : 'Define a task'}</h2>
        <p className="mt-1 text-body text-text2">Ready describes the plan. Execution and acceptance require separate checks.</p>
        <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void act(async () => {
          await planningRequest(editing ? `/tasks/${editing.id}` : '/tasks', editing ? 'PUT' : 'POST', { ...task, repositoryId: task.repositoryId || null, milestoneId: task.milestoneId || null, acceptance: criteria(task.acceptance, editing?.acceptance), sourceRefs: lines(task.sourceRefs), ...(editing ? { version: editing.version } : {}) });
          setEditing(null); setTask(emptyTask);
        }, 'Task saved.'); }}>
          <label className="text-body">Task title<input ref={taskTitle} required maxLength={200} className={field} value={task.title} onChange={(e) => setTask({ ...task, title: e.target.value })} /></label>
          <label className="text-body">Task project<select aria-label="Task project" required disabled={Boolean(editing)} className={field} value={task.projectId} onChange={(e) => setTask({ ...task, projectId: e.target.value, repositoryId: '', milestoneId: '' })}><option value="">Select project</option>{projectOptions}</select></label>
          <label className="text-body">Repository<select aria-label="Repository" className={field} value={task.repositoryId} onChange={(e) => setTask({ ...task, repositoryId: e.target.value })}><option value="">No repository assigned</option>{portfolio?.repositories.filter((r) => r.projectId === task.projectId).map((r) => <option key={r.id} value={r.id}>{r.name} · {r.id.slice(0, 8)}</option>)}</select></label>
          <label className="text-body">Milestone<select aria-label="Milestone" className={field} value={task.milestoneId} onChange={(e) => setTask({ ...task, milestoneId: e.target.value })}><option value="">No milestone</option>{data?.milestones.filter((m) => m.projectId === task.projectId).map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
          {(['outcome', 'scope', 'outOfScope', 'acceptance', 'sourceRefs'] as const).map((key) => <label className="text-body sm:col-span-2" key={key}>{taskLabels[key]}<textarea aria-label={taskLabels[key]} rows={2} maxLength={16000} className={field} value={task[key]} onChange={(e) => setTask({ ...task, [key]: e.target.value })} /></label>)}
          <label className="text-body">Task priority (0–5)<input type="number" min={0} max={5} className={field} value={task.priority} onChange={(e) => setTask({ ...task, priority: Number(e.target.value) })} /></label>
          <label className="text-body">Planning status<select aria-label="Planning status" className={field} value={task.status} onChange={(e) => setTask({ ...task, status: e.target.value })}>{['draft', 'ready', 'blocked', 'archived'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <fieldset className="min-w-0 sm:col-span-2"><legend className="text-body">Depends on</legend><div className="max-h-48 space-y-2 overflow-y-auto py-2">{data?.tasks.filter((t) => t.id !== editing?.id).map((t) => <label key={t.id} className="block break-words text-body"><input type="checkbox" checked={task.dependsOn.includes(t.id)} onChange={(e) => setTask({ ...task, dependsOn: e.target.checked ? [...task.dependsOn, t.id] : task.dependsOn.filter((id) => id !== t.id) })} /> {t.title} · {projectName(t.projectId)} · {t.status}</label>)}</div></fieldset>
          <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="submit" disabled={busy}>{editing ? 'Save task' : 'Create task'}</Button>{editing && <Button variant="outline" onClick={() => { setEditing(null); setTask(emptyTask); }}>Cancel task edit</Button>}</div>
        </form>
      </Card>
      <section aria-label="Task list" className="space-y-3">
        <h2 className="text-title font-semibold">Tasks</h2>
        <label className="block text-body">Filter by project<select aria-label="Filter by project" className={field} value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All projects</option>{projectOptions}</select></label>
        {data?.tasks.filter((t) => !filter || t.projectId === filter).map((t) => <Card className="min-w-0 break-words p-4" key={t.id}>
          <h3 className="text-title font-semibold">{t.title}</h3><p className="text-body text-text2">{projectName(t.projectId)} · {t.status.replaceAll('_', ' ')} · priority {t.priority} · version {t.version}</p>
          <p className="mt-2 whitespace-pre-wrap text-body">{t.outcome || 'Outcome not defined.'}</p>
          {t.blockedBy.length > 0 && <p className="mt-2 text-body text-warn">Unresolved dependencies: {t.blockedBy.map((id) => data.tasks.find((dependency) => dependency.id === id)?.title ?? id).join(', ')}</p>}
          <details className="mt-2 text-body"><summary>Scope and acceptance</summary><p className="mt-2 whitespace-pre-wrap">In scope: {t.scope || 'Not defined'}</p><p className="whitespace-pre-wrap">Out of scope: {t.outOfScope || 'Not defined'}</p><ul className="ml-5 list-disc">{t.acceptance.map((c) => <li key={c.id}>{c.text} ({c.required ? 'required' : 'optional'}; {data.reviews.some((r) => r.taskId === t.id) ? 'see review history' : 'no review recorded'})</li>)}</ul>{t.sourceRefs.map((url) => <a key={url} href={url} target="_blank" rel="noreferrer" className="mt-2 block break-all text-primary">{url}</a>)}</details>
          <Button disabled={busy || !['draft', 'ready', 'blocked', 'archived'].includes(t.status)} variant="outline" size="sm" className="mt-3" onClick={() => editTask(t)}>Edit {t.title}</Button>
          {t.status === 'ready' && <Button aria-label={`Review run for ${t.title}`} disabled={busy || t.blockedBy.length > 0 || !t.repositoryId || !portfolio?.checkouts.some((c) => c.repositoryId === t.repositoryId && c.headSha)} variant="outline" size="sm" className="ml-2 mt-3" onClick={() => setRunReview({ task: t, checkoutId: '', provider: '', submission: null })}>Review run</Button>}
          {data.executions.filter((run) => run.taskId === t.id).map((run) => <div key={run.runId} className="mt-2 text-body"><Link className="text-primary" to={`/agents?run=${encodeURIComponent(run.runId)}`}>Run for task version {run.taskVersion}: {run.state === 'done' ? 'process succeeded' : run.state}</Link>{run.state === 'done' && t.status === 'awaiting_review' ? ' · Criterion review required.' : ''}{t.status === 'awaiting_review' && run.state === 'done' && run.currentTaskVersion === t.version && <Button size="sm" variant="outline" className="ml-2 mt-2" aria-label={`Review criteria for ${t.title}`} onClick={() => { setReopening(null); setCriterionReview({ taskId: t.id, runId: run.runId }); }}>Review criteria</Button>}</div>)}
          {t.status === 'accepted' && <div className="mt-3 text-body"><p>Acceptance recorded for the reviewed result. Recheck current files before relying on it.</p><Button disabled={busy} variant="outline" size="sm" onClick={() => void act(() => planningRequest(`/tasks/${t.id}/recheck`, 'POST', {}), 'Current result checked; see task status and review history.')}>Recheck accepted result</Button></div>}
          {['awaiting_review', 'accepted', 'blocked'].includes(t.status) && data.executions.filter((r) => r.taskId === t.id && r.currentTaskVersion === t.version && ['done', 'failed'].includes(r.state)).map((r) => <Button key={r.runId} disabled={busy} variant="outline" size="sm" className="mt-3" aria-label={`Revise task ${t.title}`} onClick={() => { setCriterionReview(null); setReopening({ task: t, runId: r.runId }); }}>Revise task</Button>)}
          {data.reopenings.some((r) => r.taskId === t.id) && <details className="mt-3 text-body"><summary>Revision requests</summary>{data.reopenings.filter((r) => r.taskId === t.id).map((r) => <div key={r.id} className="mt-2 border-t pt-2"><p>Version {r.fromVersion} → draft {r.toVersion} · {new Date(r.recordedTs).toLocaleString()}</p><p className="whitespace-pre-wrap">{r.reason}</p><Link to={`/agents?run=${encodeURIComponent(r.runId)}`} className="text-primary">Previous attempt</Link></div>)}</details>}
          {data.reviews.some((r) => r.taskId === t.id) && <details className="mt-3 text-body"><summary>Criterion review history</summary>{data.reviews.filter((r) => r.taskId === t.id).map((r) => <div key={r.id} className="mt-2 border-t pt-2"><p>{r.invalidatedTs ? `Stale: ${r.invalidationReason}` : 'Acceptance recorded'} · {new Date(r.recordedTs).toLocaleString()}</p><p className="break-all text-label text-text2">Definition version {r.definitionVersion} · {r.headSha} · {r.diffDigest}</p>{r.criteria.map((c) => <p key={c.criterionId} className="mt-2 whitespace-pre-wrap">{r.definitionCriteria.find((a) => a.id === c.criterionId)?.text ?? t.acceptance.find((a) => a.id === c.criterionId)?.text ?? c.criterionId}: {c.verdict} — {c.evidence}</p>)}</div>)}</details>}
        </Card>)}
        {data && !data.tasks.some((t) => !filter || t.projectId === filter) && <p className="text-body text-text2">No tasks in this selection.</p>}
      </section>
      <Card className="p-4">
        <h2 className="text-title font-semibold">Milestones</h2>
        <form className="mt-3 space-y-3" onSubmit={(e) => { e.preventDefault(); void act(async () => { await planningRequest(editingMilestone ? `/milestones/${editingMilestone.id}` : '/milestones', editingMilestone ? 'PUT' : 'POST', { ...milestone, exitCriteria: criteria(milestone.exitCriteria, editingMilestone?.exitCriteria), ...(editingMilestone ? { version: editingMilestone.version } : {}) }); setMilestone(emptyMilestone); setEditingMilestone(null); }, 'Milestone saved.'); }}>
          <label className="block text-body">Milestone title<input ref={milestoneTitle} required maxLength={200} className={field} value={milestone.title} onChange={(e) => setMilestone({ ...milestone, title: e.target.value })} /></label>
          <label className="block text-body">Milestone project<select aria-label="Milestone project" required disabled={Boolean(editingMilestone)} className={field} value={milestone.projectId} onChange={(e) => setMilestone({ ...milestone, projectId: e.target.value })}><option value="">Select project</option>{projectOptions}</select></label>
          <label className="block text-body">Exit criteria (one per line; new criteria required)<textarea aria-label="Exit criteria (one per line; new criteria required)" rows={3} className={field} value={milestone.exitCriteria} onChange={(e) => setMilestone({ ...milestone, exitCriteria: e.target.value })} /></label>
          <label className="block text-body">Milestone status<select aria-label="Milestone status" className={field} value={milestone.status} onChange={(e) => setMilestone({ ...milestone, status: e.target.value })}>{['planned', 'active', 'archived'].map((s) => <option key={s}>{s}</option>)}</select></label>
          <div className="flex flex-wrap gap-2"><Button disabled={busy} type="submit">{editingMilestone ? 'Save milestone' : 'Create milestone'}</Button>{editingMilestone && <Button variant="outline" onClick={() => { setEditingMilestone(null); setMilestone(emptyMilestone); }}>Cancel milestone edit</Button>}</div>
        </form>
        {data?.milestones.map((m) => <div className="mt-4 min-w-0 break-words border-t pt-3" key={m.id}><h3 className="text-body font-semibold">{m.title}</h3><p className="text-body text-text2">{projectName(m.projectId)} · {m.status} · version {m.version}</p><ul className="ml-5 list-disc text-body">{m.exitCriteria.map((c) => <li key={c.id}>{c.text}</li>)}</ul><Button disabled={busy} variant="outline" size="sm" onClick={() => { setEditingMilestone(m); setMilestone({ projectId: m.projectId, title: m.title, status: m.status, exitCriteria: m.exitCriteria.map((c) => c.text).join('\n') }); }}>Edit milestone {m.title}</Button></div>)}
      </Card>
    </div>
  </PageShell>;
}
