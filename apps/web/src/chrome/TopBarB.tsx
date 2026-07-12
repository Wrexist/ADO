import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../kit';
import { usePalette } from '../lib/palette';
import { ConnectionBadge } from './ConnectionBadge';
import { ViewSwitcher } from './ViewSwitcher';

/**
 * View B top bar — "AI CONTROL / DASHBOARD" logo block left; search pill,
 * bell (red dot), chat, settings, avatar right. ⌘K focuses search here too.
 */
function BarIcon({ icon, label, to }: { icon: IconName; label: string; to: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-tile text-text2 transition-colors duration-150 ease-soft hover:bg-elevated hover:text-text1"
    >
      <Icon name={icon} size={16} />
    </Link>
  );
}

export function TopBarB() {
  const openPalette = usePalette((s) => s.setOpen);

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
        <ViewSwitcher />
        <ConnectionBadge />
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="relative flex h-9 w-[240px] items-center rounded-full border bg-panel pl-9 pr-12 text-left text-body text-text3 transition-colors duration-150 ease-soft hover:border-hover"
        >
          <Icon name="search" size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text3" />
          Search anything…
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border bg-elevated px-1.5 py-0.5 text-[10px] text-text3">
            ⌘K
          </kbd>
        </button>
        <BarIcon icon="bell" label="Notifications" to="/activity" />
        <BarIcon icon="chat" label="Messages" to="/planned/messages" />
        <Link
          to="/settings"
          aria-label="Settings"
          className="flex h-9 w-9 items-center justify-center rounded-tile text-text2 transition-colors duration-150 ease-soft hover:bg-elevated hover:text-text1"
        >
          <Icon name="settings" size={16} />
        </Link>
        <Link
          to="/settings"
          aria-label="Account settings"
          className="ml-1 flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-label font-semibold text-primary transition-colors duration-150 ease-soft hover:bg-primary/30"
        >
          IM
        </Link>
      </div>
    </header>
  );
}
