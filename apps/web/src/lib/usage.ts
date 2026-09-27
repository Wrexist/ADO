/** Reported sums are not a complete total when any counter is missing. */
export function usageLabel(tokens: number, reportedCounters: number, expectedCounters: number): string {
  if (expectedCounters === 0) return 'No runs';
  if (reportedCounters === 0) return 'Unknown';
  const value = tokens >= 1_000_000 ? `${(tokens / 1_000_000).toFixed(1)}M` : tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : String(tokens);
  return reportedCounters < expectedCounters ? `${value} reported · partial` : value;
}
