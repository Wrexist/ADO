import { Link, useLocation } from 'react-router-dom';
import { Icon, cx, type IconName } from '../kit';

/**
 * Command ⇄ Ops switcher. Both dashboards existed but /ops was unreachable from the UI
 * (no link anywhere) — this makes either reachable from either, and from the sub-pages
 * (Settings/Prompts) too. Active reflects the current route.
 */
const VIEWS: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/command', label: 'Command', icon: 'overview' },
  { to: '/ops', label: 'Ops', icon: 'grid' },
];

export function ViewSwitcher() {
  const { pathname } = useLocation();
  return (
    <div className="flex items-center gap-0.5 rounded-full border bg-card p-0.5">
      {VIEWS.map((v) => {
        const active = pathname === v.to;
        return (
          <Link
            key={v.to}
            to={v.to}
            aria-current={active ? 'page' : undefined}
            className={cx(
              'flex items-center gap-1.5 rounded-full px-3 py-1 text-label font-medium transition-colors duration-150 ease-soft',
              active ? 'bg-elevated text-text1' : 'text-text2 hover:text-text1',
            )}
          >
            <Icon name={v.icon} size={13} className={active ? 'text-primary' : 'text-text3'} />
            {v.label}
          </Link>
        );
      })}
    </div>
  );
}
