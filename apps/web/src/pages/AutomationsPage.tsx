import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  AUTOMATION_TEMPLATES,
  type Automation,
  type AutomationTemplate,
  type AutomationTrigger,
} from '@ado/shared';
import { Button, Card, Chip, Icon, StatusDot, cx, type Tone } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { timeAgo } from '../lib/time';
import { deleteAutomation, fetchAutomations, runAutomation, saveAutomation } from '../lib/automations';

type TriggerKind = AutomationTrigger['on'];

function triggerLabel(t: AutomationTrigger): string {
  if (t.on === 'manual') return 'On command';
  if (t.on === 'schedule') return t.every === 'hour' ? 'Hourly' : t.every === 'day' ? 'Daily' : 'Weekly';
  return t.event === 'build.failed' ? 'On CI failure' : 'On CI success';
}
const triggerTone = (t: AutomationTrigger): Tone => (t.on === 'event' ? 'warning' : t.on === 'schedule' ? 'info' : 'muted');

// Order templates so the ones that fit the selected repo's kind come first.
const AFFINITY: Record<string, string[]> = { game: ['game', 'steam'], app: ['app', 'mobile'], web: ['web', 'app'], api: ['app'], library: [], service: [] };
function relevance(repoCat: string | undefined, tpl: AutomationTemplate): number {
  if (repoCat && (tpl.category === repoCat || AFFINITY[repoCat]?.includes(tpl.category))) return 3;
  if (tpl.category === 'general') return 2;
  return 1;
}

function AutomationForm({
  repos,
  onSaved,
  onCancel,
}: {
  repos: { id: string; name: string; category: string }[];
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [repoId, setRepoId] = useState(repos[0]?.id ?? '');
  const [name, setName] = useState('');
  const [task, setTask] = useState('');
  const [kind, setKind] = useState<TriggerKind>('manual');
  const [every, setEvery] = useState<'hour' | 'day' | 'week'>('day');
  const [event, setEvent] = useState<'build.failed' | 'build.success'>('build.failed');
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const repoCat = repos.find((r) => r.id === repoId)?.category;
  const templates = useMemo(
    () => [...AUTOMATION_TEMPLATES].sort((a, b) => relevance(repoCat, b) - relevance(repoCat, a)),
    [repoCat],
  );

  const applyTemplate = (t: AutomationTemplate) => {
    setTemplateId(t.id);
    setName(t.name);
    setTask(t.task);
    setKind(t.suggestedTrigger.on);
    if (t.suggestedTrigger.on === 'schedule') setEvery(t.suggestedTrigger.every);
    if (t.suggestedTrigger.on === 'event') setEvent(t.suggestedTrigger.event);
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
      await saveAutomation({
        repoId,
        name: name.trim(),
        task: task.trim(),
        trigger,
        enabled: true,
        source: templateId ? { kind: 'prompt', ref: templateId } : { kind: 'custom' },
      });
      onSaved();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const field = 'h-9 rounded-tile border bg-card px-3 text-body text-text1 focus:border-primary/50 focus:outline-none';

  return (
    <Card className="flex flex-col gap-4 border-primary/20 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-section font-semibold text-text1">New automation</h2>
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>

      {/* Templates — one-click standard prompts, most relevant to this repo first */}
      <div>
        <p className="mb-1.5 text-label text-text3">Start from a template (editable) or write your own:</p>
        <div className="flex flex-wrap gap-1.5">
          {templates.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => applyTemplate(t)}
              title={t.blurb}
              className={cx(
                'rounded-full border px-2.5 py-1 text-label transition-colors duration-150 ease-soft',
                templateId === t.id ? 'border-primary bg-primary/15 text-text1' : 'bg-card text-text2 hover:border-hover hover:text-text1',
              )}
            >
              {t.name}
            </button>
          ))}
        </div>
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
        <span className="text-label text-text3">Task (the prompt the agent runs)</span>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          rows={4}
          placeholder="Describe exactly what the agent should do in this repo…"
          className="rounded-tile border bg-card p-3 text-body text-text1 focus:border-primary/50 focus:outline-none"
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
        <Button size="sm" onClick={() => void save()} disabled={busy}>{busy ? 'Saving…' : 'Save automation'}</Button>
      </div>
      {err ? <p className="text-label text-danger">{err}</p> : null}
    </Card>
  );
}

function AutomationRow({ a, onChanged }: { a: Automation; onChanged: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const act = async (fn: () => Promise<void>, ok?: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      if (ok) setMsg(ok);
      else onChanged();
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
        <p className="truncate text-label text-text3">
          {a.task}
        </p>
        {msg ? <p className={cx('text-label', msg.startsWith('run-') ? 'text-success' : 'text-danger')}>{msg.startsWith('run-') ? `dispatched ${msg}` : msg}</p> : null}
      </div>
      <span className="w-16 shrink-0 text-right text-label tabular-nums text-text3">{a.lastRunTs ? timeAgo(a.lastRunTs) : 'never'}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void act(async () => { const { runId } = await runAutomation(a.id); setMsg(runId); }, undefined)}>
          Run now
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void act(async () => { await saveAutomation({ ...a, enabled: !a.enabled }); })}>
          {a.enabled ? 'Pause' : 'Enable'}
        </Button>
        <button type="button" aria-label={`Delete ${a.name}`} disabled={busy} onClick={() => void act(async () => { await deleteAutomation(a.id); })} className="flex h-8 w-8 items-center justify-center rounded-tile text-text3 transition-colors duration-150 ease-soft hover:bg-elevated hover:text-danger">
          <Icon name="dots" size={14} />
        </button>
      </div>
    </div>
  );
}

export function AutomationsPage() {
  const state = useBus((s) => s.state);
  const repos = useMemo(
    () => Object.values(state.repos).map((r) => ({ id: r.id, name: r.name, category: r.category })),
    [state.repos],
  );
  const repoName = (id: string) => state.repos[id]?.name ?? id;

  const [automations, setAutomations] = useState<Automation[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const refresh = () => {
    fetchAutomations()
      .then((list) => { setAutomations(list); setError(null); })
      .catch((e) => setError((e as Error).message));
  };
  useEffect(refresh, []);

  const byRepo = useMemo(() => {
    const map = new Map<string, Automation[]>();
    for (const a of automations ?? []) {
      const arr = map.get(a.repoId) ?? [];
      arr.push(a);
      map.set(a.repoId, arr);
    }
    return map;
  }, [automations]);

  return (
    <PageShell
      title="Automations"
      subtitle="Bind a prompt or recipe to any repo and run it on command, on a schedule, or when a CI build passes/fails. Every run is a real dispatched agent in that repo — nothing fabricated."
      actions={
        <Button size="sm" onClick={() => setAdding((v) => !v)} disabled={repos.length === 0}>
          <Icon name="plus" size={14} /> New automation
        </Button>
      }
    >
      {error ? (
        <Card className="mt-6 border-danger/25 bg-danger/10 p-4 text-body text-danger">
          Couldn’t reach the server ({error}). Start it and set <span className="font-mono">VITE_ACC_TOKEN</span> in <span className="font-mono">.env</span>.
        </Card>
      ) : null}

      {repos.length === 0 && !error ? (
        <Card className="mt-6 p-8 text-center">
          <p className="text-body text-text2">No repositories to automate yet</p>
          <p className="mt-1 text-label text-text3">
            Point <span className="font-mono">PROJECT_DIRS</span> at your code on the{' '}
            <Link to="/setup" className="text-primary hover:text-text1">Setup page</Link> — scanned repos show up here.
          </p>
        </Card>
      ) : null}

      {adding ? <div className="mt-6"><AutomationForm repos={repos} onSaved={() => { setAdding(false); refresh(); }} onCancel={() => setAdding(false)} /></div> : null}

      {automations === null && !error ? <p className="mt-6 text-body text-text3">Loading automations…</p> : null}

      {automations && automations.length === 0 && repos.length > 0 && !adding ? (
        <Card className="mt-6 p-8 text-center">
          <span className="mx-auto flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3"><Icon name="workflow" size={16} /></span>
          <p className="mt-2 text-body text-text2">No automations yet</p>
          <p className="mt-1 text-label text-text3">Click “New automation”, pick a template (nightly bug-hunt, TestFlight prep, fix-the-build…), and choose when it runs.</p>
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
                <AutomationRow key={a.id} a={a} onChanged={refresh} />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </PageShell>
  );
}
