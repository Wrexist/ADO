import { NavLink } from 'react-router-dom';
import { ThemeToggle } from './ThemeToggle';
export function MobileNav() {
  return <header className="sticky top-0 z-40 border-b bg-panel px-3 pb-3 text-body text-text1 lg:hidden"><div className="flex items-center justify-between"><span className="text-section font-semibold tracking-tight">ControlOS</span><ThemeToggle /></div><nav aria-label="Mobile navigation" className="flex flex-wrap gap-2">
    {([['/command', 'Overview'], ['/today', 'Today'], ['/projects', 'Projects'], ['/universe', 'Universe'], ['/tasks', 'Inbox'], ['/agents', 'Jobs'], ['/activity', 'Activity'], ['/settings', 'Settings']] as const).map(([to, label]) =>
      <NavLink key={to} to={to} className={({ isActive }) => `flex min-h-11 items-center rounded-tile px-3 py-2 ${isActive ? 'bg-elevated font-medium text-text1' : 'text-text2'}`}>{label}</NavLink>)}
  </nav></header>;
}
