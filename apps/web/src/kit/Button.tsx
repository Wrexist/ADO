import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

/** Button — primary (violet), outline (bordered card), ghost (quiet text). */
export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'outline' | 'ghost';
  size?: 'sm' | 'md';
}) {
  const variants: Record<string, string> = {
    primary: 'bg-primary text-text1 hover:bg-primary/85',
    outline: 'border bg-card text-text1 hover:border-hover hover:bg-elevated',
    ghost: 'text-text2 hover:bg-elevated hover:text-text1',
  };
  return (
    <button
      type="button"
      className={cx(
        'inline-flex items-center justify-center gap-1.5 rounded-tile font-medium transition-colors duration-150 ease-soft disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' ? 'h-8 px-3 text-body' : 'h-9 px-4 text-body',
        variants[variant],
        className,
      )}
      {...rest}
    />
  );
}
