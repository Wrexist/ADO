import { cx } from './cx';
import { toneBg, type Tone } from './tones';

/**
 * The signature element: the violet→pink gradient progress bar — the one loud thing.
 * Tones cover the CI mapping (running=amber, failed=red); `indeterminate` is the honest
 * "running (opaque)" state — a muted bar, never a guessed percentage (council S2).
 * Width animates on load only; prefers-reduced-motion collapses it globally.
 */
export function GradientProgress({
  pct,
  tone = 'gradient',
  slim,
  indeterminate,
  className,
}: {
  pct?: number;
  tone?: Tone | 'gradient';
  slim?: boolean;
  indeterminate?: boolean;
  className?: string;
}) {
  const track = cx(
    'w-full overflow-hidden rounded-full bg-elevated',
    slim ? 'h-1' : 'h-1.5',
    className,
  );
  if (indeterminate || pct == null) {
    return (
      <div className={track} role="progressbar" aria-label="running (opaque)">
        <div className="h-full w-2/5 animate-pulse rounded-full bg-text3/40" />
      </div>
    );
  }
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div
      className={track}
      role="progressbar"
      aria-valuenow={clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(
          'h-full rounded-full transition-[width] duration-500 ease-soft',
          tone === 'gradient'
            ? 'bg-gradient-to-r from-gradient-from to-gradient-to'
            : toneBg[tone],
        )}
        style={{ width: `${clamped}%` }}
      />
    </div>
  );
}
