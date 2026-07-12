#!/usr/bin/env bash
# PreToolUse reflex — guard a small set of clearly-dangerous actions before they run.
# Exit 2 + stderr = block the call and tell Claude why. Everything else = allow (exit 0).
# FAIL-OPEN by design: a parsing hiccup must never wedge the session — permissions and
# CLAUDE.md are the real gate; this is just a fast reflex on top.
set -uo pipefail
input=$(cat)

decision=$(printf '%s' "$input" | node -e '
let s = "";
process.stdin.on("data", (d) => (s += d)).on("end", () => {
  let j; try { j = JSON.parse(s); } catch { process.exit(0); }
  const t = j.tool_name || "";
  const i = j.tool_input || {};
  const f = String(i.file_path || i.path || "");
  const c = String(i.command || "");
  const block = (r) => { process.stdout.write("BLOCK: " + r); process.exit(0); };

  // 1) never edit/write secrets or local data through the file tools
  if (t === "Edit" || t === "Write" || t === "NotebookEdit") {
    if (/(^|\/)\.env(\.|$)/.test(f) || /(^|\/)connections\.json$/.test(f) || /\.sqlite(-|$)/.test(f))
      block("editing a secret/data file is blocked (" + f + ") — secrets live in .env / data/ (gitignored); change .env.example or the store code instead");
  }

  // 2) dangerous shell. Anchor command-name patterns to COMMAND POSITION (start, or right
  // after a shell separator ; && || |) so a trigger word inside a quoted string / heredoc /
  // commit message can never false-positive. Whitespace is collapsed first, so heredoc
  // bodies fold into mid-string text (never at a command boundary).
  if (t === "Bash") {
    const x = c.replace(/\s+/g, " ").trim();
    const AT = "(?:^|[;&|]\\s*)"; // command position
    if (new RegExp(AT + "rm\\s+-[a-z]*r[a-z]*f?\\s+(/|~|/\\*|\\./\\*|\\*)(\\s|$)").test(x)) block("refusing rm -rf on a root/home/glob target");
    if (new RegExp(AT + "sudo\\b").test(x)) block("sudo is not available in this environment");
    if (new RegExp(AT + "git\\s+push\\b").test(x) && /(--force\b|(?:^|\s)-f\b)/.test(x) && !/--force-with-lease/.test(x)) block("use git push --force-with-lease, never a bare --force");
    if (/\bcurl\b[^|]*https?:[^|]*\|\s*(sudo\s+)?(ba)?sh\b/.test(x)) block("piping a remote script straight into a shell is refused — download, read, then run");
    if (/:\(\)\s*\{[^}]*\}\s*;\s*:/.test(x)) block("fork-bomb pattern refused");
    if (new RegExp(AT + "(?:cat|tee|cp|mv|dd|echo|printf)\\b[^;&|]*>\\s*[^ ]*\\.(env|sqlite)\\b").test(x)) block("refusing to overwrite a secret/data file via redirect");
  }
  process.exit(0);
});
' 2>/dev/null) || exit 0

if [[ "$decision" == BLOCK:* ]]; then
  echo "pre-tool-use: ${decision#BLOCK: }" >&2
  exit 2
fi
exit 0
