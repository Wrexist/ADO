#!/usr/bin/env bash
# PostToolUse reflex — append a compact log line after a tool runs. Never blocks
# (always exits 0); the log is the raw material for MEMORY.md shift notes.
# (Formatting is intentionally NOT run here — the repo has no formatter and eslint runs
#  in `npm run verify`; enable a per-file `eslint --fix` below only if you want it.)
set -uo pipefail
input=$(cat)

line=$(printf '%s' "$input" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  let j; try { j = JSON.parse(s); } catch { process.exit(0); }
  const t = j.tool_name || "?";
  const i = j.tool_input || {};
  const f = String(i.file_path || i.path || "");
  const c = String(i.command || "").replace(/\s+/g, " ").slice(0, 120);
  process.stdout.write(t + (f ? " " + f : c ? " " + c : ""));
});
' 2>/dev/null) || exit 0

dir="$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)/logs"
mkdir -p "$dir" 2>/dev/null || exit 0
printf '%s\t%s\n' "$(date -u +%FT%TZ)" "$line" >> "$dir/tools.log" 2>/dev/null || true
exit 0
