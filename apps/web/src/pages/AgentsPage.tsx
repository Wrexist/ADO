import { PageShell } from '../chrome/PageShell';
import { AgentTile, Card, Chip, Icon, SectionHeader, type Tone } from '../kit';
import { useBus } from '../store/bus';
import { buildRows, rosterAgents, runningAgents } from '../lib/selectors';
import { durationLabel } from '../lib/time';

const BUILD_TONE: Record<string, Tone> = {
  running: 'info',
  queued: 'warning',
  success: 'success',
  failed: 'danger',
};

export function AgentsPage() {
  const state = useBus((s) => s.state);
  const running = runningAgents(state);
  const roster = rosterAgents(state);
  const builds = buildRows(state);

  const empty = (msg: string) => (
    <Card className="mt-3 p-6">
      <p className="text-center text-body text-text3">{msg}</p>
    </Card>
  );

  return (
    <PageShell title="Agents" subtitle="Running agents, your configured roster, and the build queue — all from the run log.">
      <SectionHeader title={`Running (${running.length})`} className="mt-6" />
      {running.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-4">
          {running.map((a) => (
            <AgentTile key={a.id} icon={a.icon as never} name={a.name} statusLine={a.statusLine} pct={a.pct} tone={a.tone as Tone} />
          ))}
        </div>
      ) : (
        empty('No agents running. Dispatch one from the command box or the Prompt Library.')
      )}

      <SectionHeader title={`Configured (${roster.length})`} className="mt-8" />
      {roster.length > 0 ? (
        <div className="mt-3 grid grid-cols-4 gap-4">
          {roster.map((a) => (
            <AgentTile key={a.id} icon={a.icon as never} name={a.name} statusLine={a.statusLine} pct={a.pct} tone={a.tone as Tone} />
          ))}
        </div>
      ) : (
        empty('No configured agents yet.')
      )}

      <SectionHeader title={`Build Queue (${builds.length})`} className="mt-8" />
      {builds.length > 0 ? (
        <Card className="mt-3 flex flex-col divide-y divide-white/[0.05] p-2">
          {builds.map((b) => (
            <div key={b.id} className="flex items-center gap-3 px-3 py-3">
              <Icon name="pipeline" size={15} className="shrink-0 text-text3" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-text1">{b.jobLabel}</p>
                <p className="truncate text-label text-text3">{b.repo} · {b.branch}</p>
              </div>
              <Chip tone={BUILD_TONE[b.state]} size="sm">{b.state}</Chip>
              <span className="w-16 shrink-0 text-right text-label tabular-nums text-text3">
                {b.elapsedSec != null ? durationLabel(b.elapsedSec) : '—'}
              </span>
            </div>
          ))}
        </Card>
      ) : (
        empty('No builds in the queue.')
      )}
    </PageShell>
  );
}
