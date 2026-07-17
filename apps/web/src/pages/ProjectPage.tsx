import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PROJECT_FEATURES, type Automation, type BuildState, type ProjectFeatureId, type ProjectFeatureMap, type ProjectGitInfo, type Repo, type ReviewRun } from '@ado/shared';
import { AgentTile, Button, Card, Chip, FeedRow, GradientProgress, Icon, IconTile, StatusDot, cx, type Tone } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { CATEGORY_ICON, CATEGORY_TAG, CI_TONE, REPO_STATUS_LOOK } from '../lib/repoLook';
import { LANG_LABEL, ENV_LABEL, ENV_TONE, asIcon } from '../views/ops/maps';
import { timeAgo } from '../lib/time';
import { dispatchPrompt } from '../lib/prompts';
import { fetchAutomations, runAutomation } from '../lib/automations';
import { pollReview, startReview } from '../lib/review';
import { fetchProjectGit, fetchProjectSettings, setProjectFeature } from '../lib/projectSettings';
import { TestFlightCard } from '../views/TestFlightCard';
import { RunHistory } from '../views/RunHistory';

const BUILD_TONE: Record<BuildState, Tone> = { running: 'info', queued: 'muted', success: 'success', failed: 'danger' };
const triggerLabel = (a: Automation): string =>
  a.trigger.on === 'manual' ? 'On command' : a.trigger.on === 'schedule' ? `Every ${a.trigger.every}` : a.trigger.event === 'build.failed' ? 'On CI failure' : 'On CI success';

/** A small labelled stat used in the project header strip. */
function Meta({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex flex-col">
      <span className="text-label text-text3">{label}</span>
      <span className="text-body font-medium tabular-nums text-text1">{value}</span>
    </div>
  );
}

function DispatchBox({ repo }: { repo: Repo }) {
  const [task, setTask] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const run = async () => {
    if (!task.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const { runId } = await dispatchPrompt(repo.id, task.trim());
      setMsg(`dispatched ${runId}`);
      setTask('');
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex flex-col gap-3 p-5">
      <h2 className="text-section font-semibold text-text1">Dispatch an agent</h2>
      <textarea
        value={task}
        onChange={(e) => setTask(e.target.value)}
        rows={3}
        placeholder={`Describe a task to run in ${repo.name}…`}
        aria-label="Task"
        className="rounded-tile border bg-card p-3 text-body text-text1 focus:border-primary/50 focus:outline-none"
      />
      <div className="flex items-center justify-between gap-3">
        <span className={cx('text-label', msg?.startsWith('dispatched') ? 'text-success' : msg ? 'text-danger' : 'text-text3')}>
          {msg ?? 'Runs a real headless agent in this repo.'}
        </span>
        <Button size="sm" onClick={() => void run()} disabled={busy || !task.trim()}>{busy ? 'Dispatching…' : 'Dispatch'}</Button>
      </div>
    </Card>
  );
}

function ReviewCard({ repo }: { repo: Repo }) {
  const [run, setRun] = useState<ReviewRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const start = async () => {
    setErr(null);
    setBusy(true);
    try {
      setRun(await startReview(repo.id));
    } catch (e) {
      setErr((e as Error).message);
      setBusy(false);
    }
  };

  // Poll while the review runs (it's cloud multi-agent — can take minutes).
  useEffect(() => {
    if (!run || run.status !== 'running') return;
    let alive = true;
    const t = setTimeout(async () => {
      try {
        const next = await pollReview(run.runId);
        if (!alive) return;
        setRun(next);
        if (next.status !== 'running') setBusy(false);
      } catch (e) {
        if (alive) {
          setErr((e as Error).message);
          setBusy(false);
        }
      }
    }, 1500);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [run]);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-section font-semibold text-text1">Deep review</h2>
        <Button size="sm" variant="outline" onClick={() => void start()} disabled={busy}>{busy ? 'Reviewing…' : 'Run deep review'}</Button>
      </div>
      <p className="text-label text-text3">
        Runs <span className="font-mono">claude ultrareview</span> — a cloud, multi-agent review of this repo’s current branch. Uses your Claude subscription.
      </p>
      {run ? (
        <div className="rounded-tile border bg-app/60 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-mono text-label text-text3">{run.command}</span>
            <span className={cx('text-label font-medium', run.status === 'done' ? 'text-success' : run.status === 'failed' ? 'text-danger' : 'text-text3')}>
              {run.status === 'running' ? 'running…' : run.status === 'done' ? 'done ✓' : `failed (exit ${run.code})`}
            </span>
          </div>
          {run.output.length ? (
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words font-mono text-label text-text2">{run.output.slice(-60).join('\n')}</pre>
          ) : null}
        </div>
      ) : null}
      {err ? <p className="text-label text-danger">{err}</p> : null}
    </Card>
  );
}

/** One feature switch row: name + blurb, an On/Off toggle, honest per-row save errors. */
function FeatureRow({ repoId, feature, enabled, onChanged }: {
  repoId: string;
  feature: (typeof PROJECT_FEATURES)[number];
  enabled: boolean;
  onChanged: (features: ProjectFeatureMap) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const flip = async () => {
    setBusy(true);
    setErr('');
    try {
      onChanged(await setProjectFeature(repoId, feature.id as ProjectFeatureId, !enabled));
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="border-t py-3 first:border-t-0 first:pt-1 last:pb-1">
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-body font-medium text-text1">{feature.name}</p>
          <p className="mt-0.5 text-label text-text3">{feature.blurb}</p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void flip()} disabled={busy} aria-label={`${feature.name}: ${enabled ? 'on' : 'off'}`}>
          <span className={cx('h-1.5 w-1.5 rounded-full', enabled ? 'bg-success' : 'bg-text3')} />
          {busy ? 'Saving…' : enabled ? 'On' : 'Off'}
        </Button>
      </div>
      {err ? <p className="mt-1.5 text-label text-danger">{err}</p> : null}
    </div>
  );
}

/**
 * Per-project settings — the switches behind the header's Settings button. Stored on the
 * server per repo; each switch is enforced at its real choke point (runner, engines,
 * notifier), so Off genuinely means off everywhere.
 */
function ProjectSettingsCard({ repoId }: { repoId: string }) {
  const [features, setFeatures] = useState<ProjectFeatureMap | null>(null);
  const [loadErr, setLoadErr] = useState('');
  useEffect(() => {
    let alive = true;
    setFeatures(null);
    fetchProjectSettings(repoId)
      .then((f) => alive && setFeatures(f))
      .catch((e) => alive && setLoadErr((e as Error).message));
    return () => {
      alive = false;
    };
  }, [repoId]);

  return (
    <Card className="mt-4 p-5">
      <div className="flex items-center gap-2">
        <Icon name="settings" size={15} className="text-primary" />
        <h2 className="text-section font-semibold text-text1">Project settings</h2>
      </div>
      <p className="mt-1 text-label text-text3">Saved per project. Off means off everywhere — schedules, events, and fix buttons included.</p>
      <div className="mt-3">
        {features === null && !loadErr ? <p className="py-2 text-label text-text3">Loading…</p> : null}
        {loadErr ? <p className="py-2 text-label text-danger">{loadErr}</p> : null}
        {features
          ? PROJECT_FEATURES.map((f) => (
              <FeatureRow key={f.id} repoId={repoId} feature={f} enabled={features[f.id]} onChanged={setFeatures} />
            ))
          : null}
      </div>
    </Card>
  );
}

/** GitHub actions for this repo: View on GitHub · Open PR #n (live) / New PR (compare page). */
function GitRow({ repoId }: { repoId: string }) {
  const [git, setGit] = useState<ProjectGitInfo | null>(null);
  const [hidden, setHidden] = useState(false); // not scanned locally → nothing to show
  useEffect(() => {
    let alive = true;
    setGit(null);
    setHidden(false);
    fetchProjectGit(repoId)
      .then((g) => alive && setGit(g))
      .catch(() => alive && setHidden(true));
    return () => {
      alive = false;
    };
  }, [repoId]);

  if (hidden || git === null) return null;

  const a = 'inline-flex h-8 items-center gap-1.5 rounded-tile border bg-card px-3 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1';
  return (
    <div className="w-full border-t pt-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="github" size={15} className="shrink-0 text-text3" />
        {git.github ? (
          <>
            <span className="font-mono text-label text-text3">{git.github.owner}/{git.github.repo}</span>
            <span className="ml-auto flex items-center gap-2">
              {git.openPr ? (
                <>
                  {git.openPr.checks ? (
                    <Chip
                      size="sm"
                      dot
                      tone={git.openPr.checks === 'passing' ? 'success' : git.openPr.checks === 'failing' ? 'danger' : 'info'}
                    >
                      {git.openPr.checks === 'passing' ? 'checks passing' : git.openPr.checks === 'failing' ? 'checks failing' : 'checks running'}
                    </Chip>
                  ) : null}
                  {git.openPr.mergeable === false ? (
                    <Chip size="sm" dot tone="danger">conflicts</Chip>
                  ) : git.openPr.mergeable === true ? (
                    <Chip size="sm" dot tone="success">mergeable</Chip>
                  ) : null}
                  <a href={git.openPr.url} target="_blank" rel="noreferrer" title={git.openPr.title} className="inline-flex h-8 items-center gap-1.5 rounded-tile bg-primary px-3 text-body font-medium text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85">
                    <Icon name="branch" size={13} /> Open PR #{git.openPr.number} ↗
                  </a>
                </>
              ) : (
                <a href={git.github.newPrUrl} target="_blank" rel="noreferrer" className={a}>
                  <Icon name="plus" size={13} /> New PR on {git.branch} ↗
                </a>
              )}
              <a href={git.github.webUrl} target="_blank" rel="noreferrer" className={a}>View on GitHub ↗</a>
            </span>
          </>
        ) : (
          <span className="text-label text-text3">{git.remoteUrl ? `origin: ${git.remoteUrl}` : 'No git remote configured — push this repo to GitHub to get PR shortcuts.'}</span>
        )}
      </div>
      {git.github && git.prState === 'no-token' ? (
        <p className="mt-1.5 text-label text-text3">
          Connect GitHub in <Link to="/settings" className="text-primary hover:text-text1">Settings</Link> to see this branch's open PR here.
        </p>
      ) : null}
    </div>
  );
}

export function ProjectPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const state = useBus((s) => s.state);
  const repo = id ? state.repos[id] : undefined;

  // ?settings=1 (RepoCard gear / ⌘K) opens the panel on arrival.
  const [showSettings, setShowSettings] = useState(searchParams.get('settings') === '1');
  const [autos, setAutos] = useState<Automation[] | null>(null);
  const refreshAutos = () => {
    if (!id) return;
    fetchAutomations().then((list) => setAutos(list.filter((a) => a.repoId === id))).catch(() => setAutos([]));
  };
  useEffect(refreshAutos, [id]);

  const builds = useMemo(
    () =>
      Object.values(state.builds)
        .filter((b) => b.repo === id)
        .sort((a, b) => (b.startedTs ?? '').localeCompare(a.startedTs ?? ''))
        .slice(0, 8),
    [state.builds, id],
  );
  const agents = useMemo(() => (repo?.agents ?? []).map((aid) => state.agents[aid]).filter(Boolean), [repo, state.agents]);
  const activity = useMemo(() => state.activity.filter((a) => a.repoId === id).slice(0, 6), [state.activity, id]);
  const deployments = useMemo(() => state.deployments.filter((d) => d.repoId === id).slice(0, 6), [state.deployments, id]);

  if (!repo) {
    return (
      <PageShell title="Project" subtitle="This repository isn’t in the dashboard.">
        <Card className="mt-6 p-8 text-center">
          <p className="text-body text-text2">Not found</p>
          <p className="mt-1 text-label text-text3">
            It may not be scanned yet. <Link to="/repositories" className="text-primary hover:text-text1">Back to Repositories</Link>.
          </p>
        </Card>
      </PageShell>
    );
  }

  const cat = CATEGORY_ICON[repo.category];
  const status = REPO_STATUS_LOOK[repo.status];

  return (
    <PageShell
      title={repo.name}
      subtitle={repo.description}
      actions={
        <>
          <button
            type="button"
            onClick={() => setShowSettings((v) => !v)}
            aria-expanded={showSettings}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-tile border px-3 py-2 text-body transition-colors duration-150 ease-soft',
              showSettings ? 'border-primary/50 bg-primary/15 text-text1' : 'bg-card text-text2 hover:border-hover hover:text-text1',
            )}
          >
            <Icon name="settings" size={14} /> Settings
          </button>
          <Link to={`/automations?repo=${repo.id}&new=1`} className="inline-flex items-center gap-1.5 rounded-tile bg-primary px-3 py-2 text-body font-medium text-text1 transition-colors duration-150 ease-soft hover:bg-primary/85">
            <Icon name="workflow" size={14} /> Automate
          </Link>
        </>
      }
    >
      {/* header strip */}
      <Card className="mt-6 flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <div className="flex items-center gap-3">
          <IconTile icon={cat.icon} tone={cat.tone} size="lg" />
          <div>
            <div className="flex items-center gap-2">
              <Chip size="sm">{CATEGORY_TAG[repo.category]}</Chip>
              <StatusDot tone={status.tone} label={status.label} />
            </div>
            <p className="mt-1 inline-flex items-center gap-1 text-label text-text3">
              <Icon name="branch" size={12} /> {repo.branch} · updated {timeAgo(repo.updatedTs)}
            </p>
          </div>
        </div>
        {repo.language ? <Meta label="Language" value={LANG_LABEL[repo.language]} /> : null}
        {repo.stars != null ? <Meta label="Stars" value={repo.stars} /> : null}
        {repo.prs != null ? <Meta label="Open PRs" value={repo.prs} /> : null}
        {repo.openTasks != null ? <Meta label="Open tasks" value={repo.openTasks} /> : null}
        <div className="ml-auto min-w-[200px]">
          {repo.ci ? (
            <div className="flex items-center gap-2">
              <span className="shrink-0 text-label text-text2">{repo.ci.label}</span>
              <GradientProgress pct={repo.ci.pct} tone={CI_TONE[repo.ci.state]} />
              <span className="w-10 shrink-0 text-right text-label tabular-nums text-text2">{repo.ci.pct}%</span>
            </div>
          ) : (
            <span className="text-label text-text3">No CI runs yet</span>
          )}
        </div>
        <GitRow repoId={repo.id} />
      </Card>

      {showSettings ? <ProjectSettingsCard repoId={repo.id} /> : null}

      <div className="mt-6 grid grid-cols-3 gap-4">
        {/* left: dispatch + builds */}
        <div className="col-span-2 flex flex-col gap-4">
          <DispatchBox repo={repo} />
          <ReviewCard repo={repo} />
          <Card className="p-5">
            <h2 className="text-section font-semibold text-text1">Recent builds</h2>
            {builds.length > 0 ? (
              <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
                {builds.map((b) => (
                  <div key={b.id} className="flex items-center gap-3 py-2.5">
                    <StatusDot tone={BUILD_TONE[b.state]} label="" />
                    <span className="min-w-0 flex-1 truncate text-body text-text1">{b.jobLabel}</span>
                    <Chip size="sm">{b.branch}</Chip>
                    <Chip size="sm" tone={BUILD_TONE[b.state]}>{b.state}</Chip>
                    <span className="w-14 shrink-0 text-right text-label tabular-nums text-text3">
                      {b.elapsedSec != null ? `${b.elapsedSec}s` : 'queued'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-label text-text3">No builds recorded for this repo yet.</p>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="text-section font-semibold text-text1">Recent activity</h2>
            {activity.length > 0 ? (
              <div className="mt-1 flex flex-col divide-y divide-white/[0.05]">
                {activity.map((a) => (
                  <FeedRow key={a.id} icon={asIcon(a.icon)} tone={a.tone} title={a.title} detail={a.detail} time={timeAgo(a.ts)} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-label text-text3">No activity recorded for this repo yet.</p>
            )}
          </Card>
        </div>

        {/* right: agents · automations · deployments */}
        <div className="col-span-1 flex flex-col gap-4">
          <Card className="p-5">
            <h2 className="text-section font-semibold text-text1">Agents</h2>
            {agents.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {agents.map((a) => (
                  <AgentTile key={a.id} icon={asIcon(a.icon)} name={a.name} statusLine={a.statusLine} pct={a.pct} tone={a.tone} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-label text-text3">No agents assigned.</p>
            )}
          </Card>

          <Card className="p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-section font-semibold text-text1">Automations</h2>
              <Link to={`/automations?repo=${repo.id}`} className="text-label text-primary hover:text-text1">Manage →</Link>
            </div>
            {autos === null ? (
              <p className="mt-2 text-label text-text3">Loading…</p>
            ) : autos.length > 0 ? (
              <div className="mt-3 flex flex-col gap-2">
                {autos.map((a) => (
                  <AutoRow key={a.id} a={a} triggerLabel={triggerLabel(a)} onRan={refreshAutos} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-label text-text3">
                None yet. <Link to={`/automations?repo=${repo.id}&new=1`} className="text-primary hover:text-text1">Add one</Link>.
              </p>
            )}
          </Card>

          <TestFlightCard repoId={repo.id} />

          <Card className="p-5">
            <h2 className="text-section font-semibold text-text1">Deployments</h2>
            {deployments.length > 0 ? (
              <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
                {deployments.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 py-2">
                    <Icon name="rocket" size={14} className="shrink-0 text-text3" />
                    <span className="min-w-0 flex-1 truncate text-body text-text1">{d.name}</span>
                    <Chip size="sm" tone={ENV_TONE[d.env]}>{ENV_LABEL[d.env]}</Chip>
                    <Icon name={d.ok ? 'check' : 'bell'} size={13} className={d.ok ? 'text-success' : 'text-danger'} />
                    <span className="w-12 shrink-0 text-right text-label tabular-nums text-text3">{timeAgo(d.ts)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-label text-text3">No deployments recorded for this repo yet.</p>
            )}
          </Card>
        </div>
      </div>

      {/* full width: this project's slice of the persisted run log (wide content — task + timeline) */}
      <div className="mt-6 flex items-center justify-between">
        <h2 className="text-section font-semibold text-text1">Run history</h2>
        <Link to="/agents" className="text-label text-primary hover:text-text1">All projects →</Link>
      </div>
      <RunHistory repoId={repo.id} />
    </PageShell>
  );
}

function AutoRow({ a, triggerLabel, onRan }: { a: Automation; triggerLabel: string; onRan: () => void }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const run = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { runId } = await runAutomation(a.id);
      setMsg(`run ${runId}`);
      onRan();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex items-center gap-2 rounded-tile bg-elevated/40 p-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-body text-text1">{a.name}</span>
          {!a.enabled ? <Chip size="sm" tone="muted">paused</Chip> : null}
        </div>
        <span className={cx('text-label', msg?.startsWith('run ') ? 'text-success' : msg ? 'text-danger' : 'text-text3')}>{msg ? (msg.startsWith('run ') ? `dispatched ${msg.slice(4)}` : msg) : triggerLabel}</span>
      </div>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => void run()}>Run</Button>
    </div>
  );
}
