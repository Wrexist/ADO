import { Card, MiniArea, StatCard, cx } from '../kit';
import { PageShell } from '../chrome/PageShell';
import { useBus } from '../store/bus';
import { monitorSeries, systemHealthPct, HEALTH_FORMULA_DOC } from '../lib/selectors';

/**
 * Performance — real system metrics for THIS machine (the box running the local server),
 * straight from stored sysmon samples + build events. No fabricated numbers: <2 samples
 * shows the honest "collecting data" floor; no builds shows the honest empty state.
 */
export function PerformancePage() {
  const state = useBus((s) => s.state);
  const series = monitorSeries(state);
  const health = systemHealthPct(state);
  const sampleCount = state.samples.length;

  const builds = Object.values(state.builds);
  const passing = builds.filter((b) => b.state === 'success').length;
  const failed = builds.filter((b) => b.state === 'failed').length;
  const active = builds.filter((b) => b.state === 'running' || b.state === 'queued').length;
  const terminal = passing + failed;
  const passRate = terminal > 0 ? Math.round((100 * passing) / terminal) : null;

  return (
    <PageShell
      title="Performance"
      subtitle="Live resource usage for this machine (the local server), sampled continuously — plus build throughput. Every value is a real sample; nothing is estimated."
    >
      {/* resource series — one big area per metric */}
      <div className="mt-6 grid grid-cols-3 gap-4">
        {series.map((s) => (
          <Card key={s.id} className="p-5">
            <div className="flex items-baseline justify-between">
              <p className="text-body text-text2">{s.label}</p>
              <p className="text-stat font-semibold tabular-nums text-text1">
                {s.current != null ? `${Math.round(s.current)}%` : '—'}
              </p>
            </div>
            <MiniArea points={s.points} tone={s.tone} width={280} height={72} responsive className="mt-3" />
            <p className="mt-2 text-label text-text3">
              {sampleCount >= 2 ? `${sampleCount} samples` : 'collecting data — needs ≥2 samples'}
            </p>
          </Card>
        ))}
      </div>

      {/* health + build throughput — derived, documented, honest */}
      <div className="mt-4 grid grid-cols-4 gap-4">
        <StatCard
          label="System Health"
          info={HEALTH_FORMULA_DOC}
          value={health != null ? `${health}%` : '—'}
          sub={health == null ? 'no data yet' : health >= 95 ? 'Excellent' : health >= 80 ? 'Good' : 'Degraded'}
          tinted={health != null && health >= 95 ? 'success' : undefined}
          icon="health"
          iconTone="success"
        />
        <StatCard
          label="Builds tracked"
          value={String(builds.length)}
          sub={active > 0 ? `${active} active` : 'none active'}
          subDotTone={active > 0 ? 'info' : 'muted'}
          icon="pipeline"
          iconTone="violet"
        />
        <StatCard
          label="Pass rate"
          info="Passing ÷ (passing + failed) across all tracked builds. Running/queued builds are excluded until they finish. No finished builds → no rate."
          value={passRate != null ? `${passRate}%` : '—'}
          sub={terminal > 0 ? `${passing}/${terminal} passed` : 'no finished builds yet'}
          tinted={passRate != null && passRate >= 90 ? 'success' : undefined}
          icon="check"
          iconTone="success"
        />
        <StatCard
          label="Failed builds"
          value={String(failed)}
          sub={failed > 0 ? 'needs attention' : 'all clear'}
          subDotTone={failed > 0 ? 'danger' : 'success'}
          icon="pipeline"
          iconTone={failed > 0 ? 'danger' : 'success'}
        />
      </div>

      {sampleCount < 2 ? (
        <p className={cx('mt-4 text-label text-text3')}>
          Resource charts fill in once the server has taken a couple of samples (a few seconds after it starts).
        </p>
      ) : null}
    </PageShell>
  );
}
