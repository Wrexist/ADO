import { Link, useLocation } from 'react-router-dom';
import { Button, Card, Icon, IconTile, cx, type IconName } from '../kit';

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
      { icon: 'repos', label: 'Repositories' },
      { icon: 'games', label: 'Games' },
      { icon: 'grid', label: 'Apps' },
      { icon: 'cloud', label: 'Websites' },
      { icon: 'integrations', label: 'Services' },
      { icon: 'database', label: 'Databases' },
      { icon: 'lock', label: 'Secrets', to: '/settings' },
    ],
  },
  {
    eyebrow: 'AI Tools',
    items: [
      { icon: 'agents', label: 'AI Agents' },
      { icon: 'workflow', label: 'Automation' },
      { icon: 'pipeline', label: 'Workflows' },
      { icon: 'chat', label: 'Prompts' },
      { icon: 'sparkle', label: 'Models' },
    ],
  },
  {
    eyebrow: 'Monitoring',
    items: [
      { icon: 'chart', label: 'Analytics' },
      { icon: 'list', label: 'Logs' },
      { icon: 'bell', label: 'Alerts' },
      { icon: 'health', label: 'Performance' },
    ],
  },
  {
    eyebrow: 'Settings',
    items: [
      { icon: 'team', label: 'Team' },
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

export function SidebarB() {
  const location = useLocation();
  // Static copy — honest placeholder card per DATA_MAP ("not wired yet" > fake feature).
  const proPlan = { title: 'Pro Plan', body: 'Unlimited access', cta: 'Upgrade' };
  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r bg-panel px-3 pb-4 pt-3">
      <nav className="flex flex-1 flex-col gap-0.5">
        {GROUPS.map((group, gi) => (
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
                active={item.to ? location.pathname === item.to : item.active}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Pro Plan — static v1 placeholder ("not wired yet" > fake feature) */}
      <Card className="mt-4 border-primary/25 bg-primary/10 p-3.5">
        <div className="flex items-center gap-2.5">
          <IconTile icon="sparkle" tone="violet" size="sm" />
          <div className="leading-tight">
            <p className="text-body font-semibold text-text1">{proPlan.title}</p>
            <p className="text-label text-text2">{proPlan.body}</p>
          </div>
        </div>
        <Button size="sm" className="mt-3 w-full">
          {proPlan.cta}
        </Button>
      </Card>
    </aside>
  );
}
