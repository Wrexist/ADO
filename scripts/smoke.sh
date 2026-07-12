#!/usr/bin/env bash
# scripts/smoke.sh — deterministic visual smoke on the --demo seed.
#
# Boots the server (--demo, deterministic fixture world) + the web app, screenshots
# /command, /ops and /prompts at the canonical 1536px viewport, and FAILS on any console
# error (ops.yml thresholds.console_errors: 0). This is NOT a pixel-diff baseline — those
# wait for the p3.5 visual sign-off, since polish would re-baseline them — but a stable
# render + console-error gate you can run locally or in CI on every change.
#
# Requires .env with ACC_TOKEN and VITE_ACC_TOKEN set to the same value.
# Usage: bash scripts/smoke.sh [outDir]   (default outDir: smoke-shots/, gitignored)
set -uo pipefail
cd "$(dirname "$0")/.."
OUT="${1:-smoke-shots}"

command -v node >/dev/null 2>&1 || { echo "✗ node not found"; exit 1; }
[ -f .env ] || { echo "✗ .env missing — copy .env.example and set ACC_TOKEN + VITE_ACC_TOKEN"; exit 1; }
grep -qE '^ACC_TOKEN=.+' .env || { echo "✗ ACC_TOKEN not set in .env"; exit 1; }
grep -qE '^VITE_ACC_TOKEN=.+' .env || { echo "✗ VITE_ACC_TOKEN not set in .env (must match ACC_TOKEN)"; exit 1; }

free() { command -v fuser >/dev/null 2>&1 && fuser -k -9 "$1"/tcp 2>/dev/null; return 0; }
free 8787; free 5173; sleep 1

npm run start -w @ado/server -- --demo > /tmp/acc-smoke-server.log 2>&1 &
SRV=$!
npm run dev -w @ado/web > /tmp/acc-smoke-web.log 2>&1 &
WEB=$!
trap 'kill $SRV $WEB 2>/dev/null; free 8787; free 5173' EXIT

echo "▶ waiting for server + web…"
for _ in $(seq 1 60); do curl -sf -H 'host: 127.0.0.1:8787' http://127.0.0.1:8787/health >/dev/null 2>&1 && break; sleep 1; done
for _ in $(seq 1 60); do curl -sf http://localhost:5173/ >/dev/null 2>&1 && break; sleep 1; done
sleep 2

echo "▶ capturing /command, /ops, /prompts, /workflows, /automations, /repositories/sentinel, /setup → $OUT/"
node scripts/screenshot.mjs http://localhost:5173 "$OUT" "/command,/ops,/prompts,/workflows,/automations,/repositories/sentinel,/setup"
RC=$?
if [ "$RC" -eq 0 ]; then echo "✅ smoke green (render + zero console errors)"; else echo "✗ smoke failed (rc=$RC) — see /tmp/acc-smoke-*.log"; fi
exit $RC
