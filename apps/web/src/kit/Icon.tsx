/**
 * Minimal geometric icon set (stroke, currentColor). Deliberately simple: P1 needs the
 * right component in the right place; glyph fidelity is refined in the P3.5 pixel pass.
 */
import type { ReactNode } from 'react';

export type IconName =
  | 'overview'
  | 'repos'
  | 'games'
  | 'agents'
  | 'templates'
  | 'keys'
  | 'integrations'
  | 'code'
  | 'wand'
  | 'database'
  | 'chart'
  | 'rocket'
  | 'pipeline'
  | 'releases'
  | 'settings'
  | 'team'
  | 'billing'
  | 'search'
  | 'plus'
  | 'calendar'
  | 'bell'
  | 'chevronDown'
  | 'dots'
  | 'grid'
  | 'list'
  | 'star'
  | 'branch'
  | 'check'
  | 'clock'
  | 'cloud'
  | 'health'
  | 'lock'
  | 'workflow'
  | 'send'
  | 'user'
  | 'github'
  | 'chat'
  | 'sparkle'
  | 'tokens';

const PATHS: Record<IconName, ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="2" />
      <rect x="13" y="3" width="8" height="8" rx="2" />
      <rect x="3" y="13" width="8" height="8" rx="2" />
      <rect x="13" y="13" width="8" height="8" rx="2" />
    </>
  ),
  repos: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />,
  games: (
    <>
      <rect x="2" y="8" width="20" height="9.5" rx="4.75" />
      <path d="M7.5 10.5v4M5.5 12.5h4" />
      <circle cx="15.5" cy="11.5" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="18" cy="14" r="0.9" fill="currentColor" stroke="none" />
    </>
  ),
  agents: (
    <>
      <rect x="5" y="9" width="14" height="9.5" rx="3" />
      <path d="M12 9V6" />
      <circle cx="12" cy="4.5" r="1.3" />
      <circle cx="9.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="13.5" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  templates: (
    <>
      <path d="M12 3l9 5-9 5-9-5z" />
      <path d="M3 13.5l9 5 9-5" />
    </>
  ),
  keys: (
    <>
      <circle cx="8" cy="15" r="4" />
      <path d="M11 12l8.5-8.5M16 7l2.5 2.5" />
    </>
  ),
  integrations: (
    <>
      <path d="M9 7V3M15 7V3" />
      <path d="M7 7h10v4.5a5 5 0 0 1-10 0z" />
      <path d="M12 16.5V21" />
    </>
  ),
  code: <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />,
  wand: (
    <>
      <path d="M14.5 5.5l4 4L7 21l-4-4z" />
      <path d="M16 3l.6 1.7L18.5 5l-1.9.6L16 7.5l-.6-1.9L13.5 5l1.9-.3z" />
    </>
  ),
  database: (
    <>
      <ellipse cx="12" cy="5.5" rx="8" ry="2.8" />
      <path d="M4 5.5v13c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9v-13" />
      <path d="M4 12c0 1.6 3.6 2.9 8 2.9s8-1.3 8-2.9" />
    </>
  ),
  chart: (
    <>
      <path d="M5 20v-6M11 20V6M17 20v-9" />
      <path d="M3 20h18" />
    </>
  ),
  rocket: (
    <>
      <path d="M12 2.5c2.6 1.9 4 5.2 4 8.5l2.4 2.5-3 .8-.8 3-2.6-2.4-2.6 2.4-.8-3-3-.8L8 11c0-3.3 1.4-6.6 4-8.5z" />
      <circle cx="12" cy="9" r="1.4" />
    </>
  ),
  pipeline: (
    <>
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
      <path d="M7 12h3M14 12h3" />
    </>
  ),
  releases: (
    <>
      <path d="M20.6 13.4L11 3.8H4v7l9.6 9.6a2 2 0 0 0 2.8 0l4.2-4.2a2 2 0 0 0 0-2.8z" />
      <circle cx="7.5" cy="7.3" r="1.1" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <circle cx="17" cy="9" r="2.4" />
      <path d="M17.5 14.6c2.4.5 4 2.7 4 5.4" />
    </>
  ),
  billing: (
    <>
      <rect x="3" y="6" width="18" height="13" rx="2" />
      <path d="M3 10.5h18M7 15h4" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M16.5 16.5L21 21" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9.5h18M8 3v4M16 3v4" />
    </>
  ),
  bell: (
    <>
      <path d="M6 9.5a6 6 0 0 1 12 0c0 4.8 1.8 6 1.8 6H4.2s1.8-1.2 1.8-6z" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </>
  ),
  chevronDown: <path d="M6 9.5l6 6 6-6" />,
  dots: (
    <>
      <circle cx="12" cy="5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  grid: (
    <>
      <rect x="4" y="4" width="7" height="7" rx="1.5" />
      <rect x="13" y="4" width="7" height="7" rx="1.5" />
      <rect x="4" y="13" width="7" height="7" rx="1.5" />
      <rect x="13" y="13" width="7" height="7" rx="1.5" />
    </>
  ),
  list: (
    <>
      <path d="M8 6h13M8 12h13M8 18h13" />
      <circle cx="4" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4" cy="18" r="1" fill="currentColor" stroke="none" />
    </>
  ),
  star: <path d="M12 3.5l2.6 5.3 5.9.9-4.2 4.1 1 5.8-5.3-2.8-5.3 2.8 1-5.8-4.2-4.1 5.9-.9z" />,
  branch: (
    <>
      <circle cx="6" cy="6" r="2" />
      <circle cx="6" cy="18" r="2" />
      <circle cx="18" cy="7" r="2" />
      <path d="M6 8v8M18 9c0 5-8 3.5-10 6" />
    </>
  ),
  check: <path d="M5 13l4 4L19 7" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2" />
    </>
  ),
  cloud: <path d="M7 18.5a4.5 4.5 0 1 1 .9-8.9A6 6 0 0 1 19.5 11 3.8 3.8 0 0 1 19 18.5z" />,
  health: <path d="M3 12h4l2-6 4 12 2-6h6" />,
  lock: (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </>
  ),
  workflow: <path d="M13 2.5L4.5 14H11l-1 7.5L18.5 10H12z" />,
  send: (
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4z" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" />
    </>
  ),
  github: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 16v4M8.5 19c-2.5.5-3-1.5-4-2" />
      <path d="M15.5 20v-2.5a2.5 2.5 0 0 0-.7-1.9c2.3-.3 4.2-1.2 4.2-4.6a3.6 3.6 0 0 0-1-2.5 3.3 3.3 0 0 0-.1-2.5s-.8-.3-2.7 1a9.4 9.4 0 0 0-4.4 0c-1.9-1.3-2.7-1-2.7-1a3.3 3.3 0 0 0-.1 2.5 3.6 3.6 0 0 0-1 2.5c0 3.4 1.9 4.3 4.2 4.6a2.5 2.5 0 0 0-.7 1.9V20" />
    </>
  ),
  chat: <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H3l3-3.2A8.5 8.5 0 1 1 21 11.5z" />,
  sparkle: <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />,
  tokens: (
    <>
      <path d="M5 20V12M12 20V5M19 20v-5" />
      <circle cx="5" cy="9" r="1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="2.8" r="1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" />
    </>
  ),
};

export function Icon({
  name,
  size = 16,
  className,
}: {
  name: IconName;
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
