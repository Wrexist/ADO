import { cx } from './cx';
import { toneBg, toneText, type Tone } from './tones';

/**
 * Colored presence dot with optional label — Active, Operational, Idle, Down.
 * 'muted' is the honest idle/unknown tone; never fake a green dot.
 */
export function StatusDot({
  tone = 'success',
  label,
  dotAfter,
  className,
}: {
  tone?: Tone;
  label?: string;
  /** Render "Operational ●" (dot trailing) — System Status rows. */
  dotAfter?: boolean;
  className?: string;
}) {
  const dot = <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', toneBg[tone])} />;
  const text = label ? (
    <span className={cx('whitespace-nowrap text-body', toneText[tone])}>{label}</span>
  ) : null;
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)}>
      {dotAfter ? (
        <>
          {text}
          {dot}
        </>
      ) : (
        <>
          {dot}
          {text}
        </>
      )}
    </span>
  );
}
