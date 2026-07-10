import { useEffect, useRef } from 'react';
import { Icon, type IconName, cx } from '../kit';
import { ConnectionBadge } from './ConnectionBadge';

/**
 * View A top bar — logo + title block, centered ⌘K search, actions, avatar.
 * ⌘K / Ctrl+K focuses the search input (quality floor).
 */
function TopBarButton({ icon, label, badge }: { icon: IconName; label: string; badge?: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-tile border bg-card text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
    >
      <Icon name={icon} size={16} />
      {badge ? (
        <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-medium text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}

export function TopBarA() {
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <header className="flex h-16 shrink-0 items-center gap-6 border-b bg-app px-5">
      {/* logo block */}
      <div className="flex shrink-0 items-center gap-3">
        <span
          aria-hidden
          className="h-8 w-8 shrink-0 rounded-full bg-gradient-to-br from-gradient-from via-primary to-gradient-to"
          style={{ maskImage: 'radial-gradient(circle at center, transparent 32%, black 34%)', WebkitMaskImage: 'radial-gradient(circle at center, transparent 32%, black 34%)' }}
        />
        <div className="leading-tight">
          <p className="whitespace-nowrap text-body font-semibold text-text1">AI Control Center</p>
          <p className="whitespace-nowrap text-label text-text3">Command everything. Build anything.</p>
        </div>
      </div>

      {/* centered search */}
      <div className="mx-auto w-full max-w-[560px]">
        <div className="relative">
          <Icon
            name="search"
            size={15}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text3"
          />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search repositories, projects, agents…"
            className={cx(
              'h-9 w-full rounded-full border bg-panel pl-10 pr-16 text-body text-text1',
              'placeholder:text-text3 focus:border-primary/50 focus:outline-none',
            )}
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded border bg-elevated px-1.5 py-0.5 text-[10px] text-text3">
            ⌘ K
          </kbd>
        </div>
      </div>

      {/* actions + avatar */}
      <div className="flex shrink-0 items-center gap-2">
        <ConnectionBadge />
        <TopBarButton icon="plus" label="Create" />
        <TopBarButton icon="calendar" label="Calendar" />
        <TopBarButton icon="bell" label="Notifications" badge="3" />
        <div className="relative ml-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-label font-semibold text-primary">
            IM
          </span>
          <span className="absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full bg-success ring-2 ring-app" />
        </div>
      </div>
    </header>
  );
}
