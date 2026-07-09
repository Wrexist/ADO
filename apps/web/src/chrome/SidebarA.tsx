import { MOCK_VIEW_A } from '@ado/shared/mock';
import { CountBadge, Icon, type IconName, cx } from '../kit';

/**
 * View A sidebar — 224px, grouped nav with 11px uppercase eyebrows, count badges,
 * violet-tinted active pill, user card at the bottom. Counts come from the mock
 * module (Phase 2 wires them to scanner categories per DATA_MAP).
 */
type NavEntry = { icon: IconName; label: string; count?: number; active?: boolean };
type NavGroup = { eyebrow?: string; items: NavEntry[] };

const { sidebarCounts } = MOCK_VIEW_A;

const GROUPS: NavGroup[] = [
  { items: [{ icon: 'overview', label: 'Overview', active: true }] },
  {
    eyebrow: 'Workspace',
    items: [
      { icon: 'repos', label: 'Repositories', count: sidebarCounts.repositories },
      { icon: 'games', label: 'Games', count: sidebarCounts.games },
      { icon: 'agents', label: 'Agents', count: sidebarCounts.agents },
      { icon: 'templates', label: 'Templates' },
      { icon: 'keys', label: 'Secrets & Keys' },
      { icon: 'integrations', label: 'Integrations' },
    ],
  },
  {
    eyebrow: 'AI Tools',
    items: [
      { icon: 'code', label: 'Code Assistant' },
      { icon: 'games', label: 'Game Builder' },
      { icon: 'wand', label: 'UI Generator' },
      { icon: 'database', label: 'Database' },
      { icon: 'chart', label: 'Analytics' },
    ],
  },
  {
    eyebrow: 'Deploy & Release',
    items: [
      { icon: 'rocket', label: 'Deployments' },
      { icon: 'pipeline', label: 'CI/CD Pipelines' },
      { icon: 'releases', label: 'Releases' },
    ],
  },
  {
    eyebrow: 'Settings',
    items: [
      { icon: 'settings', label: 'Workspace Settings' },
      { icon: 'team', label: 'Team' },
      { icon: 'billing', label: 'Billing' },
    ],
  },
];

function NavItem({ icon, label, count, active }: NavEntry) {
  return (
    <button
      type="button"
      className={cx(
        'flex w-full items-center gap-2.5 rounded-tile px-3 py-2 text-body transition-colors duration-150 ease-soft',
        active
          ? 'bg-primary/15 font-medium text-text1'
          : 'text-text2 hover:bg-elevated hover:text-text1',
      )}
    >
      <Icon name={icon} size={16} className={active ? 'text-primary' : 'text-text3'} />
      <span className="truncate">{label}</span>
      {count != null ? <CountBadge>{count}</CountBadge> : null}
    </button>
  );
}

export function SidebarA() {
  return (
    <aside className="flex w-[224px] shrink-0 flex-col border-r bg-panel px-3 pb-4 pt-3">
      <nav className="flex flex-1 flex-col gap-0.5">
        {GROUPS.map((group, gi) => (
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
      </nav>

      {/* user card */}
      <button
        type="button"
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
      </button>
    </aside>
  );
}
