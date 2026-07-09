import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Card, IconTile, SectionHeader, StatusDot } from '../../kit';
import { AGENT_ICON } from './maps';

/** Col 2 — AI Agents roster: configured agents + last status; idle is honest muted. */
export function AgentRoster() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <SectionHeader title="AI Agents" action="Manage all" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {m.agentRoster.map((a) => {
          const tile = AGENT_ICON[a.id] ?? { icon: 'agents' as const, tone: 'violet' as const };
          return (
            <div key={a.id} className="flex items-center gap-3 py-3">
              <IconTile icon={tile.icon} tone={a.state === 'idle' ? 'muted' : tile.tone} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-body font-medium text-text1">{a.name}</p>
                <p className="truncate text-label text-text3">{a.statusLine}</p>
              </div>
              <StatusDot
                tone={a.state === 'active' ? 'success' : 'muted'}
                label={a.state === 'active' ? 'Active' : 'Idle'}
              />
            </div>
          );
        })}
      </div>
      <button
        type="button"
        className="mt-3 w-full rounded-tile border border-dashed py-2.5 text-body text-text3 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
      >
        {m.addAgentLabel}
      </button>
    </Card>
  );
}
