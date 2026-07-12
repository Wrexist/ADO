import { Link } from 'react-router-dom';
import { cx } from './cx';

/** Section title row with an optional trailing action ("View all →") — a Link or a button. */
export function SectionHeader({
  title,
  action,
  onAction,
  actionTo,
  className,
}: {
  title: string;
  action?: string;
  onAction?: () => void;
  /** When set, the action renders as a Link to this route (preferred for "View all"). */
  actionTo?: string;
  className?: string;
}) {
  const actionCls =
    'rounded-tile text-body text-text2 transition-colors duration-150 ease-soft hover:text-text1';
  return (
    <div className={cx('flex items-baseline justify-between', className)}>
      <h2 className="text-section font-semibold text-text1">{title}</h2>
      {action && actionTo ? (
        <Link to={actionTo} className={actionCls}>
          {action} →
        </Link>
      ) : action ? (
        <button type="button" onClick={onAction} className={actionCls}>
          {action} →
        </button>
      ) : null}
    </div>
  );
}
