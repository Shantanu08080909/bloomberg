#!/usr/bin/env bash
# One-step switch from demo data to real NSE/BSE end-of-day data.
#
#   bash scripts/real-data.sh            set up, load data, build and start the server
#   bash scripts/real-data.sh --no-start same, but don't start the server
#
# What it does:
#   1. stops a running OpenFinance server (the embedded database allows one process)
#   2. installs dependencies
#   3. in .env.local: MARKET_DATA_SOURCE=auto, EOD_DOWNLOAD_ENABLED=true, TEJ_ARCHIVE_ENABLED=true
#   4. loads NSE and BSE history for the current year from the TejHQ archive (labelled HISTORICAL)
#   5. downloads the latest official daily files from the exchanges (NSE may refuse; that is reported)
#   6. builds and starts the app on port 3000
#
# Personal use only: read docs/EOD_DATA.md (licensing) before sharing the app or the data.
# Safe to run again: imports are idempotent.
set -euo pipefail
cd "$(dirname "$0")/.."

echo "==> Stopping any running OpenFinance server"
pkill -f "next-server" 2>/dev/null || true
pkill -f "next start" 2>/dev/null || true
pkill -f "next dev" 2>/dev/null || true
sleep 2

echo "==> Installing dependencies"
npm install --no-audit --no-fund

[ -f .env.local ] || cp .env.example .env.local
set_var() {
  if grep -q "^$1=" .env.local; then
    sed -i.bak "s|^$1=.*|$1=$2|" .env.local && rm -f .env.local.bak
  else
    printf '\n%s=%s\n' "$1" "$2" >> .env.local
  fi
}
echo "==> Enabling end-of-day data in .env.local"
set_var MARKET_DATA_SOURCE auto
set_var EOD_DOWNLOAD_ENABLED true
set_var TEJ_ARCHIVE_ENABLED true

YEAR="$(date +%Y)"
echo "==> Loading ${YEAR} history from the TejHQ archive (a few minutes)"
npm run --silent eod -- tej --exchange NSE --year "$YEAR" || echo "!! NSE archive import failed; continuing"
npm run --silent eod -- tej --exchange BSE --year "$YEAR" || echo "!! BSE archive import failed; continuing"

echo "==> Downloading the latest official daily files"
npm run --silent eod -- update || echo "!! Official update failed; you can retry later with: npm run eod -- update"

npm run --silent eod -- status || true

if [ "${1:-}" = "--no-start" ]; then
  echo "==> Done. Start the app with: npm run build && npm run start"
  exit 0
fi

echo "==> Building"
npm run build
echo "==> Starting on port 3000 (open it from the Ports tab in Codespaces). Press Ctrl+C to stop."
npm run start
