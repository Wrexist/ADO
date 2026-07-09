import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Card, Chip, IconTile, SectionHeader } from '../../kit';

/**
 * Col 1 — Build Queue. Durations render in a reserved tabular slot; queued rows
 * show "Queued" — an honest absence, never a fake 0s (council B3/S2).
 */
export function BuildQueue() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <SectionHeader title="Build Queue" action="View all" />
      <div className="mt-2 flex flex-col divide-y divide-white/[0.05]">
        {m.buildQueue.map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-3">
            <IconTile icon="workflow" tone={b.state === 'running' ? 'violet' : 'muted'} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-body font-medium text-text1">{b.repo}</p>
              <p className="truncate text-label text-text3">{b.jobLabel}</p>
            </div>
            <Chip tone="violet" size="sm">{b.branch}</Chip>
            <span className="w-16 shrink-0 text-right text-label tabular-nums text-text2">
              {b.durationLabel ?? <span className="text-text3">Queued</span>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
