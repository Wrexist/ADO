import { NavLink } from 'react-router-dom';
export function MobileNav() {
  return <nav aria-label="Mobile navigation" className="sticky top-0 z-40 flex flex-wrap gap-2 border-b bg-app p-3 text-body text-text1 lg:hidden">
    {([['/command', 'Overview'], ['/projects', 'Projects'], ['/tasks', 'Inbox'], ['/agents', 'Jobs'], ['/activity', 'Activity'], ['/settings', 'Settings']] as const).map(([to, label]) =>
      <NavLink key={to} to={to} className={({ isActive }) => `rounded px-3 py-2 ${isActive ? 'bg-primary/20 text-primary' : 'bg-card'}`}>{label}</NavLink>)}
  </nav>;
}
