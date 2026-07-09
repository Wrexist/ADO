import { useEffect, useRef } from 'react';
import { Icon, type IconName } from '../kit';

/**
 * View B top bar — "AI CONTROL / DASHBOARD" logo block left; search pill,
 * bell (red dot), chat, settings, avatar right. ⌘K focuses search here too.
 */
function BarIcon({ icon, label, alert }: { icon: IconName; label: string; alert?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-tile text-text2 transition-colors duration-150 ease-soft hover:bg-elevated hover:text-text1"
    >
      <Icon name={icon} size={16} />
      {alert ? (
        <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger ring-2 ring-app" />
      ) : null}
    </button>
  );
}

export function TopBarB() {
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
    <header className="flex h-16 shrink-0 items-center justify-between gap-6 border-b bg-app px-5">
      {/* logo block */}
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-tile border bg-card text-primary">
          <Icon name="overview" size={16} />
        </span>
        <div className="leading-tight">
          <p className="whitespace-nowrap text-body font-semibold tracking-wide text-text1">
            AI CONTROL
          </p>
          <p className="whitespace-nowrap text-label uppercase tracking-[0.18em] text-text3">
            Dashboard
          </p>
        </div>
      </div>

      {/* right cluster */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="relative">
          <Icon
            name="search"
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text3"
          />
          <input
            ref={searchRef}
            type="search"
            placeholder="Search anything…"
            className="h-9 w-[240px] rounded-full border bg-panel pl-9 pr-12 text-body text-text1 placeholder:text-text3 focus:border-primary/50 focus:outline-none"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-elevated px-1.5 py-0.5 text-[10px] text-text3">
            ⌘K
          </kbd>
        </div>
        <BarIcon icon="bell" label="Notifications" alert />
        <BarIcon icon="chat" label="Messages" />
        <BarIcon icon="settings" label="Settings" />
        <span className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-label font-semibold text-primary">
          IM
        </span>
      </div>
    </header>
  );
}
