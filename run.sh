#!/usr/bin/env bash
# run.sh — the loop runner: one headless Claude Code pass over a task, then verify.
# The harness (.claude/settings.json hooks + skills + the verifier agent) applies
# automatically. Requires the `claude` CLI + auth (npm i -g @anthropic-ai/claude-code).
#
# Usage: ./run.sh "fix the flaky wave-balancing test in sentinel"
#        ./run.sh                # defaults to the top open item in TASK.md
set -euo pipefail
cd "$(dirname "$0")"

TASK="${*:-Pick up the top open item in TASK.md, implement it, then run npm run verify.}"

if ! command -v claude >/dev/null 2>&1; then
  echo "✗ the 'claude' CLI is required — install it with: npm i -g @anthropic-ai/claude-code"
  exit 1
fi

echo "▶ loop: $TASK"
claude -p "$TASK"
echo "▶ verify"
npm run verify
