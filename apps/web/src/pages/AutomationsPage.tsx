import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  AUTOMATION_TEMPLATES,
  PROMPTS,
  type Automation,
  type AutomationTemplate,
  type AutomationTrigger,
  type WorkflowMeta,
} from '@ado/shared';
import { Button, Card, Chip, Icon, StatusDot, cx, type Tone } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { timeAgo } from '../lib/time';
import { fetchWorkflows } from '../lib/workflows';
import { deleteAutomation, fetchAutomations, runAutomation, saveAutomation } from '../lib/automations';

type TriggerKind = AutomationTrigger['on'];
type SourceTab = 'template' | 'prompt' | 'workflow' | 'custom';
type Src = { kind: 'prompt' | 'workflow' | 'custom'; ref?: string };

function triggerLabel(t: AutomationTrigger): string {
  if (t.on === 'manual') return 'On command';
  if (t.on === 'schedule') return t.every === 'hour' ? 'Hourly' : t.every === 'day' ? 'Daily' : 'Weekly';
  return t.event === 'build.failed' ? 'On CI failure' : 'On CI success';
}
const triggerTone = (t: AutomationTrigger): Tone => (t.on === 'event' ? 'warning' : t.on === 'schedule' ? 'info' : 'muted');

const AFFINITY: Record<string, string[]> = { game: ['game', 'steam'], app: ['app', 'mobile'], web: ['web', 'app'], api: ['app'], library: [], service: [] };
function relevance(repoCat: string | undefined, tpl: AutomationTemplate): number {
  if (repoCat && (tpl.category === repoCat || AFFINITY[repoCat]?.includes(tpl.category))) return 3;
  if (tpl.category === 'general') return 2;
  return 1;
}

/** Turn a workflow recipe into a single-agent task (the full multi-agent version runs in Claude Code). */
function workflowTask(w: WorkflowMeta): string {
  const phases = w.phases.map((p, i) => `${i + 1}. ${p.title}${p.detail ? ` — ${p.detail}` : ''}`).join('\n');
  return (
    `Follow the "${w.name}" workflow recipe on this repository.\n` +
    `Goal: ${w.description}\n` +
    (phases ? `Work through these phases in order:\n${phases}\n` : '') +
    (w.whenToUse ? `Context: ${w.whenToUse}\n` : '') +
    `Do real, verified work and report findings honestly — do not fabricate.`
  );
}

function AutomationForm({
  repos,
  workflows,
  initial,
  presetRepoId,
  onSaved,
  onCancel,
}: {
  repos: { id: string; name: string; category: string }[];
  workflows: WorkflowMeta[];
  initial?: Automation;
  presetRepoId?: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [repoId, setRepoId] = useState(initial?.repoId ?? presetRepoId ?? repos[0]?.id ?? '');
  const [name, setName] = useState(initial?.name ?? '');
  const [task, setTask] = useState(initial?.task ?? '');
  const [kind, setKind] = useState<TriggerKind>(initial?.trigger.on ?? 'manual');
  const [every, setEvery] = useState<'hour' | 'day' | 'week'>(initial?.trigger.on === 'schedule' ? initial.trigger.every : 'day');
  const [event, setEvent] = useState<'build.failed' | 'build.success'>(initial?.trigger.on === 'event' ? initial.trigger.event : 'build.failed');
  const [tab, setTab] = useState<SourceTab>(initial ? 'custom' : 'template');
  const [source, setSource] = useState<Src>(initial?.source ?? { kind: 'custom' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const repoCat = repos.find((r) => r.id === repoId)?.category;
  const templates = useMemo(() => [...AUTOMATION_TEMPLATES].sort((a, b) => relevance(repoCat, b) - relevance(repoCat, a)), [repoCat]);

  const applyTemplate = (t: AutomationTemplate) => {
    setName(t.name);
    setTask(t.task);
    setKind(t.suggestedTrigger.on);
    if (t.suggestedTrigger.on === 'schedule') setEvery(t.suggestedTrigger.every);
    if (t.suggestedTrigger.on === 'event') setEvent(t.suggestedTrigger.event);
    setSource({ kind: 'prompt', ref: t.id });
  };
  const applyPrompt = (id: string) => {
    const p = PROMPTS.find((x) => x.id === id);
    if (!p) return;
    setName(p.title);
    setTask(p.body);
    setSource({ kind: 'prompt', ref: p.id });
  };
  const applyWorkflow = (fileName: string) => {
    const w = workflows.find((x) => x.file === fileName);
    if (!w) return;
    setName(`${w.name} (recipe)`);
    setTask(workflowTask(w));
    setSource({ kind: 'workflow', ref: w.name });
  };

  const save = async () => {
    if (!repoId || !name.trim() || !task.trim()) {
      setErr('Pick a repo, a name, and a task.');
      return;
    }
    const trigger: AutomationTrigger =
      kind === 'schedule' ? { on: 'schedule', every } : kind === 'event' ? { on: 'event', event } : { on: 'manual' };
    setBusy(true);
    setErr(null);
    try {
      await saveAutomation({ id: initial?.id, repoId, name: name.trim(), task: task.trim(), trigger, enabled: initial?.enabled ?? true, source });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-9 rounded-tile border bg-card px-3 text-body text-text1 focus:border-primary/50 focus:outline-none';
  const tabBtn = (t: SourceTab, label: string) => (
    <button
      key={t}
      type="button"
      onClick={() => setTab(t)}
      className={cx('rounded-tile px-3 py-1.5 text-label transition-colors duration-150 ease-soft', tab === t ? 'bg-primary/15 font-medium text-text1' : 'text-text2 hover:bg-elevated hover:text-text1')}
    >
      {label}
    </button>
  );

  return (
    <Card className="flex flex-col gap-4 border-primary/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-section font-semibold text-text1">{initial ? 'Edit automation' : 'New automation'}</h2>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>

      {/* Source picker — start from a curated template, a Prompt Library entry, a workflow recipe, or blank */}
      <div>
        <div className="mb-2 flex flex-wrap gap-1">
          {tabBtn('template', 'Templates')}
          {tabBtn('prompt', 'Prompt Library')}
          {tabBtn('workflow', 'Workflows')}
          {tabBtn('custom', 'Custom')}
        </div>
        {tab === 'template' ? (
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTemplate(t)}
                title={t.blurb}
                className={cx('rounded-full border px-2.5 py-1 text-label transition-colors duration-150 ease-soft', source.ref === t.id ? 'border-primary bg-primary/15 text-text1' : 'bg-card text-text2 hover:border-hover hover:text-text1')}
              >
                {t.name}
              </button>
            ))}
          </div>
        ) : null}
        {tab === 'prompt' ? (
          <select className={cx(field, 'w-full')} defaultValue="" onChange={(e) => applyPrompt(e.target.value)} aria-label="Prompt">
            <option value="" disabled>Pick a prompt from the library…</option>
            {PROMPTS.map((p) => (
              <option key={p.id} value={p.id}>{p.category} · {p.title}</option>
            ))}
          </select>
        ) : null}
        {tab === 'workflow' ? (
          workflows.length ? (
            <>
              <select className={cx(field, 'w-full')} defaultValue="" onChange={(e) => applyWorkflow(e.target.value)} aria-label="Workflow">
                <option value="" disabled>Pick a workflow recipe…</option>
                {workflows.map((w) => (
                  <option key={w.file} value={w.file}>{w.name} — {w.phases.length} phase{w.phases.length === 1 ? '' : 's'}</option>
                ))}
              </select>
              <p className="mt-1 text-label text-text3">Runs as one headless agent following the recipe. The full multi-agent version runs in Claude Code (<span className="font-mono">use a workflow: …</span>).</p>
            </>
          ) : (
            <p className="text-label text-text3">No workflow recipes found.</p>
          )
        ) : null}
        {tab === 'custom' ? <p className="text-label text-text3">Write your own task below.</p> : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label text-text3">Repository</span>
          <select value={repoId} onChange={(e) => setRepoId(e.target.value)} className={field} aria-label="Repository">
            {repos.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-label text-text3">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nightly bug-hunt" className={field} aria-label="Name" />
        </label>
      </div>

      <label className="flex flex-col gap-1">
        <span className="text-label text-text3">Task (the prompt the agent runs — edit freely)</span>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={5}
          placeholder="Describe exactly what the agent should do in this repo…"
          className="rounded-tile border bg-card p-3 font-mono text-label text-text1 focus:border-primary/50 focus:outline-none"
          aria-label="Task"
        />
      </label>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-label text-text3">Trigger</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as TriggerKind)} className={field} aria-label="Trigger">
            <option value="manual">On command</option>
            <option value="schedule">On a schedule</option>
            <option value="event">On a CI event</option>
          </select>
        </label>
        {kind === 'schedule' ? (
          <label className="flex flex-col gap-1">
            <span className="text-label text-text3">Every</span>
            <select value={every} onChange={(e) => setEvery(e.target.value as 'hour' | 'day' | 'week')} className={field} aria-label="Interval">
              <option value="hour">Hour</option>
              <option value="day">Day</option>
              <option value="week">Week</option>
            </select>
          </label>
        ) : null}
        {kind === 'event' ? (
          <label className="flex flex-col gap-1">
            <span className="text-label text-text3">When</span>
            <select value={event} onChange={(e) => setEvent(e.target.value as 'build.failed' | 'build.success')} className={field} aria-label="Event">
              <option value="build.failed">A build fails</option>
              <option value="build.success">A build succeeds</option>
            </select>
          </label>
        ) : null}
        <div className="flex-1" />
        <Button size="sm" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Save automation'}</Button>
      </div>
      {err ? <p className="text-label text-danger">{err}</p> : null}
    </Card>
  );
}

function AutomationRow({ a, onChanged, onEdit }: { a: Automation; onChanged: () => void; onEdit: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex items-center gap-3 px-3 py-3">
      <StatusDot tone={a.enabled ? 'success' : 'muted'} label="" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-body font-medium text-text1">{a.name}</p>
          <Chip size="sm" tone={triggerTone(a.trigger)}>{triggerLabel(a.trigger)}</Chip>
          {a.source?.kind === 'workflow' ? <Chip size="sm">workflow</Chip> : null}
          {!a.enabled ? <Chip size="sm" tone="muted">paused</Chip> : null}
        </div>
        <p className="truncate text-label text-text3">{a.task}</p>
        {msg ? <p className={cx('text-label', msg.startsWith('run-') ? 'text-success' : 'text-danger')}>{msg.startsWith('run-') ? `dispatched ${msg}` : msg}</p> : null}
      </div>
      <span className="w-20 shrink-0 text-right text-label tabular-nums text-text3">{a.lastRunTs ? timeAgo(a.lastRunTs) : 'not run yet'}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => { const { runId } = await runAutomation(a.id); setMsg(runId); })}>Run now</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onEdit}>Edit</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(async () => { await saveAutomation({ ...a, enabled: !a.enabled }); onChanged(); })}>{a.enabled ? 'Pause' : 'Enable'}</Button>
        <button type="button" aria-label={`Delete ${a.name}`} disabled={busy} onClick={() => void act(async () => { await deleteAutomation(a.id); onChanged(); })} className="flex h-8 w-8 items-center justify-center rounded-tile text-text3 transition-colors duration-150 ease-soft hover:bg-elevated hover:text-danger">
          <Icon name="dots" size={14} />
        </button>
      </div>
    </div>
  );
}

export function AutomationsPage() {
  const state = useBus((s) => s.state);
  const repos = useMemo(() => Object.values(state.repos).map((r) => ({ id: r.id, name: r.name, category: r.category })), [state.repos]);
  const repoName = (id: string) => state.repos[id]?.name ?? id;

  const [params, setParams] = useSearchParams();
  const repoFilter = params.get('repo');
  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<{ initial?: Automation } | null>(null);

  const refresh = () => {
    fetchAutomations()
      .then((list) => { setAutomations(list); setError(null); })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(() => {
    refresh();
    fetchWorkflows().then(setWorkflows).catch(() => setWorkflows([]));
  }, []);
  // Deep link from a repo card: ?new=1 opens the form (preselecting ?repo).
  useEffect(() => {
    if (params.get('new') === '1' && repos.length > 0) {
      setForm({});
      params.delete('new');
      setParams(params, { replace: true });
    }
  }, [params, repos.length, setParams]);

  const shown = useMemo(
    () => (automations ?? []).filter((a) => !repoFilter || a.repoId === repoFilter),
    [automations, repoFilter],
  );
  const byRepo = useMemo(() => {
    const map = new Map<string, Automation[]>();
    for (const a of shown) {
      const arr = map.get(a.repoId) ?? [];
      arr.push(a);
      map.set(a.repoId, arr);
    }
    return map;
  }, [shown]);

  const clearFilter = () => { params.delete('repo'); setParams(params, { replace: true }); };

  return (
    <PageShell
      title="Automations"
      subtitle="Bind a prompt, a Prompt-Library entry, or a workflow recipe to any repo and run it on command, on a schedule, or when a CI build passes/fails. Every run is a real dispatched agent in that repo — nothing fabricated."
      actions={
        <Button size="sm" onClick={() => setForm(form ? null : {})} disabled={repos.length === 0}>
          <Icon name="plus" size={14} /> New automation
        </Button>
      }
    >
      {repoFilter && state.repos[repoFilter] ? (
        <div className="mt-4 flex items-center gap-2">
          <Chip tone="info">Showing: {repoName(repoFilter)}</Chip>
          <button type="button" onClick={clearFilter} className="text-label text-primary hover:text-text1">Show all repos</button>
        </div>
      ) : null}

      {error ? (
        <Card className="mt-6 border-danger/25 bg-danger/10 p-4 text-body text-danger">
          Couldn’t reach the server ({error}). Start it and set <span className="font-mono">VITE_ACC_TOKEN</span> in <span className="font-mono">.env</span>.
        </Card>
      ) : null}

      {repos.length === 0 && !error ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-body text-text2">No repositories to automate yet</p>
          <p className="mt-1 text-label text-text3">
            Point <span className="font-mono">PROJECT_DIRS</span> at your code on the <Link to="/setup" className="text-primary hover:text-text1">Setup page</Link> — scanned repos show up here.
          </p>
        </Card>
      ) : null}

      {form ? (
        <div className="mt-6">
          <AutomationForm
            repos={repos}
            workflows={workflows}
            initial={form.initial}
            presetRepoId={repoFilter ?? undefined}
            onSaved={() => { setForm(null); refresh(); }}
            onCancel={() => setForm(null)}
          />
        </div>
      ) : null}

      {automations === null && !error ? <p className="mt-6 text-body text-text3">Loading automations…</p> : null}

      {automations && shown.length === 0 && repos.length > 0 && !form ? (
        <Card className="mt-6 p-8 text-center">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3"><Icon name="workflow" size={16} /></span>
          <p className="mt-2 text-body text-text2">{repoFilter ? `No automations for ${repoName(repoFilter)} yet` : 'No automations yet'}</p>
          <p className="mt-1 text-label text-text3">Click “New automation”, pick a template, prompt, or workflow, and choose when it runs.</p>
        </Card>
      ) : null}

      <div className="mt-6 flex flex-col gap-6">
        {[...byRepo.entries()].map(([repoId, list]) => (
          <section key={repoId}>
            <div className="mb-2 flex items-center gap-2">
              <Icon name="repos" size={14} className="text-text3" />
              <h2 className="text-section font-semibold text-text1">{repoName(repoId)}</h2>
              <span className="text-label text-text3">{list.length} automation{list.length === 1 ? '' : 's'}</span>
            </div>
            <Card className="flex flex-col divide-y divide-white/[0.05] p-2">
              {list.map((a) => (
                <AutomationRow key={a.id} a={a} onChanged={refresh} onEdit={() => setForm({ initial: a })} />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
