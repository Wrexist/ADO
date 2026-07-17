import { useEffect, useMemo, useState } from 'react';
import type { RepoCategory, RunStats } from '@ado/shared';
import { Card, MiniArea, SectionHeader, StatCard, cx } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { activeAgentCount, statDelta, weekDelta } from '../lib/selectors';
import { ENV_LABEL } from '../views/ops/maps';
import { approxTokens, durationLabel } from '../lib/time';
import { fetchRunStats } from '../lib/runs';

const CAT_LABEL: Record<RepoCategory, string> = {
  game: 'Games',
  app: 'Apps',
  web: 'Web',
  api: 'API',
  library: 'Libraries',
  service: 'Services',
};

/** A labelled proportion bar — count relative to the largest bucket. Tokens only.
 *  `display` overrides the printed number (e.g. "134K" for token sums) without changing the bar math. */
function Bar({ label, count, max, tone = 'bg-primary', display }: { label: string; count: number; max: number; tone?: string; display?: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-24 shrink-0 truncate text-label text-text2">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-elevated">
        <div className={cx('h-full rounded-full', tone)} style={{ width: count > 0 && max > 0 ? `${Math.max(4, (100 * count) / max)}%` : '0%' }} />
      </div>
      <span className={cx('shrink-0 text-right text-label tabular-nums text-text3', display ? 'w-14' : 'w-8')}>{display ?? count}</span>
    </div>
  );
}

const fmtTok = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

/**
 * Analytics — portfolio + delivery numbers DERIVED from stored events (repos, builds,
 * deployments, token snapshots). No new data source, no estimates: every figure is a
 * count/roll-up of real bus state, and trends only show once ≥2 daily snapshots exist.
 */
export function AnalyticsPage() {
  const state = useBus((s) => s.state);

  const repos = Object.values(state.repos);
  const builds = Object.values(state.builds);

  // Agent-run roll-up from the persisted run log (REST, not bus) — exact stored sums.
  const [runStats, setRunStats] = useState<RunStats | null>(null);
  const [runStatsErr, setRunStatsErr] = useState('');
  useEffect(() => {
    fetchRunStats(7)
      .then(setRunStats)
      .catch((e) => setRunStatsErr((e as Error).message));
  }, []);

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

  // Prefer the EXACT series (trailing-7d sums from the run log, snapshotted daily by the
  // scheduler); fall back to the legacy ≈ session-parse series. Never mixed — different provenance.
  const runTokenSeries = (state.statHistory.tokensRuns ?? []).map((p) => p.value);
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
          {runTokenSeries.length >= 2 ? (
            <>
              <MiniArea points={runTokenSeries} tone="warning" width={480} height={80} responsive className="mt-4" />
              <p className="mt-2 text-label text-text3">Exact trailing-7-day token sums from the run log, snapshotted daily.</p>
            </>
          ) : tokenSeries.length >= 2 ? (
            <>
              <MiniArea points={tokenSeries} tone="warning" width={480} height={80} responsive className="mt-4" />
              <p className="mt-2 text-label text-text3">≈ approximate session-parse totals — exact run-log snapshots take over as they accrue.</p>
            </>
          ) : (
            <p className="mt-4 text-label text-text3">Trend needs ≥2 daily snapshots — collecting data.</p>
          )}
        </Card>
      </div>

      {/* agent runs — the persisted run log, exact sums (no dollar figures: price tables
          drift, so a computed cost would be a fabricated number) */}
      <SectionHeader title={`Agent runs · last ${runStats?.windowDays ?? 7} days`} className="mt-8" />
      {runStats === null ? (
        <Card className="mt-3 p-5">
          <p className="text-label text-text3">{runStatsErr ? `Run stats unavailable — ${runStatsErr}` : 'Loading…'}</p>
        </Card>
      ) : runStats.total === 0 ? (
        <Card className="mt-3 p-5">
          <p className="text-label text-text3">No agent runs in this window — dispatch one and the roll-up populates.</p>
        </Card>
      ) : (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Card className="p-5">
            <SectionHeader title="Run outcomes" />
            <div className="mt-4 flex flex-col gap-2.5">
              {(() => {
                const m = Math.max(1, ...Object.values(runStats.byStatus));
                return (
                  <>
                    <Bar label="Done" count={runStats.byStatus.done} max={m} tone="bg-success" />
                    <Bar label="Failed" count={runStats.byStatus.failed} max={m} tone="bg-danger" />
                    <Bar label="Running" count={runStats.byStatus.running} max={m} tone="bg-info" />
                    <Bar label="Queued" count={runStats.byStatus.queued} max={m} tone="bg-warning" />
                  </>
                );
              })()}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Run volume" />
            <div className="mt-4 flex flex-col gap-1.5 text-body text-text2">
              <p><span className="font-semibold text-text1">{runStats.total}</span> runs · <span className="font-semibold text-text1">{durationLabel(Math.round(runStats.totalDurationMs / 1000))}</span> total agent time</p>
              <p>
                <span className="font-semibold text-text1">{fmtTok(runStats.tokensIn)}</span> tokens in · <span className="font-semibold text-text1">{fmtTok(runStats.tokensOut)}</span> out
              </p>
              {runStats.runsWithoutUsage > 0 ? (
                <p className="text-label text-text3">{runStats.runsWithoutUsage} run{runStats.runsWithoutUsage === 1 ? '' : 's'} reported no usage data (counted, not estimated).</p>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Tokens by project" />
            <div className="mt-4 flex flex-col gap-2.5">
              {(() => {
                const max = Math.max(1, ...runStats.byRepo.map((s) => s.tokensIn + s.tokensOut));
                return runStats.byRepo.map((s) => (
                  <Bar
                    key={s.key}
                    label={state.repos[s.key]?.name ?? s.key}
                    count={s.tokensIn + s.tokensOut}
                    max={max}
                    display={fmtTok(s.tokensIn + s.tokensOut)}
                  />
                ));
              })()}
            </div>
          </Card>

          <Card className="p-5">
            <SectionHeader title="Tokens by model" />
            <div className="mt-4 flex flex-col gap-2.5">
              {(() => {
                const max = Math.max(1, ...runStats.byModel.map((s) => s.tokensIn + s.tokensOut));
                return runStats.byModel.map((s) => (
                  <Bar key={s.key} label={s.key} count={s.tokensIn + s.tokensOut} max={max} display={fmtTok(s.tokensIn + s.tokensOut)} tone="bg-info" />
                ));
              })()}
            </div>
          </Card>
        </div>
      )}
    </PageShell>
  );
}
