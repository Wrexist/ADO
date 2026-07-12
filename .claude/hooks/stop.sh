#!/usr/bin/env bash
# Stop reflex — clean exit. Logs the turn end and, if the working tree changed, nudges
# toward the project's finish ritual. Always exits 0 (never forces the agent to continue).
set -uo pipefail
cat >/dev/null 2>&1 || true # drain stdin

here="$(cd "$(dirname "$0")" 2>/dev/null && pwd)"
root="$(cd "$here/../.." 2>/dev/null && pwd)"
dir="$here/../logs"
mkdir -p "$dir" 2>/dev/null || true
printf '%s\tstop\n' "$(date -u +%FT%TZ)" >> "$dir/session.log" 2>/dev/null || true

if [ -n "$(git -C "$root" status --porcelain 2>/dev/null)" ]; then
  echo "loopkit: working tree has changes — run 'npm run verify' (and 'npm run smoke' for UI), then update TASK.md / MEMORY.md / LEARNINGS.md before wrapping." >&2
fi
exit 0
