import { Link, useLocation } from 'react-router-dom';
import { CountBadge, Icon, type IconName, cx } from '../kit';
import { useBus } from '../store/bus';
import { sidebarCounts, isNavActive } from '../lib/selectors';

/**
 * View A sidebar — 224px, grouped nav with 11px uppercase eyebrows, count badges,
 * violet-tinted active pill, user card at the bottom. Counts are DERIVED from the
 * bus store (scanner categories after 2.2; demo seed until then).
 */
type NavEntry = { icon: IconName; label: string; count?: number; active?: boolean; to?: string };
type NavGroup = { eyebrow?: string; items: NavEntry[] };

const buildGroups = (counts: { repositories: number; games: number; agents: number }): NavGroup[] => [
  { items: [{ icon: 'overview', label: 'Overview', to: '/command' }] },
  {
    eyebrow: 'Workspace',
    items: [
      { icon: 'repos', label: 'Repositories', count: counts.repositories, to: '/repositories' },
      { icon: 'games', label: 'Games', count: counts.games, to: '/repositories?cat=game' },
      { icon: 'agents', label: 'Agents', count: counts.agents, to: '/agents' },
      { icon: 'templates', label: 'Templates', to: '/planned/templates' },
      { icon: 'keys', label: 'Secrets & Keys', to: '/settings' },
      { icon: 'integrations', label: 'Integrations', to: '/settings' },
    ],
  },
  {
    eyebrow: 'AI Tools',
    items: [
      { icon: 'chat', label: 'Prompt Library', to: '/prompts' },
      { icon: 'workflow', label: 'Workflows', to: '/workflows' },
      { icon: 'pipeline', label: 'Automations', to: '/automations' },
      { icon: 'code', label: 'Code Assistant', to: '/planned/code-assistant' },
      { icon: 'games', label: 'Game Builder', to: '/planned/game-builder' },
      { icon: 'wand', label: 'UI Generator', to: '/planned/ui-generator' },
      { icon: 'database', label: 'Database', to: '/planned/database' },
      { icon: 'chart', label: 'Analytics', to: '/analytics' },
    ],
  },
  {
    eyebrow: 'Deploy & Release',
    items: [
      { icon: 'rocket', label: 'Deployments', to: '/deployments' },
      { icon: 'health', label: 'Performance', to: '/performance' },
      { icon: 'pipeline', label: 'CI/CD Pipelines', to: '/planned/cicd-pipelines' },
      { icon: 'releases', label: 'Releases', to: '/deployments' },
    ],
  },
  {
    eyebrow: 'Settings',
    items: [
      { icon: 'rocket', label: 'Setup', to: '/setup' },
      { icon: 'settings', label: 'Workspace Settings', to: '/settings' },
    ],
  },
];

function NavItem({ icon, label, count, active, to }: NavEntry) {
  const cls = cx(
    'flex w-full items-center gap-2.5 rounded-tile px-3 py-2 text-body transition-colors duration-150 ease-soft',
    active ? 'bg-primary/15 font-medium text-text1' : 'text-text2 hover:bg-elevated hover:text-text1',
  );
  const inner = (
    <>
      <Icon name={icon} size={16} className={active ? 'text-primary' : 'text-text3'} />
      <span className="truncate">{label}</span>
      {count != null ? <CountBadge>{count}</CountBadge> : null}
    </>
  );
  return to ? (
    <Link to={to} className={cls}>{inner}</Link>
  ) : (
    <button type="button" className={cls}>{inner}</button>
  );
}

const isPlanned = (to?: string): boolean => Boolean(to?.startsWith('/planned/'));

/** Collapsed, dimmed disclosure for not-yet-built (/planned/*) destinations. Honest: they
 *  still open their "not wired yet" page — they're just out of the way of what works today. */
function SoonDisclosure({ items }: { items: NavEntry[] }) {
  return (
    <details className="group mt-2">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 pb-1 pt-5 text-label font-medium uppercase tracking-wider text-text3 hover:text-text2 [&::-webkit-details-marker]:hidden">
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

export function SidebarA() {
  // Select the stable state reference; derive OUTSIDE the selector (a derived object
  // inside the selector would change identity every call → infinite re-render).
  const state = useBus((s) => s.state);
  const location = useLocation();
  const path = location.pathname;
  const raw = buildGroups(sidebarCounts(state));
  // Real destinations stay in their groups; unbuilt (/planned/*) items collapse into one
  // dimmed "Soon" disclosure so the working surface stands out.
  const groups = raw.map((g) => ({
    ...g,
    items: g.items.filter((it) => !isPlanned(it.to)).map((it) => ({ ...it, active: isNavActive(it.to, path) || it.active })),
  }));
  const planned = raw.flatMap((g) => g.items).filter((it) => isPlanned(it.to));
  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r bg-panel px-3 pb-4 pt-3">
      <nav className="flex flex-1 flex-col gap-0.5">
        {groups.map((group, gi) => (
          <div key={group.eyebrow ?? gi} className="flex flex-col gap-0.5">
            {group.eyebrow ? (
              <p className="px-3 pb-1 pt-5 text-label font-medium uppercase tracking-wider text-text3">
                {group.eyebrow}
              </p>
            ) : null}
            {group.items.map((item) => (
              <NavItem key={item.label} {...item} />
            ))}
          </div>
        ))}
        {planned.length > 0 ? <SoonDisclosure items={planned} /> : null}
      </nav>

      {/* user card */}
      <Link
        to="/settings"
        className="mt-6 flex w-full items-center gap-2.5 rounded-tile border bg-card px-3 py-2.5 text-left transition-colors duration-150 ease-soft hover:border-hover"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-label font-semibold text-primary">
          IM
        </span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-body font-medium text-text1">Isac Molin</span>
          <span className="block text-label text-text3">Admin</span>
        </span>
        <Icon name="chevronDown" size={14} className="text-text3" />
      </Link>
    </aside>
  );
}
