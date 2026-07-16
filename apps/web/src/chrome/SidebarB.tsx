import { Link, useLocation } from 'react-router-dom';
import { Icon, cx, type IconName } from '../kit';
import { isNavActive } from '../lib/selectors';

/**
 * View B sidebar — 200px, denser nav (WORKSPACE / AI TOOLS / MONITORING / SETTINGS),
 * Pro Plan card pinned at the bottom (honest static placeholder per DATA_MAP).
 */
type NavEntry = { icon: IconName; label: string; active?: boolean; to?: string };
type NavGroup = { eyebrow?: string; items: NavEntry[] };

const GROUPS: NavGroup[] = [
  { items: [{ icon: 'overview', label: 'Overview', to: '/ops' }] },
  {
    eyebrow: 'Workspace',
    items: [
      { icon: 'repos', label: 'Repositories', to: '/repositories' },
      { icon: 'games', label: 'Games', to: '/repositories?cat=game' },
      { icon: 'grid', label: 'Apps', to: '/repositories?cat=app' },
      { icon: 'cloud', label: 'Websites', to: '/repositories?cat=web' },
      { icon: 'integrations', label: 'Services', to: '/repositories?cat=service' },
      { icon: 'database', label: 'Databases', to: '/planned/database' },
      { icon: 'lock', label: 'Secrets', to: '/settings' },
    ],
  },
  {
    eyebrow: 'AI Tools',
    items: [
      { icon: 'agents', label: 'AI Agents', to: '/agents' },
      { icon: 'workflow', label: 'Automations', to: '/automations' },
      { icon: 'pipeline', label: 'Workflows', to: '/workflows' },
      { icon: 'chat', label: 'Prompts', to: '/prompts' },
      { icon: 'sparkle', label: 'Models', to: '/planned/models' },
    ],
  },
  {
    eyebrow: 'Monitoring',
    items: [
      { icon: 'chart', label: 'Analytics', to: '/analytics' },
      { icon: 'check', label: 'Reviews', to: '/reviews' },
      { icon: 'health', label: 'Performance', to: '/performance' },
      { icon: 'sparkle', label: 'Diagnostics', to: '/diagnostics' },
      { icon: 'list', label: 'Activity', to: '/activity' },
      { icon: 'bell', label: 'Alerts', to: '/planned/alerts' },
    ],
  },
  {
    eyebrow: 'Settings',
    items: [
      { icon: 'rocket', label: 'Setup', to: '/setup' },
      { icon: 'integrations', label: 'Integrations', to: '/settings' },
      { icon: 'settings', label: 'Settings', to: '/settings' },
    ],
  },
];

function NavItem({ icon, label, active, to }: NavEntry) {
  const cls = cx(
    'flex w-full items-center gap-2.5 rounded-tile px-3 py-[7px] text-body transition-colors duration-150 ease-soft',
    active ? 'bg-primary/15 font-medium text-text1' : 'text-text2 hover:bg-elevated hover:text-text1',
  );
  const inner = (
    <>
      <Icon name={icon} size={15} className={active ? 'text-primary' : 'text-text3'} />
      <span className="truncate">{label}</span>
    </>
  );
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button type="button" className={cls}>{inner}</button>
  );
}

const isPlanned = (to?: string): boolean => Boolean(to?.startsWith('/planned/'));

/** Collapsed, dimmed disclosure for not-yet-built destinations (keeps the live nav clean). */
function SoonDisclosure({ items }: { items: NavEntry[] }) {
  return (
    <details className="group mt-1.5">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 pb-1 pt-4 text-label font-medium uppercase tracking-wider text-text3 hover:text-text2 [&::-webkit-details-marker]:hidden">
        <Icon name="chevronDown" size={12} className="-rotate-90 transition-transform duration-150 ease-soft group-open:rotate-0" />
        Soon ({items.length})
      </summary>
      <div className="flex flex-col gap-0.5 opacity-55">
        {items.map((item) => (
          <NavItem key={item.label} {...item} />
        ))}
      </div>
    </details>
  );
}

export function SidebarB() {
  const location = useLocation();
  const groups = GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => !isPlanned(it.to)) }));
  const planned = GROUPS.flatMap((g) => g.items).filter((it) => isPlanned(it.to));
  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r bg-panel px-3 pb-4 pt-3">
      <nav className="flex flex-1 flex-col gap-0.5">
        {groups.map((group, gi) => (
          <div key={group.eyebrow ?? gi} className="flex flex-col gap-0.5">
            {group.eyebrow ? (
              <p className="px-3 pb-1 pt-4 text-label font-medium uppercase tracking-wider text-text3">
                {group.eyebrow}
              </p>
            ) : null}
            {group.items.map((item) => (
              <NavItem
                key={item.label}
                {...item}
                active={isNavActive(item.to, location.pathname) || item.active}
              />
            ))}
          </div>
        ))}
        {planned.length > 0 ? <SoonDisclosure items={planned} /> : null}
      </nav>
    </aside>
  );
}
