#!/usr/bin/env bash
# scripts/verify.sh — the single "is it green?" check. Run before reporting any task done.
# Mirrors .claude/ops.yml commands. Phase 6 wires Playwright visual-diff in here too.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "▶ typecheck"
npm run typecheck

echo "▶ lint"
npm run lint

echo "▶ test"
npm test

echo "▶ build"
npm run build

echo ""
echo "✅ verify green"
