import { Card, IconTile, SectionHeader, StatusDot, type IconName, type Tone } from '../../kit';
import { useBus } from '../../store/bus';
import { rosterAgents } from '../../lib/selectors';

/** Col 2 — AI Agents roster: configured agents from the bus; idle is honest muted. */
export function AgentRoster() {
  const state = useBus((s) => s.state);
  const agents = rosterAgents(state);

  return (
    <Card className="p-5">
      <SectionHeader title="AI Agents" action="Manage all" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {agents.map((a) => (
          <div key={a.id} className="flex items-center gap-3 py-3">
            <IconTile
              icon={a.icon as IconName}
              tone={a.status === 'idle' ? 'muted' : (a.tone as Tone)}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-text1">{a.name}</p>
              <p className="truncate text-label text-text3">{a.statusLine}</p>
            </div>
            <StatusDot
              tone={a.status === 'idle' ? 'muted' : 'success'}
              label={a.status === 'idle' ? 'Idle' : 'Active'}
            />
          </div>
        ))}
        {agents.length === 0 ? (
          <p className="py-6 text-center text-body text-text3">No agents configured</p>
        ) : null}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-tile border border-dashed py-2.5 text-body text-text3 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
      >
        + Add new agent
      </button>
    </Card>
  );
}
