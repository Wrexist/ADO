import { Card } from './Card';
import { GradientProgress } from './GradientProgress';
import { IconTile } from './IconTile';
import type { IconName } from './Icon';
import { toneText, type Tone } from './tones';
import { cx } from './cx';

/**
 * Running-agent tile — icon, name, one-line status, slim progress + %.
 * pct=null means progress is unknown. Say so explicitly; neither turn consumption
 * nor the width of a decorative partial bar measures task completion.
 */
export function AgentTile({
  icon,
  name,
  statusLine,
  pct,
  tone = 'violet',
  className,
}: {
  icon: IconName;
  name: string;
  statusLine: string;
  pct: number | null;
  tone?: Tone;
  className?: string;
}) {
  return (
    <Card className={cx('flex flex-col gap-2.5 p-4', className)}>
      <div className="flex items-center gap-2.5">
        <IconTile icon={icon} tone={tone} size="sm" />
        <div className="min-w-0">
          <p className="truncate text-body font-medium text-text1">{name}</p>
          <p className="truncate text-label text-text3">{statusLine}</p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {pct == null ? <span className="text-label text-text3">Progress unknown</span> : <>
        <GradientProgress pct={pct} tone={tone} slim />
        <span
          className={cx(
            'w-9 shrink-0 text-right text-label tabular-nums',
            toneText[tone],
          )}
        >
          {`${pct}%`}
        </span>
        </>}
      </div>
    </Card>
  );
}
