import { Icon, type IconName } from './Icon';

/**
 * Honest empty/absent state — used whenever a widget has no real data.
 * Missing data renders as missing, never as a plausible number.
 */
export function EmptyState({
  icon = 'sparkle',
  title,
  hint,
}: {
  icon?: IconName;
  title: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-8 text-center">
      <span className="flex h-9 w-9 items-center justify-center rounded-tile bg-elevated text-text3">
        <Icon name={icon} size={16} />
      </span>
      <p className="text-body text-text2">{title}</p>
      {hint ? <p className="max-w-[36ch] text-label text-text3">{hint}</p> : null}
    </div>
  );
}
