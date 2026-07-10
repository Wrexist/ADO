import { Card, Chip, IconTile, SectionHeader } from '../../kit';
import { useBus } from '../../store/bus';
import { buildRows } from '../../lib/selectors';
import { durationLabel } from '../../lib/time';

/**
 * Col 1 — Build Queue from the builds slice. Durations render in a reserved
 * tabular slot; queued rows show "Queued" — honest absence (council B3/S2).
 */
export function BuildQueue() {
  const state = useBus((s) => s.state);
  const rows = buildRows(state);

  return (
    <Card className="p-5">
      <SectionHeader title="Build Queue" action="View all" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {rows.map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-3">
            <IconTile icon="workflow" tone={b.state === 'running' ? 'violet' : 'muted'} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-text1">{b.repo}</p>
              <p className="truncate text-label text-text3">{b.jobLabel}</p>
            </div>
            <Chip tone="violet" size="sm">{b.branch}</Chip>
            <span className="w-16 shrink-0 text-right text-label tabular-nums text-text2">
              {b.elapsedSec != null ? durationLabel(b.elapsedSec) : <span className="text-text3">Queued</span>}
            </span>
          </div>
        ))}
        {rows.length === 0 ? (
          <p className="py-6 text-center text-body text-text3">No builds yet</p>
        ) : null}
      </div>
    </Card>
  );
}
