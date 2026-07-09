import { cx } from './cx';
import { toneText, type Tone } from './tones';

/**
 * Custom SVG mini area chart — System Monitor (CPU/Memory/Network).
 * Same integrity floor as Sparkline: <2 points → flat "collecting data" line.
 */
export function MiniArea({
  points,
  tone = 'info',
  width = 132,
  height = 44,
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
      <svg width={width} height={height} className={cx('text-text3', className)} aria-label="collecting data">
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
  const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2 - 4);
  const line = points.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${x(points.length - 1).toFixed(1)},${height - pad} L${x(0).toFixed(1)},${height - pad} Z`;

  return (
    <svg width={width} height={height} className={cx(toneText[tone], className)} aria-hidden>
      {/* faint baseline grid */}
      <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} stroke="currentColor" strokeWidth={1} opacity={0.12} />
      <path d={area} fill="currentColor" opacity={0.13} stroke="none" />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
