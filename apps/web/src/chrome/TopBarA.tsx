import { Link } from 'react-router-dom';
import { Icon, type IconName } from '../kit';
import { usePalette } from '../lib/palette';
import { ConnectionBadge } from './ConnectionBadge';
import { ViewSwitcher } from './ViewSwitcher';

/**
 * View A top bar — logo + title block, centered ⌘K search, actions, avatar.
 * ⌘K / Ctrl+K focuses the search input (quality floor).
 */
function TopBarButton({ icon, label, to }: { icon: IconName; label: string; to: string }) {
  return (
    <Link
      to={to}
      aria-label={label}
      className="relative flex h-9 w-9 items-center justify-center rounded-tile border bg-card text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
    >
      <Icon name={icon} size={16} />
    </Link>
  );
}

export function TopBarA() {
  const openPalette = usePalette((s) => s.setOpen);

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

      {/* centered search — opens the command palette (⌘K) */}
      <div className="mx-auto w-full max-w-[560px]">
        <button
          type="button"
          onClick={() => openPalette(true)}
          className="relative flex h-9 w-full items-center rounded-full border bg-panel pl-10 pr-16 text-left text-body text-text3 transition-colors duration-150 ease-soft hover:border-hover"
        >
          <Icon name="search" size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-text3" />
          Search repositories, projects, agents…
          <kbd className="pointer-events-none absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded border bg-elevated px-1.5 py-0.5 text-[10px] text-text3">
            ⌘ K
          </kbd>
        </button>
      </div>

      {/* actions + avatar */}
      <div className="flex shrink-0 items-center gap-2">
        <ViewSwitcher />
        <ConnectionBadge />
        <TopBarButton icon="plus" label="Add project" to="/repositories?add=1" />
        <TopBarButton icon="calendar" label="Calendar" to="/planned/calendar" />
        <TopBarButton icon="bell" label="Notifications" to="/activity" />
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
