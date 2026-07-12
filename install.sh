#!/usr/bin/env bash
# install.sh — bootstrap the LOOPKIT harness in this checkout. Idempotent + safe to re-run.
set -euo pipefail
cd "$(dirname "$0")"

echo "▶ making hooks + scripts executable"
chmod +x .claude/hooks/*.sh run.sh scripts/*.sh 2>/dev/null || true

echo "▶ validating .claude/settings.json + .mcp.json"
node -e 'for (const f of [".claude/settings.json", ".mcp.json"]) JSON.parse(require("fs").readFileSync(f, "utf8")); console.log("  ✓ valid JSON")'

if [ ! -f .env ] && [ -f .env.example ]; then
  cp .env.example .env
  echo "▶ created .env from .env.example — fill in ACC_TOKEN (openssl rand -hex 24) + VITE_ACC_TOKEN"
fi

if command -v npm >/dev/null 2>&1; then
  echo "▶ npm install"
  npm install
fi

echo "✓ harness ready. Next: npm run verify   ·   see README.md and .claude/"
