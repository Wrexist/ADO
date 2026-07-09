import { MOCK_VIEW_B } from '@ado/shared/mock';
import { Card, MiniArea, SectionHeader, type Tone } from '../../kit';

/**
 * Col 3 — System Monitor: CPU / Memory / Network mini area charts.
 * Post-P2 these render exclusively from real 10s sysmon samples; the headline
 * number equals the latest sample (asserted in the mock tests too).
 */
export function SystemMonitor() {
  const m = MOCK_VIEW_B;
  return (
    <Card className="p-5">
      <SectionHeader title="System Monitor" action="View full metrics" />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {m.monitor.map((s) => (
          <div key={s.id} className="rounded-tile bg-elevated p-2.5">
            <p className="truncate text-label text-text3">{s.label}</p>
            <p className="mt-0.5 text-section font-semibold tabular-nums text-text1">
              {s.valuePct}%
            </p>
            <MiniArea points={s.points} tone={s.tone as Tone} width={80} height={34} responsive className="mt-1" />
          </div>
        ))}
      </div>
    </Card>
  );
}
