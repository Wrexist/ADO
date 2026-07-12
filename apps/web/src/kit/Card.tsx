import type { HTMLAttributes } from 'react';
import { cx } from './cx';

/** Base surface: bg-card, 1px border, radius 16. Separation comes from bg steps, not shadows. */
export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cx(
        'rounded-card border bg-card transition-colors duration-150 ease-soft',
        className,
      )}
      {...rest}
    />
  );
}

/** Interactive variant — border + bg lift on hover (150ms ease, the only motion). */
export function HoverCard({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <Card className={cx('hover:border-hover hover:bg-elevated/40', className)} {...rest} />;
}
