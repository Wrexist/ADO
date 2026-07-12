import { cx } from './cx';
import { IconTile } from './IconTile';
import type { IconName } from './Icon';
import type { Tone } from './tones';

/**
 * Activity feed row — icon tile, title + one-line detail, right-aligned time.
 * Time sits in a reserved tabular slot so live updates never reflow the row.
 */
export function FeedRow({
  icon,
  tone = 'violet',
  title,
  detail,
  time,
  className,
}: {
  icon: IconName;
  tone?: Tone;
  title: string;
  detail: string;
  time: string;
  className?: string;
}) {
  return (
    <div className={cx('flex items-start gap-3 py-2.5', className)}>
      <IconTile icon={icon} tone={tone} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body font-medium text-text1">{title}</p>
        <p className="truncate text-body text-text2">{detail}</p>
      </div>
      <span className="w-14 shrink-0 text-right text-label tabular-nums text-text3">{time}</span>
    </div>
  );
}
