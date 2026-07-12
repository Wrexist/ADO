import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { TopBarA } from './TopBarA';
import { StaleBanner } from './StaleBanner';

/**
 * Standard chrome for a full-page sub-view (Repositories, Agents, Deployments, Activity,
 * planned-feature placeholders). TopBarA carries the Command⇄Ops switcher, so "← Dashboard"
 * defaulting to /command is fine — either view is one click away.
 */
export function PageShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen min-w-[1280px] bg-app text-text1">
      <TopBarA />
      <StaleBanner />
      <main className="mx-auto max-w-[1100px] px-8 py-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-title font-semibold text-text1">{title}</h1>
            {subtitle ? <p className="mt-1 max-w-[72ch] text-body text-text2">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {actions}
            <Link
              to="/command"
              className="rounded-tile border bg-card px-3 py-2 text-body text-text2 transition-colors duration-150 ease-soft hover:border-hover hover:text-text1"
            >
              ← Dashboard
            </Link>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}
