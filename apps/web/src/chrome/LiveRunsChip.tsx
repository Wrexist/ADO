import { Link } from 'react-router-dom';
import { useBus } from '../store/bus';
import { runningAgents } from '../lib/selectors';

/**
 * Top-bar live-run indicator — renders NOTHING while no agent is running (the bar keeps
 * its reference layout), and a pulsing chip while one or more are. A single run deep-links
 * to its expanded history row (`?run=`); several link to the Agents page plainly — the
 * agents slice carries no start time, so "newest" would be a guessed ordering (conv. 1).
 */
export function LiveRunsChip() {
  // Select the stable state ref, derive after — a filtering selector would return a fresh
  // array every call and send Zustand's getSnapshot into an infinite re-render loop.
  const state = useBus((s) => s.state);
  const running = runningAgents(state);
  if (running.length === 0) return null;

  const to = running.length === 1 ? `/agents?run=${encodeURIComponent(running[0].id)}` : '/agents';
  const label = running.length === 1 ? '1 agent running' : `${running.length} agents running`;

  return (
    <Link
      to={to}
      aria-label={`${label} — view run`}
      className="flex h-9 shrink-0 items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-3 text-label font-medium text-primary transition-colors duration-150 ease-soft hover:border-primary/70"
    >
      <span aria-hidden className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60 motion-reduce:animate-none" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-primary" />
      </span>
      {label}
    </Link>
  );
}
