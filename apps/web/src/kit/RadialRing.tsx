import { cx } from './cx';
import { toneText, type Tone } from './tones';

/**
 * Custom SVG radial ring. A ring encodes a RATIO — the denominator is required
 * (council S3): value of max, e.g. 8 running of 10 runner slots.
 */
export function RadialRing({
  value,
  max,
  size = 44,
  strokeWidth = 4,
  tone = 'violet',
  className,
}: {
  value: number;
  max: number;
  size?: number;
  strokeWidth?: number;
  tone?: Tone;
  className?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const frac = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;

  return (
    <svg
      width={size}
      height={size}
      className={cx(toneText[tone], className)}
      role="img"
      aria-label={`${value} of ${max}`}
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity={0.15}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={`${(c * frac).toFixed(2)} ${c.toFixed(2)}`}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </svg>
  );
}
