import { useMemo } from 'react';
import type { RepoCategory } from '@ado/shared';
import { Card, MiniArea, SectionHeader, StatCard, cx } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { activeAgentCount, statDelta, weekDelta } from '../lib/selectors';
import { ENV_LABEL } from '../views/ops/maps';
import { approxTokens } from '../lib/time';

const CAT_LABEL: Record<RepoCategory, string> = {
  game: 'Games',
  app: 'Apps',
  web: 'Web',
  api: 'API',
  library: 'Libraries',
  service: 'Services',
};

/** A labelled proportion bar — count relative to the largest bucket. Tokens only. */
function Bar({ label, count, max, tone = 'bg-primary' }: { label: string; count: number; max: number; tone?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-label text-text2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
        <div className={cx('h-full rounded-full', tone)} style={{ width: count > 0 && max > 0 ? `${Math.max(4, (100 * count) / max)}%` : '0%' }} />
      </div>
      <span className="w-8 shrink-0 text-right text-label tabular-nums text-text3">{count}</span>
    </div>
  );
}

/**
 * Analytics — portfolio + delivery numbers DERIVED from stored events (repos, builds,
 * deployments, token snapshots). No new data source, no estimates: every figure is a
 * count/roll-up of real bus state, and trends only show once ≥2 daily snapshots exist.
 */
export function AnalyticsPage() {
  const state = useBus((s) => s.state);

  const repos = Object.values(state.repos);
  const builds = Object.values(state.builds);

  const byCategory = useMemo(() => {
    const m = new Map<RepoCategory, number>();
    for (const r of repos) m.set(r.category, (m.get(r.category) ?? 0) + 1);
    return m;
  }, [repos]);
  const catMax = Math.max(1, ...byCategory.values());

  const byEnv = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of state.deployments) m.set(d.env, (m.get(d.env) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [state.deployments]);
  const envMax = Math.max(1, ...byEnv.map(([, n]) => n));

  const passing = builds.filter((b) => b.state === 'success').length;
  const failed = builds.filter((b) => b.state === 'failed').length;
  const buildMax = Math.max(1, passing, failed, builds.filter((b) => b.state === 'running').length, builds.filter((b) => b.state === 'queued').length);

  const tokenSeries = (state.statHistory.tokens ?? []).map((p) => p.value);

  return (
    <PageShell
      title="Analytics"
      subtitle="Portfolio and delivery metrics, rolled up from the same stored events the dashboards render — nothing estimated."
    >
      {/* headline roll-ups */}
      <div className="mt-6 grid grid-cols-4 gap-4">
        <StatCard
          label="Repositories"
          value={String(repos.length)}
          delta={weekDelta(statDelta(repos.length, state.statHistory.repos))}
          icon="repos"
          iconTone="violet"
        />
        <StatCard
          label="Deployments"
          value={String(state.deployments.length)}
          delta={weekDelta(statDelta(state.deployments.length, state.statHistory.deployments))}
          icon="rocket"
          iconTone="info"
        />
        <StatCard
          label="Active agents"
          value={String(activeAgentCount(state))}
          sub={`${Object.keys(state.agents).length} total`}
          icon="agents"
          iconTone="success"
        />
        <StatCard
          label="AI Tokens Used"
          info="Approximate tokens across agent runs in the recent window, from stored token snapshots."
          value={approxTokens(state.tokens?.approxTokens ?? null)}
          sub={state.tokens?.approxTokens != null ? `last ${state.tokens.windowLabel}` : 'tokens unavailable'}
          icon="tokens"
          iconTone="warning"
        />
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4">
        {/* repositories by category */}
        <Card className="p-5">
          <SectionHeader title="Repositories by type" />
          <div className="mt-4 flex flex-col gap-2.5">
            {repos.length === 0 ? (
              <p className="text-label text-text3">No repositories yet — add a project to populate this.</p>
            ) : (
              (Object.keys(CAT_LABEL) as RepoCategory[])
                .filter((c) => (byCategory.get(c) ?? 0) > 0)
                .map((c) => <Bar key={c} label={CAT_LABEL[c]} count={byCategory.get(c) ?? 0} max={catMax} />)
            )}
          </div>
        </Card>

        {/* build outcomes */}
        <Card className="p-5">
          <SectionHeader title="Build outcomes" />
          <div className="mt-4 flex flex-col gap-2.5">
            {builds.length === 0 ? (
              <p className="text-label text-text3">No builds yet — they appear when CI runs or an agent dispatches.</p>
            ) : (
              <>
                <Bar label="Passing" count={passing} max={buildMax} tone="bg-success" />
                <Bar label="Failed" count={failed} max={buildMax} tone="bg-danger" />
                <Bar label="Running" count={builds.filter((b) => b.state === 'running').length} max={buildMax} tone="bg-info" />
                <Bar label="Queued" count={builds.filter((b) => b.state === 'queued').length} max={buildMax} tone="bg-warning" />
              </>
            )}
          </div>
        </Card>

        {/* deployments by environment */}
        <Card className="p-5">
          <SectionHeader title="Deployments by environment" />
          <div className="mt-4 flex flex-col gap-2.5">
            {byEnv.length === 0 ? (
              <p className="text-label text-text3">No deployments recorded yet.</p>
            ) : (
              byEnv.map(([env, n]) => <Bar key={env} label={ENV_LABEL[env as keyof typeof ENV_LABEL] ?? env} count={n} max={envMax} tone="bg-info" />)
            )}
          </div>
        </Card>

        {/* token usage trend */}
        <Card className="p-5">
          <SectionHeader title="Token usage trend" />
          {tokenSeries.length >= 2 ? (
            <MiniArea points={tokenSeries} tone="warning" width={480} height={80} responsive className="mt-4" />
          ) : (
            <p className="mt-4 text-label text-text3">Trend needs ≥2 daily snapshots — collecting data.</p>
          )}
        </Card>
      </div>
    </PageShell>
  );
}
