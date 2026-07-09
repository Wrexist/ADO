import type { ReactNode } from 'react';
import { cx } from './cx';
import { toneBg, toneTint, type Tone } from './tones';

/**
 * Pill — tag (Game/App), count badge, branch chip, env chip, status chip (with dot).
 * Untinted default = quiet elevated pill; pass a tone for env/status tints.
 */
export function Chip({
  children,
  tone,
  dot,
  size = 'md',
  className,
}: {
  children: ReactNode;
  tone?: Tone;
  dot?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <span
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full font-medium',
        size === 'sm' ? 'px-1.5 py-0.5 text-label' : 'px-2.5 py-1 text-label',
        tone ? toneTint[tone] : 'bg-elevated text-text2',
        className,
      )}
    >
      {dot && tone ? <span className={cx('h-1.5 w-1.5 rounded-full', toneBg[tone])} /> : null}
      {children}
    </span>
  );
}

/** Sidebar count badge — the quiet elevated pill from the reference. */
export function CountBadge({ children }: { children: ReactNode }) {
  return (
    <span className="ml-auto rounded-full bg-elevated px-1.5 py-0.5 text-label tabular-nums text-text3">
      {children}
    </span>
  );
}
