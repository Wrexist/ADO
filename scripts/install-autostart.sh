#!/usr/bin/env bash
# scripts/install-autostart.sh — make the AI Control Center server start on login.
#   macOS  → installs a launchd LaunchAgent (deploy/launchd/…plist)
#   Linux  → uses pm2 (deploy/pm2.ecosystem.config.cjs) if available
# Idempotent; refuses without .env (ACC_TOKEN is required to boot).
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$(pwd)"

node scripts/bootstrap-env.mjs # ensure .env + a local ACC_TOKEN exist before installing the service
grep -qE '^ACC_TOKEN=.+' .env || { echo "✗ ACC_TOKEN not set in .env."; exit 1; }

OS="$(uname -s)"
case "$OS" in
  Darwin)
    LABEL="com.wrexist.acc.server"
    DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
    mkdir -p "$HOME/Library/LaunchAgents" "$ROOT/data"
    sed "s#__REPO__#$ROOT#g" deploy/launchd/$LABEL.plist > "$DEST"
    launchctl unload "$DEST" 2>/dev/null || true
    launchctl load "$DEST"
    echo "✅ launchd agent installed: $DEST"
    echo "   server autostarts on login; logs in data/acc-server.*.log"
    echo "   stop:   launchctl unload \"$DEST\""
    ;;
  Linux|*)
    if command -v pm2 >/dev/null 2>&1; then
      echo "▶ building web (preview needs a dist/)…"
      npm run build >/dev/null
      pm2 start deploy/pm2.ecosystem.config.cjs
      pm2 save
      echo "✅ pm2 processes started (acc-server + acc-web)."
      echo "   run the command 'pm2 startup' prints, once, to autostart pm2 on login."
    else
      echo "✗ pm2 not found. Install it, then re-run:"
      echo "    npm i -g pm2 && npm run autostart"
      echo "  (or run the server manually with: npm run start -w @ado/server)"
      exit 1
    fi
    ;;
esac
