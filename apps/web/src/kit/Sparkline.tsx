import { cx } from './cx';
import { toneText, type Tone } from './tones';

/**
 * Custom SVG sparkline — no chart deps. Enforces the data-integrity floor itself:
 * fewer than 2 points renders the flat "collecting data" line, never an invented curve.
 */
export function Sparkline({
  points,
  tone = 'success',
  width = 96,
  height = 28,
  className,
}: {
  points: number[];
  tone?: Tone;
  width?: number;
  height?: number;
  className?: string;
}) {
  const pad = 3;

  if (points.length < 2) {
    return (
      <svg
        width={width}
        height={height}
        className={cx('text-text3', className)}
        aria-label="collecting data"
      >
        <line
          x1={pad}
          y1={height / 2}
          x2={width - pad}
          y2={height / 2}
          stroke="currentColor"
          strokeWidth={1.5}
          strokeDasharray="3 4"
          strokeLinecap="round"
          opacity={0.6}
        />
      </svg>
    );
  }

  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (points.length - 1)) * (width - pad * 2);
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
  const path = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} className={cx(toneText[tone], className)} aria-hidden>
      <path d={path} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      {/* emphasized endpoint — the freshest real sample */}
      <circle cx={x(points.length - 1)} cy={y(last)} r={2.2} fill="currentColor" />
    </svg>
  );
}
