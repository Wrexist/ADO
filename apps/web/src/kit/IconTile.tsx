import { cx } from './cx';
import { Icon, type IconName } from './Icon';
import { toneTint, type Tone } from './tones';

/** Tinted rounded square holding an icon — stat cards, feed rows, repo cards. */
export function IconTile({
  icon,
  tone = 'violet',
  size = 'md',
  className,
}: {
  icon: IconName;
  tone?: Tone;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = size === 'lg' ? 'h-11 w-11' : size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  const glyph = size === 'lg' ? 20 : size === 'md' ? 18 : 15;
  return (
    <div
      className={cx(
        'flex shrink-0 items-center justify-center rounded-tile',
        box,
        toneTint[tone],
        className,
      )}
    >
      <Icon name={icon} size={glyph} />
    </div>
  );
}
