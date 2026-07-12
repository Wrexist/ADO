import type { ReactNode } from 'react';
import { Card } from './Card';
import { cx } from './cx';
import { IconTile } from './IconTile';
import type { IconName } from './Icon';
import { StatusDot } from './StatusDot';
import { toneText, type Tone } from './tones';

/**
 * Stat card — label, big tabular value, delta/sub line, and a right-side visual
 * (icon tile by default; pass `visual` for radial/sparkline variants).
 * Values are display strings from data — this component never computes numbers.
 */
export function StatCard({
  label,
  value,
  delta,
  sub,
  subDotTone,
  icon,
  iconTone = 'violet',
  visual,
  tinted,
  info,
  className,
}: {
  label: string;
  value: string;
  delta?: { label: string; trend: 'up' | 'down'; tone: Tone };
  sub?: string;
  subDotTone?: Tone;
  icon?: IconName;
  iconTone?: Tone;
  visual?: ReactNode;
  /** Tinted card surface (System Health "Excellent" card). */
  tinted?: Tone;
  /** Optional explanation — renders a visible ⓘ next to the label with this as its tooltip. */
  info?: string;
  className?: string;
}) {
  return (
    <Card
      className={cx(
        'flex items-start justify-between gap-3 p-5',
        tinted === 'success' && 'border-success/20 bg-success/10',
        className,
      )}
    >
      <div className="min-w-0">
        <p className="flex items-center gap-1 text-body text-text2">
          {label}
          {info ? (
            <button
              type="button"
              title={info}
              aria-label={`How ${label} is calculated`}
              className="cursor-help text-label leading-none text-text3 transition-colors duration-150 ease-soft hover:text-text1"
            >
              ⓘ
            </button>
          ) : null}
        </p>
        <p className="mt-1.5 text-stat font-semibold tabular-nums text-text1">{value}</p>
        {delta ? (
          <p className={cx('mt-1.5 flex items-center gap-1 whitespace-nowrap text-body', toneText[delta.tone])}>
            <span aria-hidden>{delta.trend === 'up' ? '↑' : '↓'}</span>
            <span>{delta.label}</span>
          </p>
        ) : sub ? (
          subDotTone ? (
            <StatusDot tone={subDotTone} label={sub} className="mt-1.5" />
          ) : (
            <p className="mt-1.5 text-body text-text2">{sub}</p>
          )
        ) : null}
      </div>
      {visual ?? (icon ? <IconTile icon={icon} tone={iconTone} size="lg" /> : null)}
    </Card>
  );
}
