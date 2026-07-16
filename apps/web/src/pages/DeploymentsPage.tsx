import { useEffect, useState } from 'react';
import { factsForBundle, type TestFlightAutofill, type TestFlightProfile } from '@ado/shared';
import { PageShell } from '../chrome/PageShell';
import { Card, Chip, Icon, SectionHeader } from '../kit';
import { useBus } from '../store/bus';
import { recentDeployments } from '../lib/selectors';
import { timeAgo } from '../lib/time';
import { ENV_LABEL, ENV_TONE } from '../views/ops/maps';
import { ProfileRow } from '../views/TestFlightCard';
import { fetchTestFlightAutofill, fetchTestFlightProfiles } from '../lib/testflight';

/**
 * All saved TestFlight templates across projects — quick deploys without leaving the
 * Deployments page. Section renders only when at least one template exists (no empty shell).
 */
function TestFlightSection() {
  const repos = useBus((s) => s.state.repos);
  const [profiles, setProfiles] = useState<TestFlightProfile[]>([]);
  const [autofills, setAutofills] = useState<Record<string, TestFlightAutofill>>({});

  const refresh = () => {
    // One list (unscoped), then a live auto-fill probe per distinct repo — each best-effort:
    // a repo that isn't scanned just deploys without prefill.
    fetchTestFlightProfiles()
      .then(async (all) => {
        setProfiles(all);
        const repoIds = [...new Set(all.map((p) => p.repoId))];
        const results = await Promise.allSettled(repoIds.map((id) => fetchTestFlightAutofill(id)));
        const map: Record<string, TestFlightAutofill> = {};
        results.forEach((r, i) => {
          if (r.status === 'fulfilled') map[repoIds[i]] = r.value;
        });
        setAutofills(map);
      })
      .catch(() => setProfiles([]));
  };
  useEffect(refresh, []);

  if (profiles.length === 0) return null;

  return (
    <Card className="mt-6 p-5">
      <SectionHeader title="TestFlight templates" />
      <p className="mt-1 text-label text-text3">
        Saved deploy templates from your projects — deploy from here; the version is entered fresh every time.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {profiles.map((p) => (
          <ProfileRow
            key={p.id}
            profile={p}
            facts={factsForBundle(autofills[p.repoId] ?? null, p.bundleId)}
            repoLabel={repos[p.repoId]?.name ?? p.repoId}
            onChanged={refresh}
          />
        ))}
      </div>
    </Card>
  );
}

export function DeploymentsPage() {
  const state = useBus((s) => s.state);
  const rows = recentDeployments(state, 50);

  return (
    <PageShell title="Deployments" subtitle="Releases and deployments recorded from GitHub and verified TestFlight uploads.">
      {rows.length > 0 ? (
        <Card className="mt-6 flex flex-col divide-y divide-white/[0.05] p-2">
          {rows.map((d) => (
            <div key={d.id} className="flex items-center gap-3 px-3 py-3">
              <Icon name="rocket" size={15} className="shrink-0 text-text3" />
              <p className="min-w-0 flex-1 truncate text-body font-medium text-text1">{d.name}</p>
              <Chip tone={ENV_TONE[d.env]} size="sm">{ENV_LABEL[d.env]}</Chip>
              <span className="w-14 shrink-0 text-right text-label tabular-nums text-text3">{timeAgo(d.ts)}</span>
              {d.ok ? (
                <Icon name="check" size={14} className="shrink-0 text-success" />
              ) : (
                <Icon name="bell" size={14} className="shrink-0 text-danger" />
              )}
            </div>
          ))}
        </Card>
      ) : (
        <Card className="mt-6 p-8">
          <div className="flex flex-col items-center gap-2 text-center">
            <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3">
              <Icon name="rocket" size={16} />
            </span>
            <p className="text-body text-text2">No deployments yet</p>
            <p className="text-label text-text3">Connect GitHub in Settings — releases record here.</p>
          </div>
        </Card>
      )}
      <TestFlightSection />
      <p className="mt-8 text-label text-text3">{rows.length} deployment{rows.length === 1 ? '' : 's'}</p>
    </PageShell>
  );
}
