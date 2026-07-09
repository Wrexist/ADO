import { cx } from './cx';

/** Section title row with optional trailing action ("View all →"). */
export function SectionHeader({
  title,
  action,
  onAction,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cx('flex items-baseline justify-between', className)}>
      <h2 className="text-section font-semibold text-text1">{title}</h2>
      {action ? (
        <button
          type="button"
          onClick={onAction}
          className="rounded-tile text-body text-text2 transition-colors duration-150 ease-soft hover:text-text1"
        >
          {action} →
        </button>
      ) : null}
    </div>
  );
}
