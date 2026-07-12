import { Card, MiniArea, SectionHeader } from '../../kit';
import { useBus } from '../../store/bus';
import { monitorSeries } from '../../lib/selectors';

/**
 * Col 3 — System Monitor: renders exclusively from stored sysmon samples.
 * <2 samples → the flat "collecting data" line; headline = latest real sample or —.
 */
export function SystemMonitor() {
  const state = useBus((s) => s.state);
  const series = monitorSeries(state);

  return (
    <Card className="p-5">
      <SectionHeader title="System Monitor" action="View full metrics" actionTo="/planned/performance" />
      <div className="mt-3 grid grid-cols-3 gap-2.5">
        {series.map((s) => (
          <div key={s.id} className="rounded-tile bg-elevated p-2.5">
            <p className="truncate text-label text-text3">{s.label}</p>
            <p className="mt-0.5 text-section font-semibold tabular-nums text-text1">
              {s.current != null ? `${Math.round(s.current)}%` : '—'}
            </p>
            <MiniArea points={s.points} tone={s.tone} width={80} height={34} responsive className="mt-1" />
          </div>
        ))}
      </div>
    </Card>
  );
}
