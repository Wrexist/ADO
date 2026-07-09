import { cx } from './cx';
import { toneBg, toneText, type Tone } from './tones';

/**
 * Colored presence dot with optional label — Active, Operational, Idle, Down.
 * 'muted' is the honest idle/unknown tone; never fake a green dot.
 */
export function StatusDot({
  tone = 'success',
  label,
  labelTone,
  className,
}: {
  tone?: Tone;
  label?: string;
  /** Label color defaults to the dot tone for statuses like "Operational". */
  labelTone?: 'dot' | 'body';
  className?: string;
}) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', toneBg[tone])} />
      {label ? (
        <span
          className={cx(
            'text-body',
            labelTone === 'body' ? 'text-text2' : toneText[tone],
          )}
        >
          {label}
        </span>
      ) : null}
    </span>
  );
}
