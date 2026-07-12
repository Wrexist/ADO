/** Time formatting — every label fits a reserved slot so live updates never reflow. */

export function timeAgo(ts: string, now = Date.now()): string {
  const diff = Math.max(0, now - new Date(ts).getTime());
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

/** "45s" / "2m 15s" (seconds zero-padded — the fixed-width mask, council B3). */
export function durationLabel(elapsedSec: number): string {
  if (elapsedSec < 60) return `${elapsedSec}s`;
  const m = Math.floor(elapsedSec / 60);
  const s = elapsedSec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

/** "≈2.4M" — approximate token display; null renders the honest ≈— (council S2). */
export function approxTokens(n: number | null): string {
  if (n == null) return '≈—';
  if (n >= 1_000_000) return `≈${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `≈${(n / 1_000).toFixed(0)}K`;
  return `≈${n}`;
}
