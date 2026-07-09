import { cx } from './cx';

/** Filter tab row — active tab is the elevated pill (All (12) · Games (5) · …). */
export function PillTabs({
  tabs,
  activeId,
  onChange,
  className,
}: {
  tabs: Array<{ id: string; label: string; count?: number }>;
  activeId: string;
  onChange?: (id: string) => void;
  className?: string;
}) {
  return (
    <div className={cx('flex items-center gap-1', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          aria-selected={t.id === activeId}
          onClick={() => onChange?.(t.id)}
          className={cx(
            'rounded-full px-3 py-1.5 text-body transition-colors duration-150 ease-soft',
            t.id === activeId
              ? 'bg-elevated font-medium text-text1'
              : 'text-text2 hover:text-text1',
          )}
        >
          {t.label}
          {t.count != null ? <span className="tabular-nums"> ({t.count})</span> : null}
        </button>
      ))}
    </div>
  );
}
